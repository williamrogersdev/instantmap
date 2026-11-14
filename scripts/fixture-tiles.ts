// Serves fixtures/{z}-{x}-{y}.mvt at /{z}/{x}/{y}.mvt so the Worker can run with no network.
// Usage: bun run scripts/fixture-tiles.ts [port]
const port = Number(process.argv[2] ?? 8799);
const fixtures = new URL("../fixtures/", import.meta.url);

Bun.serve({
  port,
  async fetch(request) {
    const match = new URL(request.url).pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.mvt$/);
    if (!match) return new Response("not found", { status: 404 });
    const file = Bun.file(new URL(`${match[1]}-${match[2]}-${match[3]}.mvt`, fixtures));
    if (!(await file.exists())) return new Response(null, { status: 404 });
    return new Response(file, { headers: { "content-type": "application/vnd.mapbox-vector-tile" } });
  },
});
console.log(`fixture tiles on http://localhost:${port}/{z}/{x}/{y}.mvt`);
