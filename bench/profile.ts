// Records a profile of one part of the system and prints where the time went.
//
//   bun run profile browser                         the whole visit in Chromium (load, wake, drag, zoom, markers)
//   bun run profile browser --scenario drag         one step: load, wake, drag, zoom, markers or visit
//   bun run profile browser --device phone-low      under a device profile (see bench/profiles.ts)
//   bun run profile browser --url https://…         against a deployment instead of the local Worker
//   bun run profile browser --as-shipped            profile the minified build (default: readable function names)
//   bun run profile worker                          the Worker drawing uncached pictures (local only)
//   bun run profile renderer                        the native renderer, with samply, Instruments or perf
//   bun run profile renderer --scene static-city-2x --seconds 8
//
// Files are written to bench/profiles/. Open a .cpuprofile in Chrome DevTools (Performance, Load profile),
// in VS Code, or at https://www.speedscope.app. Open a .trace.json in Chrome DevTools (Performance) for frames,
// layout and paint as well as script.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drag, launch, load, open, type Session, setMarkers, visit, wake, zoom } from "./browser.ts";
import { profileNamed } from "./profiles.ts";
import { flags, root, sleep, startStack } from "./stack.ts";

interface CpuProfile {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }[];
  samples?: number[];
  timeDeltas?: number[];
  startTime: number;
  endTime: number;
}

/** The functions with the most time spent in their own code, which is where an optimisation has to land. */
function summarise(profile: CpuProfile, top = 15): string {
  const own = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  samples.forEach((id, index) => own.set(id, (own.get(id) ?? 0) + (deltas[index] ?? 0)));
  const byFunction = new Map<string, number>();
  let total = 0;
  let idle = 0;
  for (const node of profile.nodes) {
    const micros = own.get(node.id) ?? 0;
    total += micros;
    const name = node.callFrame.functionName || "(anonymous)";
    if (name === "(idle)" || name === "(program)") {
      idle += micros;
      continue;
    }
    const file = node.callFrame.url.split("/").pop()?.split("?")[0] ?? "";
    const key = `${name}${file ? `  ${file}:${node.callFrame.lineNumber + 1}` : ""}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + micros);
  }
  const busy = total - idle;
  const rows = [...byFunction.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  const lines = [`${(busy / 1000).toFixed(1)} ms of work in ${(total / 1000).toFixed(0)} ms recorded. Own time by function:`];
  for (const [name, micros] of rows) lines.push(`  ${(micros / 1000).toFixed(1).padStart(8)} ms  ${((micros / Math.max(1, busy)) * 100).toFixed(1).padStart(5)}%  ${name}`);
  return lines.join("\n");
}

/** Builds the script-tag bundle without minifying and serves it in place of the shipped one, so profiles show real names. */
async function serveReadableBuild(session: Session): Promise<void> {
  const outdir = join(tmpdir(), `instantmap-readable-${process.pid}`);
  const built = await Bun.build({
    entrypoints: [join(root, "packages/instantmap/src/cdn.ts")],
    outdir,
    target: "browser",
    format: "esm",
    minify: false,
    splitting: true,
    naming: { entry: "instant-map.js", chunk: "im/[hash].js" },
    define: { INSTANT_MAP_FROM_SCRIPT: "true" },
  });
  if (!built.success) throw new AggregateError(built.logs, "the readable build failed");
  const serve = (file: string) => async (route: import("playwright").Route) => route.fulfill({ contentType: "text/javascript", body: await Bun.file(join(outdir, file)).text() });
  await session.page.route("**/instant-map.js", serve("instant-map.js"));
  await session.page.route("**/im/*.js", (route) => serve(`im/${new URL(route.request().url()).pathname.split("/").pop()}`)(route));
}

async function profileBrowser(options: ReturnType<typeof flags>, outDir: string): Promise<void> {
  const scenario = options.get("scenario") ?? "visit";
  const device = profileNamed(options.get("device") ?? "desktop");
  const stack = await startStack(options.get("url"));
  const browser = await launch("chromium");
  try {
    const session = await open(browser, "chromium", device);
    const cdp = session.cdp!;
    if (!options.has("as-shipped")) await serveReadableBuild(session);
    // Get to the point where the step under study starts, without recording the steps before it.
    const note = (line: string) => console.error(`  ${line}`);
    if (scenario !== "load" && scenario !== "visit") {
      note("loading the page");
      await load(session, stack.base);
    }
    if (scenario === "drag" || scenario === "zoom" || scenario === "markers") {
      note("waking the map");
      await wake(session);
    }
    note(`recording: ${scenario}`);
    const steps: Record<string, () => Promise<unknown>> = {
      visit: () => visit(session, stack.base),
      load: () => load(session, stack.base),
      wake: () => wake(session),
      drag: async () => {
        for (let pass = 0; pass < 3; pass++) await drag(session);
      },
      zoom: () => zoom(session),
      markers: async () => {
        for (const count of [2000, 10000, 2000, 10000]) await setMarkers(session, count);
      },
    };
    const step = steps[scenario];
    if (!step) throw new Error(`no scenario "${scenario}". Choose from: ${Object.keys(steps).join(", ")}`);
    const name = `browser-${scenario}-${device.name}`;
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await browser.startTracing(session.page, { path: join(outDir, `${name}.trace.json`), categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "v8.execute", "blink.user_timing", "loading", "latencyInfo"] });
    await cdp.send("Profiler.start");
    const measured = await step();
    note("saving");
    const { profile } = (await cdp.send("Profiler.stop")) as unknown as { profile: CpuProfile };
    await browser.stopTracing();
    await Bun.write(join(outDir, `${name}.cpuprofile`), JSON.stringify(profile));
    console.log(`${scenario} on ${device.description}\n`);
    console.log(summarise(profile));
    if (measured && typeof measured === "object") console.log(`\nMeasured: ${JSON.stringify(measured, (_, value) => (typeof value === "number" ? Math.round(value * 10) / 10 : value))}`);
    console.log(`\nSaved ${join(outDir, `${name}.cpuprofile`)}\n      ${join(outDir, `${name}.trace.json`)}`);
  } finally {
    await browser.close();
    stack.stop();
  }
}

/** Speaks the inspector protocol to the local Worker, the way Chrome DevTools does. */
async function profileWorker(options: ReturnType<typeof flags>, outDir: string): Promise<void> {
  if (options.get("url")) throw new Error("a deployed Worker cannot be profiled from outside; profile the local one");
  const stack = await startStack();
  try {
    const targets = (await (await fetch(`http://127.0.0.1:${stack.inspectorPort}/json`)).json()) as { webSocketDebuggerUrl: string }[];
    const socket = new WebSocket(targets[0]!.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error("could not connect to the Worker's inspector"));
    });
    let next = 0;
    const waiting = new Map<number, (result: unknown) => void>();
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
      if (message.id !== undefined) waiting.get(message.id)?.(message.result);
    };
    const send = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
      new Promise((resolve) => {
        const id = ++next;
        waiting.set(id, resolve as (result: unknown) => void);
        socket.send(JSON.stringify({ id, method, params }));
      });
    // The first request starts the renderer; keep that out of the profile.
    await fetch(`${stack.base}/tiles/9/117/206.jpg`).then((response) => response.arrayBuffer());
    await send("Profiler.enable");
    await send("Profiler.setSamplingInterval", { interval: 200 });
    await send("Profiler.start");
    const requests = Number(options.get("requests") ?? 24);
    const themes = ["daylight", "midnight", "paper", "mono"];
    for (let index = 0; index < requests; index++) {
      const tile = `/tiles/12/${945 + (index % 3)}/${1651 + (Math.floor(index / 3) % 3)}@2x.jpg?theme=${themes[Math.floor(index / 9) % themes.length]}`;
      const picture = `/static?center=${(-96.8 + index * 1e-6).toFixed(6)},32.79&zoom=12&size=960x540&r=2`;
      await fetch(stack.base + (index % 2 ? picture : tile)).then((response) => response.arrayBuffer());
    }
    await sleep(100);
    const { profile } = await send<{ profile: CpuProfile }>("Profiler.stop");
    socket.close();
    const file = join(outDir, "worker-render.cpuprofile");
    await Bun.write(file, JSON.stringify(profile));
    console.log(`${requests} uncached pictures drawn by the local Worker\n`);
    console.log(summarise(profile));
    console.log(`\nSaved ${file}`);
    console.log("Time inside the renderer shows as WebAssembly functions. For names and lines inside it, run: bun run profile renderer");
  } finally {
    stack.stop();
  }
}

