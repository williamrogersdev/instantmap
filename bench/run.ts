// Runs the benchmarks and writes one JSON file with everything measured.
//
//   bun run bench                              everything, against a local Worker with fixture tiles
//   bun run bench --quick                      a short run: two visits, desktop and mid-range phone
//   bun run bench --only renderer,server       pick the parts: renderer, server, browser
//   bun run bench --url https://example.com    measure a deployment instead of the local Worker
//   bun run bench --browsers all               chromium, firefox and webkit (default: chromium)
//   bun run bench --profiles desktop,phone-low pick device profiles (default: all)
//   bun run bench --runs 9                     visits per browser and profile (default 5)
//   bun run bench --source-delay 150           make the local tile source answer after 150 ms, like a distant one
//   bun run bench --publish                    also write bench/results/published.json, which the site shows
//   bun run bench --markdown summary.md        also write the tables as Markdown
import { cpus, totalmem } from "node:os";
import { join } from "node:path";
import { type BrowserResult, ENGINES, type Engine, runBrowser } from "./browser.ts";
import { PROFILES, profileNamed } from "./profiles.ts";
import { runServer, type ServerResult } from "./server.ts";
import { flags, root, type Spread, startStack } from "./stack.ts";

export interface RendererScene {
  name: string;
  width: number;
  height: number;
  pixelRatio: number;
  tiles: number;
  markers: number;
  decodeMs: Spread;
  renderMs: Spread;
  jpegMs: Spread;
  pngMs: Spread;
  totalJpegMs: Spread;
  jpegBytes: number;
  pngBytes: number;
}

export interface Results {
  schema: 1;
  date: string;
  commit: string;
  version: string;
  /** "local" for the Worker started by the benchmark, otherwise the address that was measured. */
  target: string;
  machine: { os: string; arch: string; cpu: string; cores: number; memoryGb: number };
  /** Gzipped bytes of the script-tag build. */
  sizes?: { upfront: number; engine: number };
  profiles: { name: string; description: string }[];
  renderer?: { iterations: number; scenes: RendererScene[] };
  /** Milliseconds the local tile source waited before each answer. Absent when it answered at once. */
  sourceDelayMs?: number;
  server?: ServerResult[];
  browser?: BrowserResult[];
}

const options = flags();
if (options.has("help")) {
  console.log((await Bun.file(import.meta.path).text()).split("\nimport")[0]!.replace(/^\/\/ ?/gm, ""));
  process.exit(0);
}
const quick = options.has("quick");
const parts = new Set((options.get("only") ?? "renderer,server,browser").split(","));
const runs = Number(options.get("runs") ?? (quick ? 2 : 5));
const browsers = options.get("browsers") ?? "chromium";
const engines = (browsers === "all" ? ENGINES : browsers.split(",")) as Engine[];
const profiles = (options.get("profiles")?.split(",") ?? (quick ? ["desktop", "phone-mid"] : PROFILES.map((profile) => profile.name))).map(profileNamed);
const log = (line: string) => console.error(`  ${line}`);
const skipped: Engine[] = [];

const shell = (command: string[]): string => Bun.spawnSync(command, { cwd: root }).stdout.toString().trim();
const results: Results = {
  schema: 1,
  date: new Date().toISOString().slice(0, 10),
  commit: shell(["git", "rev-parse", "--short", "HEAD"]),
  version: ((await Bun.file(join(root, "packages/instantmap/package.json")).json()) as { version: string }).version,
  target: options.get("url") ?? "local",
  machine: { os: `${process.platform}`, arch: process.arch, cpu: cpus()[0]?.model ?? "unknown", cores: cpus().length, memoryGb: Math.round(totalmem() / 2 ** 30) },
  profiles: profiles.map(({ name, description }) => ({ name, description })),
};
const sizes = Bun.file(join(root, "packages/instantmap/dist/cdn/sizes.json"));
if (await sizes.exists()) {
  const { upfront, engine } = (await sizes.json()) as { upfront: number; engine: number };
  results.sizes = { upfront, engine };
}

