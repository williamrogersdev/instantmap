import { initSync, Renderer, tileCamera, tilesFor } from "../pkg/instantmap_wasm.js";
import wasm from "../pkg/instantmap_wasm_bg.wasm";
import regular from "../../fixtures/noto-sans-regular-0-255.pbf";
import medium from "../../fixtures/noto-sans-medium-0-255.pbf";
import italic from "../../fixtures/noto-sans-italic-0-255.pbf";

interface Env {
  TILE_URL: string;
  ASSETS: Fetcher;
}

const MAX_SIZE = 1280;
const MAX_MARKERS = 2000;
const MAX_TILE_ZOOM = 15;
const IMAGE_TTL = 60 * 60 * 24 * 7;
const ORANGE = 0xee7904ff;
const WHITE = 0xffffffff;

let renderer: Renderer | undefined;

function getRenderer(): Renderer {
  if (!renderer) {
    initSync({ module: wasm });
    renderer = new Renderer(new Uint8Array(regular), new Uint8Array(medium), new Uint8Array(italic));
  }
  return renderer;
}

class BadRequest extends Error {}

function number(value: string | null, name: string, min: number, max: number, fallback?: number): number {
  if (value === null || value === "") {
    if (fallback === undefined) throw new BadRequest(`${name} is required`);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new BadRequest(`${name} must be a number from ${min} to ${max}`);
  }
  return parsed;
}

function pair(value: string | null, name: string): [number, number] {
  const parts = (value ?? "").split(",");
  if (parts.length !== 2) throw new BadRequest(`${name} must be longitude,latitude`);
  return [number(parts[0], `${name} longitude`, -180, 180), number(parts[1], `${name} latitude`, -85, 85)];
}

async function fetchTiles(env: Env, ids: Uint32Array) {
  const count = ids.length / 3;
  const responses = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const [z, x, y] = [ids[index * 3], ids[index * 3 + 1], ids[index * 3 + 2]];
      const url = env.TILE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
      const response = await fetch(url, { cf: { cacheTtl: IMAGE_TTL, cacheEverything: true } });
      if (response.status === 404 || response.status === 204) return undefined;
      if (!response.ok) throw new Error(`upstream tile ${z}/${x}/${y} returned ${response.status}`);
      return { id: [z, x, y], bytes: new Uint8Array(await response.arrayBuffer()) };
    }),
  );
  const present = responses.filter((tile): tile is NonNullable<typeof tile> => tile !== undefined && tile.bytes.length > 0);
  const data = new Uint8Array(present.reduce((sum, tile) => sum + tile.bytes.length, 0));
  let offset = 0;
  for (const tile of present) {
    data.set(tile.bytes, offset);
    offset += tile.bytes.length;
  }
  return {
    ids: Uint32Array.from(present.flatMap((tile) => tile.id)),
    lengths: Uint32Array.from(present.map((tile) => tile.bytes.length)),
    data,
  };
}

function parseMarkers(value: string | null): { values: Float64Array; labels: string } {
  if (!value) return { values: new Float64Array(), labels: "" };
  const entries = value.split(";").filter(Boolean);
  if (entries.length > MAX_MARKERS) throw new BadRequest(`at most ${MAX_MARKERS} markers`);
  const values = new Float64Array(entries.length * 7);
  const labels: string[] = [];
  entries.forEach((entry, index) => {
    const [longitude, latitude, label] = entry.split(",");
    const [lng, lat] = pair(`${longitude},${latitude}`, "marker");
    const text = (label ?? "").slice(0, 8).replace(/[\n\r]/g, "");
    values.set([lng, lat, text ? 16 : 5, ORANGE, WHITE, text ? 2.5 : 1.5, WHITE], index * 7);
    labels.push(text);
  });
  return { values, labels: labels.join("\n") };
}

function image(bytes: Uint8Array, png: boolean): Response {
  return new Response(bytes, {
    headers: {
      "content-type": png ? "image/png" : "image/jpeg",
      "cache-control": `public, max-age=${IMAGE_TTL}`,
      "access-control-allow-origin": "*",
      "x-attribution": "© OpenStreetMap contributors, Protomaps",
    },
  });
}

async function renderStatic(url: URL, env: Env): Promise<Response> {
  const [longitude, latitude] = pair(url.searchParams.get("center"), "center");
  const zoom = number(url.searchParams.get("zoom"), "zoom", 0, 18);
  const [width, height] = (url.searchParams.get("size") ?? "640x400").split("x").map((part, index) =>
    number(part, index === 0 ? "width" : "height", 16, MAX_SIZE),
  );
  const ratio = number(url.searchParams.get("r"), "r", 1, 2, 1);
  const png = url.searchParams.get("format") === "png";
  const clusterDistance = number(url.searchParams.get("cluster"), "cluster", 0, 80, 28);
  const markers = parseMarkers(url.searchParams.get("markers"));
  const instance = getRenderer();
  const camera = Float64Array.from([longitude, latitude, zoom, Math.round(width), Math.round(height), Math.round(ratio)]);
  const tiles = await fetchTiles(env, tilesFor(camera));
  const bytes = instance.render(camera, tiles.ids, tiles.lengths, tiles.data, markers.values, markers.labels, clusterDistance, png ? 0 : 85);
  return image(bytes, png);
}

async function renderTile(match: RegExpMatchArray, env: Env): Promise<Response> {
  const [z, x, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ratio = match[4] ? 2 : 1;
  const png = match[5] === "png";
  if (z > MAX_TILE_ZOOM || x >= 2 ** z || y >= 2 ** z) throw new BadRequest("tile out of range");
  const instance = getRenderer();
  const camera = tileCamera(z, x, y, ratio);
  const tiles = await fetchTiles(env, tilesFor(camera));
  const bytes = instance.render(camera, tiles.ids, tiles.lengths, tiles.data, new Float64Array(), "", 0, png ? 0 : 85);
  return image(bytes, png);
}

const TILE_PATH = /^\/tiles\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})(@2x)?\.(jpg|png)$/;

export default {
  async fetch(request, env, context): Promise<Response> {
    const url = new URL(request.url);
    const tile = url.pathname.match(TILE_PATH);
    if (url.pathname !== "/static" && !tile) return env.ASSETS.fetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("method not allowed", { status: 405 });
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = tile ? await renderTile(tile, env) : await renderStatic(url, env);
      context.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch (error) {
      if (error instanceof BadRequest) return new Response(error.message, { status: 400 });
      console.error(error);
      return new Response("render failed", { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