async function profileRenderer(options: ReturnType<typeof flags>, outDir: string): Promise<void> {
  const scene = options.get("scene") ?? "tile-city-2x";
  const seconds = options.get("seconds") ?? "6";
  const build = Bun.spawnSync(["cargo", "build", "--profile", "profiling", "-p", "instantmap-render", "--example", "bench"], { cwd: root, stdout: "inherit", stderr: "inherit" });
  if (build.exitCode !== 0) throw new Error("the profiling build failed");
  const binary = join(root, "target/profiling/examples/bench");
  const run = [binary, "--scene", scene, "--seconds", seconds];
  const has = (tool: string) => Bun.spawnSync(["sh", "-c", `command -v ${tool}`]).exitCode === 0;
  const spawn = (command: string[]) => Bun.spawnSync(command, { cwd: root, stdout: "inherit", stderr: "inherit" }).exitCode;
  console.log(`Phase times for ${scene} (ms):\n`);
  spawn([binary, "--scene", scene, "--iterations", "20"]);
  console.log("");
  if (has("samply")) {
    const file = join(outDir, `renderer-${scene}.samply.json.gz`);
    if (spawn(["samply", "record", "--save-only", "-o", file, "--", ...run]) !== 0) throw new Error("samply failed");
    console.log(`\nSaved ${file}\nOpen it with: samply load ${file}`);
  } else if (process.platform === "darwin" && has("xctrace")) {
    const file = join(outDir, `renderer-${scene}.trace`);
    Bun.spawnSync(["sh", "-c", `[ -e "${file}" ] && mv "${file}" "${file}.${Date.now()}.old"`]);
    if (spawn(["xctrace", "record", "--template", "Time Profiler", "--output", file, "--launch", "--", ...run]) !== 0) throw new Error("xctrace failed");
    console.log(`\nSaved ${file}\nOpen it with: open ${file}   (Instruments)\nFor a flame graph in the browser instead, install samply: cargo install samply`);
  } else if (process.platform === "linux" && has("perf")) {
    const file = join(outDir, `renderer-${scene}.perf.data`);
    if (spawn(["perf", "record", "-g", "-o", file, "--", ...run]) !== 0) throw new Error("perf failed");
    console.log(`\nSaved ${file}\nRead it with: perf report -i ${file}`);
  } else {
    console.log("No sampling profiler found. Install one, then run this again:\n  cargo install samply");
  }
}

const options = flags();
const target = options.rest[0];
const outDir = options.get("out") ?? join(root, "bench/profiles");
mkdirSync(outDir, { recursive: true });
if (target === "browser") await profileBrowser(options, outDir);
else if (target === "worker") await profileWorker(options, outDir);
else if (target === "renderer") await profileRenderer(options, outDir);
else {
  console.log((await Bun.file(import.meta.path).text()).split("\nimport")[0]!.replace(/^\/\/ ?/gm, ""));
  process.exit(target ? 2 : 0);
}
process.exit(0);
