// End-to-end smoke test with no network dependency: fixture tile server + local Worker + a real browser.
// Prerequisites: worker/pkg built (./scripts/build-wasm.sh), packages/instantmap built, site/dist built.
// Usage: bun run scripts/e2e.ts
// Env: E2E_PORT (Worker, default 8798), E2E_TILE_PORT (fixture tiles, default 8799), E2E_SKIP_BROWSER=1.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const port = Number(process.env.E2E_PORT ?? 8798);
const tilePort = Number(process.env.E2E_TILE_PORT ?? 8799);
const base = `http://localhost:${port}`;

const children: Bun.Subprocess[] = [];
function killAll() {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}
process.on("SIGINT", () => {
  killAll();
  process.exit(130);
});
process.on("SIGTERM", () => {
  killAll();
  process.exit(143);
});

let current = "startup";
async function check(name: string, run: () => Promise<void> | void) {
  current = name;
  await run();
  console.log(`ok   ${name}`);
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function get(path: string, init?: RequestInit) {
  return fetch(base + path, init);
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const child of children) assert(child.exitCode === null, `a child process exited early (code ${child.exitCode})`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`/health did not answer within 60 s on ${base}`);
}

try {
  await check("start fixture tile server and Worker", async () => {
    children.push(Bun.spawn(["bun", "run", "scripts/fixture-tiles.ts", String(tilePort)], { cwd: root, stdout: "inherit", stderr: "inherit" }));
    // A fresh state directory, so a cache entry left by an earlier run cannot turn the first request into a hit.
    const state = mkdtempSync(join(tmpdir(), "instantmap-e2e-state-"));
    children.push(
      Bun.spawn(["bunx", "wrangler", "dev", "--port", String(port), "--persist-to", state, "--var", `TILE_URL:http://localhost:${tilePort}/{z}/{x}/{y}.mvt`], {
        cwd: join(root, "worker"),
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
      }),
    );
    await waitForHealth();
  });

  await check("/health returns ok JSON", async () => {
    const response = await get("/health");
    assert(response.status === 200, `status ${response.status}`);
    const body = (await response.json()) as { ok?: boolean };
    assert(body.ok === true, `ok was ${JSON.stringify(body.ok)}`);
  });

  await check("tile jpg is rendered (cache miss)", async () => {
    const response = await get("/tiles/12/946/1652.jpg");
    assert(response.status === 200, `status ${response.status}`);
    assert(response.headers.get("content-type") === "image/jpeg", `content-type ${response.headers.get("content-type")}`);
    const bytes = (await response.arrayBuffer()).byteLength;
    assert(bytes > 10000, `body only ${bytes} bytes`);
    assert(response.headers.get("x-instantmap-cache") === "miss", `cache header ${response.headers.get("x-instantmap-cache")}`);
  });

  await check("same tile with a stray query is a cache hit", async () => {
    let last = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await get("/tiles/12/946/1652.jpg?anything=1");
      assert(response.status === 200, `status ${response.status}`);
      last = response.headers.get("x-instantmap-cache") ?? "none";
      await response.arrayBuffer();
      if (last === "hit") return;
      await sleep(300);
    }
    throw new Error(`x-instantmap-cache stayed "${last}"`);
  });

  await check("@2x png tile", async () => {
    const response = await get("/tiles/12/946/1652@2x.png");
    assert(response.status === 200, `status ${response.status}`);
    assert(response.headers.get("content-type") === "image/png", `content-type ${response.headers.get("content-type")}`);
    await response.arrayBuffer();
  });

  await check("/static with a marker", async () => {
    const response = await get("/static?center=-96.8,32.79&zoom=12&size=640x400&markers=-96.8,32.79,A");
    assert(response.status === 200, `status ${response.status}`);
    assert(response.headers.get("content-type") === "image/jpeg", `content-type ${response.headers.get("content-type")}`);
    await response.arrayBuffer();
  });

  await check("/static without zoom is 400", async () => {
    const response = await get("/static?center=0,0");
    assert(response.status === 400, `status ${response.status}`);
    await response.arrayBuffer();
  });

  await check("tile zoom 99 is 400", async () => {
    const response = await get("/tiles/99/0/0.jpg");
    assert(response.status === 400, `status ${response.status}`);
    await response.arrayBuffer();
  });

  await check("POST /static is 405", async () => {
    const response = await get("/static?center=0,0&zoom=1", { method: "POST" });
    assert(response.status === 405, `status ${response.status}`);
    await response.arrayBuffer();
  });

  await check("/instant-map.js is JavaScript", async () => {
    const response = await get("/instant-map.js");
    assert(response.status === 200, `status ${response.status}`);
    assert(/javascript/.test(response.headers.get("content-type") ?? ""), `content-type ${response.headers.get("content-type")}`);
    await response.arrayBuffer();
  });

  if (process.env.E2E_SKIP_BROWSER === "1") {
    console.log("skip browser check (E2E_SKIP_BROWSER=1)");
  } else {
    await check("browser: poster, wake, drag and click", async () => {
      const outDir = process.env.E2E_OUT_DIR ?? mkdtempSync(join(tmpdir(), "instantmap-e2e-"));
      const run = Bun.spawn(["bun", "run", "scripts/verify-page.ts", `${base}/examples/basic.html`, outDir], { cwd: root, stdout: "inherit", stderr: "inherit" });
      const code = await run.exited;
      assert(code === 0, `verify-page exited ${code} (screenshots in ${outDir})`);
    });
  }
  console.log("\ne2e passed");
} catch (error) {
  console.error(`\ne2e FAILED at "${current}": ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  killAll();
  await Promise.all(children.map((child) => Promise.race([child.exited, sleep(5000)])));
  for (const child of children) if (child.exitCode === null) child.kill("SIGKILL");
}
