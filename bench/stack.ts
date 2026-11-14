// Starts what a benchmark or profile runs against: a fixture tile server and the Worker under `wrangler dev`,
// with no network dependency. Pass a url to measure something already running instead (a deployment, a preview).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const root = new URL("../", import.meta.url).pathname;

export interface Stack {
  base: string;
  /** True when this process started the Worker; false when measuring a url that was passed in. */
  local: boolean;
  /** The Worker's inspector port, for CPU profiles. Local only. */
  inspectorPort?: number;
  stop(): void;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startStack(url?: string): Promise<Stack> {
  if (url) return { base: url.replace(/\/$/, ""), local: false, stop() {} };
  for (const needed of ["worker/pkg/instantmap_wasm.js", "site/dist/index.html", "packages/instantmap/dist/cdn/instant-map.js"]) {
    if (!(await Bun.file(join(root, needed)).exists())) throw new Error(`${needed} is missing. Run \`bun run build\` first.`);
  }
  const port = Number(process.env.BENCH_PORT ?? 8788);
  const tilePort = Number(process.env.BENCH_TILE_PORT ?? 8789);
  const inspectorPort = Number(process.env.BENCH_INSPECTOR_PORT ?? 9329);
  const children: Bun.Subprocess[] = [];
  const stop = () => {
    for (const child of children) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  };
  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(143);
  });
  const quiet = process.env.BENCH_VERBOSE ? "inherit" : "ignore";
  children.push(Bun.spawn(["bun", "run", "scripts/fixture-tiles.ts", String(tilePort)], { cwd: root, stdout: quiet, stderr: quiet }));
  // A fresh state directory, so nothing cached by an earlier run is counted as a fast render.
  const state = mkdtempSync(join(tmpdir(), "instantmap-bench-state-"));
  children.push(
    Bun.spawn(["bunx", "wrangler", "dev", "--port", String(port), "--inspector-port", String(inspectorPort), "--persist-to", state, "--var", `TILE_URL:http://localhost:${tilePort}/{z}/{x}/{y}.mvt`], {
      cwd: join(root, "worker"),
      stdout: quiet,
      stderr: quiet,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
    }),
  );
  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (children.some((child) => child.exitCode !== null)) break;
    try {
      if ((await fetch(`${base}/health`)).ok) return { base, local: true, inspectorPort, stop };
    } catch {}
    await sleep(400);
  }
  stop();
  throw new Error(`the local Worker did not start on ${base}. Run again with BENCH_VERBOSE=1 to see why.`);
}

export interface Spread {
  median: number;
  p90: number;
  min: number;
}

export function spread(values: number[]): Spread {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { median: NaN, p90: NaN, min: NaN };
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!;
  const round = (value: number) => Math.round(value * 100) / 100;
  return { median: round(at(0.5)), p90: round(at(0.9)), min: round(sorted[0]!) };
}

/** Reads `--name value`, `--name=value` and `--flag` from the command line. */
export function flags(argv = process.argv.slice(2)): { get(name: string): string | undefined; has(name: string): boolean; rest: string[] } {
  const values = new Map<string, string>();
  const rest: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index]!;
    if (!item.startsWith("--")) rest.push(item);
    else if (item.includes("=")) values.set(item.slice(2, item.indexOf("=")), item.slice(item.indexOf("=") + 1));
    else if (argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("--")) values.set(item.slice(2), argv[++index]!);
    else values.set(item.slice(2), "");
  }
  return { get: (name) => values.get(name), has: (name) => values.has(name), rest };
}

/** Finds a Chromium that Playwright has already downloaded, so a run does not depend on the exact Playwright version. */
export function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const pattern = "chromium_headless_shell-*/*/chrome-headless-shell";
  const found = Bun.spawnSync(["sh", "-c", `ls -d $HOME/Library/Caches/ms-playwright/${pattern} $HOME/.cache/ms-playwright/${pattern} 2>/dev/null | tail -1`]).stdout.toString().trim();
  return found || undefined;
}
