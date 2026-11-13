import { initSync, Renderer, tileCamera, tilesFor } from "../pkg/instantmap_wasm.js";
import wasm from "../pkg/instantmap_wasm_bg.wasm";
import regular from "../../fixtures/noto-sans-regular-0-255.pbf";
import medium from "../../fixtures/noto-sans-medium-0-255.pbf";
import italic from "../../fixtures/noto-sans-italic-0-255.pbf";
import { decodeColors, paletteWords, resolvePalette, THEMES } from "../../packages/instantmap/src/themes.ts";

interface Env {
  TILE_URL: string;
  ASSETS: Fetcher;
}

const MAX_SIZE = 1280;
const MAX_MARKERS = 2000;
const MAX_TILE_ZOOM = 15;
const MAX_LABEL = 10;
const IMAGE_TTL = 60 * 60 * 24 * 7;
const CORS = { "access-control-allow-origin": "*" };

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
  return [number(parts[0]!, `${name} longitude`, -180, 180), number(parts[1]!, `${name} latitude`, -85.06, 85.06)];
}

function palette(url: URL): Uint32Array {
  const theme = url.searchParams.get("theme") ?? "daylight";
  if (!(theme in THEMES)) throw new BadRequest(`theme must be one of ${Object.keys(THEMES).join(", ")}`);
  return paletteWords(resolvePalette(theme, decodeColors(url.searchParams.get("colors"))));
}

async function fetchTiles(env: Env, ids: Uint32Array) {
  const count = ids.length / 3;
  const responses = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const [z, x, y] = [ids[index * 3]!, ids[index * 3 + 1]!, ids[index * 3 + 2]!];
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

function parseMarkers(url: URL): { values: Float64Array; labels: string } {
  const singles = (url.searchParams.get("markers") ?? "").split(";").filter(Boolean);
  const clusters = (url.searchParams.get("clusters") ?? "").split(";").filter(Boolean);
  if (singles.length + clusters.length > MAX_MARKERS) throw new BadRequest(`at most ${MAX_MARKERS} markers and clusters in total`);
  const values = new Float64Array((singles.length + clusters.length) * 4);
  const labels: string[] = [];
  singles.forEach((entry, index) => {
    const [longitude, latitude, ...rest] = entry.split(",");
    const [lng, lat] = pair(`${longitude},${latitude}`, "marker");
    values.set([lng, lat, 1, 0], index * 4);
    labels.push(rest.join(",").replace(/[\n\r]/g, "").slice(0, MAX_LABEL));
  });
  clusters.forEach((entry, offset) => {
    const [longitude, latitude, count] = entry.split(",");
    const [lng, lat] = pair(`${longitude},${latitude}`, "cluster");
    values.set([lng, lat, Math.round(number(count ?? null, "cluster count", 2, 10_000_000)), 0], (singles.length + offset) * 4);
    labels.push("");
  });
  return { values, labels: labels.join("\n") };
}

function image(bytes: Uint8Array, png: boolean): Response {
  return new Response(bytes, {
    headers: {
      ...CORS,
      "content-type": png ? "image/png" : "image/jpeg",
      "cache-control": `public, max-age=${IMAGE_TTL}, immutable`,
      "x-attribution": "OpenStreetMap contributors, Protomaps",
    },
  });
}

async function renderStatic(url: URL, env: Env): Promise<Response> {
  const [longitude, latitude] = pair(url.searchParams.get("center"), "center");
  const zoom = number(url.searchParams.get("zoom"), "zoom", 0, 18);
  const sizes = (url.searchParams.get("size") ?? "640x400").split("x");
  if (sizes.length !== 2) throw new BadRequest("size must be WIDTHxHEIGHT");
  const width = number(sizes[0]!, "width", 16, MAX_SIZE);
  const height = number(sizes[1]!, "height", 16, MAX_SIZE);
  const ratio = number(url.searchParams.get("r"), "r", 1, 2, 1);
  const format = url.searchParams.get("format") ?? "jpg";
  if (format !== "jpg" && format !== "png") throw new BadRequest("format must be jpg or png");
  const clusterDistance = number(url.searchParams.get("cluster"), "cluster", 0, 120, 44);
  const colors = palette(url);
  const markers = parseMarkers(url);
  const instance = getRenderer();
  const camera = Float64Array.from([longitude, latitude, zoom, Math.round(width), Math.round(height), Math.round(ratio)]);
  const tiles = await fetchTiles(env, tilesFor(camera));
  const bytes = instance.render(camera, tiles.ids, tiles.lengths, tiles.data, colors, markers.values, markers.labels, clusterDistance, format === "png" ? 0 : 86);
  return image(bytes, format === "png");
}

async function renderTile(match: RegExpMatchArray, url: URL, env: Env): Promise<Response> {
  const [z, x, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ratio = match[4] ? 2 : 1;
  const png = match[5] === "png";
  if (z > MAX_TILE_ZOOM || x >= 2 ** z || y >= 2 ** z) throw new BadRequest("tile out of range");
  const colors = palette(url);
  const instance = getRenderer();
  const camera = tileCamera(z, x, y, ratio);
  const tiles = await fetchTiles(env, tilesFor(camera));
  const bytes = instance.render(camera, tiles.ids, tiles.lengths, tiles.data, colors, new Float64Array(), "", 0, png ? 0 : 86);
  return image(bytes, png);
}

const RENDERER_VERSION = "4";

const fingerprint = (text: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
};

const CACHE_VERSION = `${RENDERER_VERSION}.${fingerprint(JSON.stringify(THEMES))}`;

const TILE_PATH = /^\/tiles\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})(@2x)?\.(jpg|png)$/;

export default {
  async fetch(request, env, context): Promise<Response> {
    const url = new URL(request.url);
    const tile = url.pathname.match(TILE_PATH);
    if (url.pathname !== "/static" && !tile) return env.ASSETS.fetch(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-methods": "GET, HEAD" } });
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("method not allowed", { status: 405, headers: CORS });
    const cache = caches.default;
    const cacheUrl = new URL(url);
    cacheUrl.searchParams.set("_v", CACHE_VERSION);
    const cacheKey = new Request(cacheUrl, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    try {
      const response = tile ? await renderTile(tile, url, env) : await renderStatic(url, env);
      if (request.method === "GET") context.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      if (error instanceof BadRequest) return new Response(error.message, { status: 400, headers: { ...CORS, "content-type": "text/plain; charset=utf-8" } });
      console.error(error);
      return new Response("render failed", { status: 502, headers: CORS });
    }
  },
} satisfies ExportedHandler<Env>;
