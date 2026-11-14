import { initSync, Renderer, tileCamera, tilesFor } from "../pkg/instantmap_wasm.js";
import wasm from "../pkg/instantmap_wasm_bg.wasm";
import regular from "../../fixtures/noto-sans-regular-0-255.pbf";
import medium from "../../fixtures/noto-sans-medium-0-255.pbf";
import italic from "../../fixtures/noto-sans-italic-0-255.pbf";
import { THEMES } from "../../packages/instantmap/src/themes.ts";
import { BadRequest, cacheKey, fingerprint, jpegQuality, type MapRequest, parseRequest } from "./params.ts";

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  /** Vector tile source, Protomaps schema: https://example.com/{z}/{x}/{y}.mvt */
  TILE_URL: string;
  ASSETS: Fetcher;
  /** Optional. An R2 bucket that keeps rendered tiles, so each is drawn once for the whole world rather than once per data centre. */
  TILE_CACHE?: R2Bucket;
  /** Optional. A rate limiting binding applied to renders only; cached pictures are never limited. */
  RENDER_LIMIT?: RateLimit;
}

// Bump when the renderer draws anything differently. Theme changes are picked up on their own.
const RENDERER_VERSION = "5";
const CACHE_VERSION = `${RENDERER_VERSION}.${fingerprint(JSON.stringify(THEMES))}`;
const IMAGE_TTL = 60 * 60 * 24 * 7;
const UPSTREAM_TTL = 60 * 60 * 24 * 7;
const UPSTREAM_TIMEOUT_MS = 8000;

const SHARED = {
  "access-control-allow-origin": "*",
  "timing-allow-origin": "*",
  "cross-origin-resource-policy": "cross-origin",
  "x-content-type-options": "nosniff",
};

let renderer: Renderer | undefined;

function getRenderer(): Renderer {
  if (!renderer) {
    initSync({ module: wasm });
    renderer = new Renderer(new Uint8Array(regular), new Uint8Array(medium), new Uint8Array(italic));
  }
  return renderer;
}

async function fetchTile(env: Env, z: number, x: number, y: number): Promise<Uint8Array | undefined> {
  const url = env.TILE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  // One more try for a timeout, a dropped connection or a 5xx: a single slow tile should not fail a picture made of nine.
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { cf: { cacheTtl: UPSTREAM_TTL, cacheEverything: true }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      if (response.status === 404 || response.status === 204) return undefined;
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      if (response.status < 500 || attempt) throw new Error(`upstream tile ${z}/${x}/${y} returned ${response.status}`);
    } catch (error) {
      if (attempt) throw error;
    }
  }
}

async function fetchTiles(env: Env, ids: Uint32Array) {
  const fetched = await Promise.all(
    Array.from({ length: ids.length / 3 }, async (_, index) => {
      const id = [ids[index * 3]!, ids[index * 3 + 1]!, ids[index * 3 + 2]!] as const;
      return { id, bytes: await fetchTile(env, ...id) };
    }),
  );
  const present = fetched.filter((tile): tile is { id: (typeof tile)["id"]; bytes: Uint8Array } => !!tile.bytes?.length);
  const data = new Uint8Array(present.reduce((sum, tile) => sum + tile.bytes.length, 0));
  let offset = 0;
  for (const tile of present) {
    data.set(tile.bytes, offset);
    offset += tile.bytes.length;
  }
  return { ids: Uint32Array.from(present.flatMap((tile) => tile.id)), lengths: Uint32Array.from(present.map((tile) => tile.bytes.length)), data };
}

interface Drawn {
  bytes: Uint8Array;
  /** Milliseconds spent fetching vector tiles. */
  upstreamMs: number;
  /** Milliseconds spent drawing and encoding. */
  renderMs: number;
}

async function render(request: MapRequest, env: Env): Promise<Drawn> {
  const instance = getRenderer();
  const camera = request.kind === "tile" ? tileCamera(request.z, request.x, request.y, request.ratio) : Float64Array.from([request.longitude, request.latitude, request.zoom, request.width, request.height, request.ratio]);
  const started = Date.now();
  const tiles = await fetchTiles(env, tilesFor(camera));
  const fetched = Date.now();
  const quality = request.png ? 0 : jpegQuality(request.ratio);
  const bytes =
    request.kind === "tile"
      ? instance.render(camera, tiles.ids, tiles.lengths, tiles.data, request.look.palette, new Float64Array(), "", 0, quality)
      : instance.render(camera, tiles.ids, tiles.lengths, tiles.data, request.look.palette, request.markers.values, request.markers.labels, request.clusterDistance, quality);
  return { bytes, upstreamMs: fetched - started, renderMs: Date.now() - fetched };
}

