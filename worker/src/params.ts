import { decodePaletteColors, encodeColors, paletteWords, resolvePalette, THEMES } from "../../packages/instantmap/src/themes.ts";

// Everything about a request that can be decided without the renderer: validation, limits and cache keys.
// Kept free of Worker APIs so it runs under `bun test`.

export const MAX_SIZE = 1280;
export const MAX_MARKERS = 2000;
export const MAX_TILE_ZOOM = 15;
export const MAX_LABEL = 10;
/** A query string longer than this is refused before any work is done. */
export const MAX_QUERY = 64 * 1024;

export class BadRequest extends Error {}

export interface Look {
  theme: string;
  /** Canonical `key:hex` list, alphabetical, only keys the palette has. */
  colors: string;
  palette: Uint32Array;
}

export interface StaticRequest {
  kind: "static";
  longitude: number;
  latitude: number;
  zoom: number;
  width: number;
  height: number;
  ratio: 1 | 2;
  png: boolean;
  clusterDistance: number;
  markers: { values: Float64Array; labels: string; count: number };
  look: Look;
}

export interface TileRequest {
  kind: "tile";
  z: number;
  x: number;
  y: number;
  ratio: 1 | 2;
  png: boolean;
  look: Look;
}

export type MapRequest = StaticRequest | TileRequest;

export const TILE_PATH = /^\/tiles\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})(@2x)?\.(jpg|png)$/;

function number(value: string | null | undefined, name: string, min: number, max: number, fallback?: number): number {
  if (value === null || value === undefined || value === "") {
    if (fallback === undefined) throw new BadRequest(`${name} is required`);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new BadRequest(`${name} must be a number from ${min} to ${max}`);
  return parsed;
}

function pair(value: string | null | undefined, name: string): [number, number] {
  const parts = (value ?? "").split(",");
  if (parts.length !== 2) throw new BadRequest(`${name} must be longitude,latitude`);
  return [number(parts[0], `${name} longitude`, -180, 180), number(parts[1], `${name} latitude`, -85.06, 85.06)];
}

function look(query: URLSearchParams): Look {
  const theme = query.get("theme") || "daylight";
  if (!Object.hasOwn(THEMES, theme)) throw new BadRequest(`theme must be one of ${Object.keys(THEMES).join(", ")}`);
  const overrides = decodePaletteColors(query.get("colors"));
  return { theme, colors: encodeColors(overrides), palette: paletteWords(resolvePalette(theme, overrides)) };
}

function markers(query: URLSearchParams): StaticRequest["markers"] {
  const singles = (query.get("markers") ?? "").split(";").filter(Boolean);
  const clusters = (query.get("clusters") ?? "").split(";").filter(Boolean);
  const count = singles.length + clusters.length;
  if (count > MAX_MARKERS) throw new BadRequest(`at most ${MAX_MARKERS} markers and clusters in total`);
  const values = new Float64Array(count * 4);
  const labels: string[] = [];
  singles.forEach((entry, index) => {
    const [longitude, latitude, ...rest] = entry.split(",");
    const [lng, lat] = pair(`${longitude},${latitude}`, "marker");
    values.set([lng, lat, 1, 0], index * 4);
    labels.push(rest.join(",").replace(/[\n\r]/g, "").slice(0, MAX_LABEL));
  });
  clusters.forEach((entry, offset) => {
    const [longitude, latitude, size] = entry.split(",");
    const [lng, lat] = pair(`${longitude},${latitude}`, "cluster");
    values.set([lng, lat, Math.round(number(size, "cluster count", 2, 10_000_000)), 0], (singles.length + offset) * 4);
    labels.push("");
  });
  return { values, labels: labels.join("\n"), count };
}

/** Reads and validates a request. Returns undefined for an address this Worker does not render. Throws BadRequest. */
export function parseRequest(url: URL): MapRequest | undefined {
  const tile = url.pathname.match(TILE_PATH);
  if (!tile && url.pathname !== "/static") return undefined;
  if (url.search.length > MAX_QUERY) throw new BadRequest("the address is too long");
  const query = url.searchParams;
  if (tile) {
    const [z, x, y] = [Number(tile[1]), Number(tile[2]), Number(tile[3])];
    if (z > MAX_TILE_ZOOM || x >= 2 ** z || y >= 2 ** z) throw new BadRequest("tile out of range");
    return { kind: "tile", z, x, y, ratio: tile[4] ? 2 : 1, png: tile[5] === "png", look: look(query) };
  }
  const [longitude, latitude] = pair(query.get("center"), "center");
  const zoom = number(query.get("zoom"), "zoom", 0, 18);
  const sizes = (query.get("size") ?? "640x400").split("x");
  if (sizes.length !== 2) throw new BadRequest("size must be WIDTHxHEIGHT");
  const format = query.get("format") ?? "jpg";
  if (format !== "jpg" && format !== "png") throw new BadRequest("format must be jpg or png");
  return {
    kind: "static",
    longitude,
    latitude,
    zoom,
    width: Math.round(number(sizes[0], "width", 16, MAX_SIZE)),
    height: Math.round(number(sizes[1], "height", 16, MAX_SIZE)),
    ratio: Math.round(number(query.get("r"), "r", 1, 2, 1)) as 1 | 2,
    png: format === "png",
    clusterDistance: number(query.get("cluster"), "cluster", 0, 120, 44),
    markers: markers(query),
    look: look(query),
  };
}

/**
 * The one name a picture is cached under. Built from what was understood, not from what was sent, so parameters
 * the renderer ignores, their order, and different spellings of the same value all share one cached picture.
 */
export function cacheKey(request: MapRequest, version: string, rawQuery: URLSearchParams): string {
  const style = `${request.look.theme}${request.look.colors ? `/${request.look.colors}` : ""}`;
  if (request.kind === "tile") return `${version}/tiles/${request.z}/${request.x}/${request.y}@${request.ratio}.${request.png ? "png" : "jpg"}/${style}`;
  const parts = [
    `${request.longitude},${request.latitude}`,
    String(request.zoom),
    `${request.width}x${request.height}@${request.ratio}`,
    request.png ? "png" : "jpg",
    String(request.clusterDistance),
    // Marker text is free-form, so it is keyed as sent rather than re-encoded.
    rawQuery.get("markers") ?? "",
    rawQuery.get("clusters") ?? "",
  ];
  return `${version}/static/${style}/${parts.map(encodeURIComponent).join("/")}`;
}

/** JPEG quality. A 2x picture is shown at half size, which hides compression that would show at 1x, so it can be far smaller. */
export const jpegQuality = (ratio: number): number => (ratio >= 2 ? 60 : 86);

export const fingerprint = (text: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
};