if (parts.has("renderer")) {
  console.error("renderer (native build of the Rust renderer)");
  const run = Bun.spawnSync(["cargo", "run", "--release", "--quiet", "-p", "instantmap-render", "--example", "bench", "--", "--json", "--iterations", String(quick ? 10 : 30)], { cwd: root, stderr: "inherit" });
  if (run.exitCode !== 0) throw new Error("the renderer benchmark failed");
  results.renderer = JSON.parse(run.stdout.toString()) as Results["renderer"];
  for (const scene of results.renderer!.scenes) log(`${scene.name}: ${scene.totalJpegMs.median} ms to a JPEG of ${(scene.jpegBytes / 1024).toFixed(1)} KB`);
}

const sourceDelay = Number(options.get("source-delay") ?? 0);
if (sourceDelay && !options.get("url")) {
  process.env.TILE_DELAY_MS = String(sourceDelay);
  results.sourceDelayMs = sourceDelay;
}

if (parts.has("server") || parts.has("browser")) {
  const stack = await startStack(options.get("url"));
  try {
    if (parts.has("server")) {
      console.error(`server (${stack.local ? "local Worker, fixture tiles" : stack.base})`);
      results.server = await runServer(stack.base, { runs: Math.max(runs, 5), log, sourceRequests: stack.sourceRequests });
    }
    if (parts.has("browser")) {
      console.error(`browser (${engines.join(", ")}; ${runs} visits each)`);
      results.browser = await runBrowser(stack.base, { engines, profiles, runs, log, skipped });
    }
  } finally {
    stack.stop();
  }
}

const out = options.get("out") ?? join(root, "bench/results/latest.json");
await Bun.write(out, `${JSON.stringify(results, null, 2)}\n`);
console.error(`\nwrote ${out}`);
if (options.has("publish")) {
  if (results.target !== "local" || parts.size < 3 || skipped.length || sourceDelay) console.error("not published: only a full local run with every requested browser is published, so the published numbers are always comparable");
  else {
    await Bun.write(join(root, "bench/results/published.json"), `${JSON.stringify(results, null, 2)}\n`);
    console.error("wrote bench/results/published.json (commit it to publish on the site)");
  }
}

const markdown = toMarkdown(results);
if (options.get("markdown")) await Bun.write(options.get("markdown")!, markdown);
console.log(markdown);
process.exit(0);

export function toMarkdown(data: Results): string {
  const lines: string[] = [`Instant Map ${data.version} (${data.commit}), ${data.date}, ${data.machine.cpu}, target: ${data.target}`, ""];
  const table = (head: string[], rows: (string | number)[][]) => {
    lines.push(`| ${head.join(" | ")} |`, `| ${head.map((_, index) => (index ? "---:" : "---")).join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`), "");
  };
  const ms = (value?: Spread) => (value && Number.isFinite(value.median) ? String(Math.round(value.median * 10) / 10) : "n/a");
  if (data.renderer) {
    lines.push("**Renderer** (native, median ms)", "");
    table(
      ["scene", "pixels", "decode", "draw", "JPEG", "total", "JPEG KB"],
      data.renderer.scenes.map((scene) => [scene.name, `${scene.width * scene.pixelRatio}×${scene.height * scene.pixelRatio}`, ms(scene.decodeMs), ms(scene.renderMs), ms(scene.jpegMs), ms(scene.totalJpegMs), (scene.jpegBytes / 1024).toFixed(1)]),
    );
  }
  if (data.server) {
    lines.push("**Image service** (median ms over HTTP)", "");
    table(
      ["request", "first", "repeat", "KB"],
      data.server.map((item) => [item.name, ms(item.firstMs), ms(item.repeatMs), (item.bytes / 1024).toFixed(1)]),
    );
  }
  if (data.browser?.length) {
    lines.push("**Browser** (median of each visit)", "");
    const columns: [string, string][] = [
      ["first image ms", "firstImageMs"],
      ["script ms to first image", "loadScriptMs"],
      ["wake ms", "wakeMs"],
      ["drag frame p95 ms", "dragFrameP95Ms"],
      ["drag main thread ms per frame", "dragMainThreadMsPerFrame"],
      ["zoom frame p95 ms", "zoomFrameP95Ms"],
      ["10,000 markers ms", "markers10000Ms"],
      ["blocking ms", "totalBlockingMs"],
      ["heap MB", "heapMb"],
    ];
    table(
      ["browser", "profile", ...columns.map(([label]) => label)],
      data.browser.map((item) => [item.browser, item.profile, ...columns.map(([, key]) => ms(item.metrics[key]))]),
    );
  }
  return lines.join("\n");
}