// Requests for a picture that is already being drawn in this isolate wait for that drawing rather than starting another.
const inFlight = new Map<string, Promise<Drawn>>();

function renderOnce(key: string, request: MapRequest, env: Env): Promise<Drawn> {
  let pending = inFlight.get(key);
  if (!pending) {
    pending = render(request, env).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

function image(bytes: Uint8Array | ReadableStream, png: boolean, source: "render" | "store", timing = ""): Response {
  return new Response(bytes, {
    headers: {
      ...SHARED,
      "content-type": png ? "image/png" : "image/jpeg",
      "cache-control": `public, max-age=${IMAGE_TTL}, immutable`,
      "x-attribution": "OpenStreetMap contributors, Protomaps",
      "x-instantmap-cache": source === "store" ? "store" : "miss",
      ...(timing ? { "server-timing": timing } : {}),
    },
  });
}

const text = (message: string, status: number, extra: Record<string, string> = {}): Response =>
  new Response(message, { status, headers: { ...SHARED, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra } });

export default {
  async fetch(request, env, context): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, renderer: CACHE_VERSION }, { headers: { ...SHARED, "cache-control": "no-store" } });
    let parsed: MapRequest | undefined;
    try {
      parsed = parseRequest(url);
    } catch (error) {
      if (error instanceof BadRequest) return text(error.message, 400);
      throw error;
    }
    if (!parsed) return env.ASSETS.fetch(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...SHARED, "access-control-allow-methods": "GET, HEAD", "access-control-max-age": "86400" } });
    if (request.method !== "GET" && request.method !== "HEAD") return text("method not allowed", 405, { allow: "GET, HEAD, OPTIONS" });

    // Cloudflare's cache in front of this Worker ("cache" in wrangler.jsonc) answers a repeated address without running
    // any of this. That cache is keyed by the address as written; the one below is keyed by what the address means, so
    // the same picture asked for with its parameters in another order, or after a new deployment, is still not drawn twice.
    const key = cacheKey(parsed, CACHE_VERSION, url.searchParams);
    const cache = caches.default;
    const cacheRequest = new Request(`${url.origin}/__cache/${key}`);
    const cached = await cache.match(cacheRequest);
    if (cached) {
      const hit = new Response(cached.body, cached);
      hit.headers.set("x-instantmap-cache", "hit");
      hit.headers.delete("server-timing");
      return hit;
    }

    // Tiles are shared by every visitor looking at the same place, so they are worth keeping for good.
    // (An R2 key may be at most 1,024 bytes; a tile with a very long colour list is simply not kept.)
    const store = parsed.kind === "tile" && key.length <= 900 ? env.TILE_CACHE : undefined;
    try {
      if (store) {
        const kept = await store.get(key);
        if (kept) {
          const response = image(kept.body, parsed.png, "store");
          context.waitUntil(cache.put(cacheRequest, response.clone()));
          return response;
        }
      }
      if (env.RENDER_LIMIT) {
        const { success } = await env.RENDER_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" });
        if (!success) return text("too many uncached map requests, try again shortly", 429, { "retry-after": "10" });
      }
      const { bytes, upstreamMs, renderMs } = await renderOnce(key, parsed, env);
      // One line per drawing, for Workers Logs: which pictures are drawn, where, and where the time goes.
      console.log(
        JSON.stringify({
          message: "render",
          kind: parsed.kind,
          ...(parsed.kind === "tile" ? { z: parsed.z, x: parsed.x, y: parsed.y } : { zoom: parsed.zoom, width: parsed.width, height: parsed.height }),
          ratio: parsed.ratio,
          format: parsed.png ? "png" : "jpeg",
          upstreamMs,
          renderMs,
          bytes: bytes.length,
          colo: request.cf?.colo,
        }),
      );
      const response = image(bytes, parsed.png, "render", `upstream;dur=${upstreamMs}, render;dur=${renderMs}`);
      context.waitUntil(cache.put(cacheRequest, response.clone()));
      if (store) context.waitUntil(store.put(key, bytes, { httpMetadata: { contentType: parsed.png ? "image/png" : "image/jpeg" } }));
      return response;
    } catch (error) {
      console.error(JSON.stringify({ message: "render failed", path: url.pathname, error: error instanceof Error ? error.message : String(error) }));
      return text("render failed", 502);
    }
  },
} satisfies ExportedHandler<Env>;
