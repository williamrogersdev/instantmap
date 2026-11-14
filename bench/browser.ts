// Drives the map in a real browser and measures what a visitor would feel: how soon the first image shows,
// what waking the map costs, how smooth dragging and zooming are, and how much script time and memory it takes.
// The steps are exported one by one so bench/profile.ts can record a profile around any of them.
import { type Browser, type BrowserContext, type CDPSession, chromium, firefox, type Page, webkit } from "playwright";
import type { DeviceProfile } from "./profiles.ts";
import { chromiumPath, sleep, type Spread, spread } from "./stack.ts";

export type Engine = "chromium" | "firefox" | "webkit";
export const ENGINES: Engine[] = ["chromium", "firefox", "webkit"];

export interface Session {
  engine: Engine;
  context: BrowserContext;
  page: Page;
  /** Chromium only: CPU and network limits, script time and heap size come from here. */
  cdp?: CDPSession;
}

interface MapElement extends HTMLElement {
  markers: unknown[];
  whenIdle(): Promise<void>;
}

interface BenchWindow extends Window {
  benchMarkers(count: number): unknown[];
  __bench: { longTasks: number; blockingMs: number; lcp: number; fcp: number; frames: number[]; recording: boolean; firstInput: number; interactive: number };
}

export async function launch(engine: Engine): Promise<Browser> {
  if (engine === "chromium") {
    const path = chromiumPath();
    return chromium.launch(path ? { executablePath: path } : {});
  }
  return (engine === "firefox" ? firefox : webkit).launch();
}

/** A fresh context, so nothing is cached from an earlier run, with the profile's limits applied. */
export async function open(browser: Browser, engine: Engine, profile: DeviceProfile): Promise<Session> {
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.pixelRatio });
  const page = await context.newPage();
  let cdp: CDPSession | undefined;
  if (engine === "chromium") {
    cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    if (profile.cpuSlowdown > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuSlowdown });
    if (profile.network) {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: profile.network.latencyMs,
        downloadThroughput: (profile.network.downloadKbps * 1000) / 8,
        uploadThroughput: (profile.network.uploadKbps * 1000) / 8,
      });
    }
  }
  await page.addInitScript(() => {
    const bench = { longTasks: 0, blockingMs: 0, lcp: 0, fcp: 0, frames: [] as number[], recording: false, firstInput: 0, interactive: 0 };
    (window as unknown as { __bench: typeof bench }).__bench = bench;
    const watch = (type: string, read: (entry: PerformanceEntry) => void) => {
      try {
        new PerformanceObserver((list) => list.getEntries().forEach(read)).observe({ type, buffered: true });
      } catch {}
    };
    watch("longtask", (entry) => {
      bench.longTasks++;
      bench.blockingMs += Math.max(0, entry.duration - 50);
    });
    watch("largest-contentful-paint", (entry) => (bench.lcp = entry.startTime));
    watch("paint", (entry) => {
      if (entry.name === "first-contentful-paint") bench.fcp = entry.startTime;
    });
  });
  return { engine, context, page, cdp };
}

async function cdpMetric(session: Session, name: string): Promise<number> {
  if (!session.cdp) return NaN;
  const { metrics } = await session.cdp.send("Performance.getMetrics");
  return metrics.find((metric) => metric.name === name)?.value ?? NaN;
}

const centre = async (page: Page) => {
  const size = page.viewportSize()!;
  return { x: size.width / 2, y: size.height / 2 };
};

