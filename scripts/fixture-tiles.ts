// Serves fixtures/{z}-{x}-{y}.mvt at /{z}/{x}/{y}.mvt so the Worker can run with no network.
// Usage: bun run scripts/fixture-tiles.ts [port]
// TILE_DELAY_MS makes every answer wait, to imitate a tile source that is far away.
const port = Number(process.argv[2] ?? 8799);
const delay = Number(process.env.TILE_DELAY_MS ?? 0);
const fixtures = new URL("../fixtures/", import.meta.url);
// How many tiles have been asked for, at /__count. A benchmark reads it to see how often the Worker went to the source.
let asked = 0;

Bun.serve({
  port,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/__count") return Response.json(asked);
    const match = pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.mvt$/);
    if (!match) return new Response("not found", { status: 404 });
    asked++;
    if (delay) await Bun.sleep(delay);
    const file = Bun.file(new URL(`${match[1]}-${match[2]}-${match[3]}.mvt`, fixtures));
    if (!(await file.exists())) return new Response(null, { status: 404 });
    return new Response(file, { headers: { "content-type": "application/vnd.mapbox-vector-tile" } });
  },
});
console.log(`fixture tiles on http://localhost:${port}/{z}/{x}/{y}.mvt`);