/** Opens the benchmark page with nothing cached and waits for the first map image to be on screen. */
export async function load(session: Session, base: string, markers = 400) {
  const { page } = session;
  await page.goto(`${base}/examples/bench.html?markers=${markers}`, { waitUntil: "load" });
  const firstImageMs = await page.evaluate(async () => {
    const map = document.getElementById("map")!;
    let image = map.querySelector("img");
    while (!image) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      image = map.querySelector("img");
    }
    if (!image.complete || !image.naturalWidth) await new Promise((resolve) => image!.addEventListener("load", resolve, { once: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return performance.now();
  });
  const seen = await page.evaluate(() => {
    const bench = (window as unknown as BenchWindow).__bench;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const scripts = resources.filter((entry) => entry.initiatorType === "script" || entry.name.endsWith(".js"));
    return {
      fcp: bench.fcp,
      lcp: bench.lcp,
      blockingMs: bench.blockingMs,
      requests: resources.length + 1,
      scriptKb: scripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0) / 1024,
      imageKb: resources.filter((entry) => entry.initiatorType === "img").reduce((sum, entry) => sum + entry.encodedBodySize, 0) / 1024,
    };
  });
  return {
    firstImageMs,
    firstContentfulPaintMs: seen.fcp || NaN,
    largestContentfulPaintMs: seen.lcp || NaN,
    loadRequests: seen.requests,
    loadScriptKb: seen.scriptKb,
    firstImageKb: seen.imageKb,
    loadScriptMs: (await cdpMetric(session, "ScriptDuration")) * 1000,
    loadBlockingMs: seen.blockingMs,
  };
}

/** Moves the pointer over the map, which loads the engine, and waits until the live map has finished drawing. */
export async function wake(session: Session) {
  const { page } = session;
  await page.evaluate(() => {
    const bench = (window as unknown as BenchWindow).__bench;
    const map = document.getElementById("map")!;
    document.addEventListener("pointermove", () => (bench.firstInput ||= performance.now()), { capture: true, once: true });
    if (map.hasAttribute("interactive")) bench.interactive = performance.now();
    else map.addEventListener("interactive", () => (bench.interactive = performance.now()), { once: true });
  });
  const point = await centre(page);
  await page.mouse.move(point.x - 20, point.y - 20);
  await page.mouse.move(point.x, point.y);
  return page.evaluate(async () => {
    const bench = (window as unknown as BenchWindow).__bench;
    const map = document.getElementById("map") as MapElement;
    const deadline = performance.now() + 20000;
    while (!bench.interactive && performance.now() < deadline) await new Promise((resolve) => requestAnimationFrame(resolve));
    if (!bench.interactive) throw new Error("the map did not become interactive within 20 s");
    await map.whenIdle();
    return { wakeMs: bench.interactive - bench.firstInput, wakeToIdleMs: performance.now() - bench.firstInput };
  });
}

async function recordFrames(page: Page, on: boolean) {
  return page.evaluate((start) => {
    const bench = (window as unknown as BenchWindow).__bench;
    if (!start) {
      bench.recording = false;
      return bench.frames.slice(1);
    }
    bench.frames = [];
    bench.recording = true;
    let last = performance.now();
    const tick = (now: number) => {
      bench.frames.push(now - last);
      last = now;
      if (bench.recording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return [];
  }, on);
}

function frameStats(frames: number[]) {
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? NaN;
  // A frame is counted as slow when it took more than one and a half 60 Hz intervals.
  return { median: at(0.5), p95: at(0.95), slowPercent: frames.length ? (frames.filter((frame) => frame > 25).length / frames.length) * 100 : NaN };
}

const settle = (page: Page) =>
  page.evaluate(async () => {
    const started = performance.now();
    await (document.getElementById("map") as MapElement).whenIdle();
    return performance.now() - started;
  });

/** Drags the map across the screen at one pointer event per frame and records every frame. */
export async function drag(session: Session) {
  const { page } = session;
  const point = await centre(page);
  const distance = Math.min(point.x, point.y) * 0.8;
  await page.mouse.move(point.x, point.y);
  const busyBefore = await cdpMetric(session, "TaskDuration");
  await recordFrames(page, true);
  await page.mouse.down();
  const steps = 45;
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(point.x - (distance * step) / steps, point.y - (distance * 0.5 * step) / steps);
    await sleep(16);
  }
  await page.mouse.up();
  const recorded = await recordFrames(page, false);
  const frames = frameStats(recorded);
  // Frame times stop at the screen's refresh rate, so they cannot show headroom. Main-thread time per frame can.
  const dragMainThreadMsPerFrame = (((await cdpMetric(session, "TaskDuration")) - busyBefore) * 1000) / Math.max(1, recorded.length);
  return { dragFrameMs: frames.median, dragFrameP95Ms: frames.p95, dragSlowFramesPercent: frames.slowPercent, dragMainThreadMsPerFrame, dragSettleMs: await settle(page) };
}

/** Zooms in three levels with the wheel and waits for the new tiles. */
export async function zoom(session: Session) {
  const { page } = session;
  const point = await centre(page);
  await page.mouse.move(point.x, point.y);
  const busyBefore = await cdpMetric(session, "TaskDuration");
  await recordFrames(page, true);
  for (let step = 0; step < 9; step++) {
    await page.mouse.wheel(0, -120);
    await sleep(50);
  }
  await sleep(250);
  const recorded = await recordFrames(page, false);
  const frames = frameStats(recorded);
  const zoomMainThreadMsPerFrame = (((await cdpMetric(session, "TaskDuration")) - busyBefore) * 1000) / Math.max(1, recorded.length);
  return { zoomFrameMs: frames.median, zoomFrameP95Ms: frames.p95, zoomSlowFramesPercent: frames.slowPercent, zoomMainThreadMsPerFrame, zoomSettleMs: await settle(page) };
}

/** Replaces the markers and waits until they are drawn. */
export async function setMarkers(session: Session, count: number): Promise<number> {
  return session.page.evaluate(async (wanted) => {
    const map = document.getElementById("map") as MapElement;
    const markers = (window as unknown as BenchWindow).benchMarkers(wanted);
    const started = performance.now();
    map.markers = markers;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - started;
  }, count);
}

export async function totals(session: Session) {
  if (session.cdp) await session.cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const blocking = await session.page.evaluate(() => (window as unknown as BenchWindow).__bench.blockingMs);
  return {
    totalScriptMs: (await cdpMetric(session, "ScriptDuration")) * 1000,
    totalBlockingMs: blocking,
    heapMb: (await cdpMetric(session, "JSHeapUsedSize")) / 1024 / 1024,
  };
}

/** One full visit: load, wake, drag, zoom, then 2,000 and 10,000 markers. */
export async function visit(session: Session, base: string): Promise<Record<string, number>> {
  const loaded = await load(session, base);
  const woken = await wake(session);
  const dragged = await drag(session);
  const zoomed = await zoom(session);
  const markers2000Ms = await setMarkers(session, 2000);
  const markers10000Ms = await setMarkers(session, 10000);
  return { ...loaded, ...woken, ...dragged, ...zoomed, markers2000Ms, markers10000Ms, ...(await totals(session)) };
}

export interface BrowserResult {
  browser: Engine;
  browserVersion: string;
  profile: string;
  runs: number;
  metrics: Record<string, Spread>;
}

export async function runBrowser(base: string, options: { engines: Engine[]; profiles: DeviceProfile[]; runs: number; log?: (line: string) => void; skipped?: Engine[] }): Promise<BrowserResult[]> {
  const results: BrowserResult[] = [];
  for (const engine of options.engines) {
    let browser: Browser;
    try {
      browser = await launch(engine);
    } catch (error) {
      options.log?.(`skipped ${engine}: it is not installed (bunx playwright install ${engine}). ${String(error).split("\n")[0]}`);
      options.skipped?.push(engine);
      continue;
    }
    try {
      for (const profile of options.profiles) {
        // CPU and network limits only exist in Chromium, so a throttled profile elsewhere would be mislabelled.
        if (engine !== "chromium" && (profile.cpuSlowdown > 1 || profile.network)) continue;
        const samples: Record<string, number>[] = [];
        // One visit that is not counted, so the image service has every picture cached, as a service in use does.
        // The counted visits still start with an empty browser cache.
        for (let run = -1; run < options.runs; run++) {
          const session = await open(browser, engine, profile);
          try {
            const sample = await visit(session, base);
            if (run >= 0) samples.push(sample);
          } finally {
            await session.context.close();
          }
        }
        const metrics: Record<string, Spread> = {};
        for (const name of Object.keys(samples[0] ?? {})) {
          const values = samples.map((sample) => sample[name]!).filter((value) => Number.isFinite(value));
          if (values.length) metrics[name] = spread(values);
        }
        results.push({ browser: engine, browserVersion: browser.version(), profile: profile.name, runs: options.runs, metrics });
        options.log?.(`${engine} ${profile.name}: first image ${metrics.firstImageMs?.median} ms, wake ${metrics.wakeMs?.median} ms, drag frame p95 ${metrics.dragFrameP95Ms?.median} ms`);
      }
    } finally {
      await browser.close();
    }
  }
  return results;
}
