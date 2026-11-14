import { clusterAt, DEFAULT_CLUSTER_DISTANCE, latitudeOf, longitudeOf, MAX_LABEL_LENGTH, mercatorX, mercatorY, TILE_SIZE } from "./cluster.ts";
import { encodeColors } from "./colors.ts";
import type { Marker, StaticUrlOptions } from "./types.ts";

declare const INSTANT_MAP_FROM_SCRIPT: boolean | undefined;

const scriptOrigin = (): string | null => {
  try {
    return typeof INSTANT_MAP_FROM_SCRIPT !== "undefined" && INSTANT_MAP_FROM_SCRIPT ? new URL(import.meta.url).origin : null;
  } catch {
    return null;
  }
};

export const DEFAULT_SRC = scriptOrigin() ?? "https://instantmap.org";
export const MAX_STATIC_SIZE = 1280;
export const STYLE_VERSION = "3";

const coordinate = (value: number): string => String(Math.round(value * 1e5) / 1e5);

const cleanLabel = (label: string | undefined): string => (label ?? "").replace(/[;\n\r]/g, " ").trim().slice(0, MAX_LABEL_LENGTH);

export interface StaticUrlInput extends Omit<StaticUrlOptions, "markers"> {
  markers?: readonly Pick<Marker, "lng" | "lat" | "label">[];
  colors?: Partial<Record<string, string>>;
  selected?: string | number | null;
}

export function staticUrl(options: StaticUrlInput): string {
  const src = (options.src ?? DEFAULT_SRC).replace(/\/$/, "");
  const width = Math.round(Math.min(MAX_STATIC_SIZE, Math.max(16, options.width)));
  const height = Math.round(Math.min(MAX_STATIC_SIZE, Math.max(16, options.height)));
  const params = new URLSearchParams({
    center: `${coordinate(options.center[0])},${coordinate(options.center[1])}`,
    zoom: String(Math.round(options.zoom * 100) / 100),
    size: `${width}x${height}`,
  });
  if (options.ratio === 2) params.set("r", "2");
  if (options.theme && options.theme !== "daylight") params.set("theme", options.theme);
  const colors = options.colors ? encodeColors(options.colors) : "";
  if (colors) params.set("colors", colors);
  const markers = options.markers ?? [];
  if (markers.length) {
    const distance = options.cluster === false ? 0 : (options.cluster ?? DEFAULT_CLUSTER_DISTANCE);
    const groupZoom = Math.floor(options.zoom);
    const world = TILE_SIZE * 2 ** options.zoom;
    const centerX = mercatorX(options.center[0]) * world;
    const centerY = mercatorY(options.center[1]) * world;
    const scale = 2 ** (options.zoom - groupZoom);
    const singles: string[] = [];
    const clusters: string[] = [];
    for (const group of clusterAt(markers as Marker[], groupZoom, distance)) {
      let dx = group.x * scale - centerX;
      if (dx > world / 2) dx -= world;
      if (dx < -world / 2) dx += world;
      const dy = group.y * scale - centerY;
      const margin = group.radius + 8;
      if (Math.abs(dx) > width / 2 + margin || Math.abs(dy) > height / 2 + margin) continue;
      const worldAtGroup = TILE_SIZE * 2 ** groupZoom;
      const lng = coordinate(longitudeOf(group.x / worldAtGroup));
      const lat = coordinate(latitudeOf(group.y / worldAtGroup));
      if (group.members.length > 1) clusters.push(`${lng},${lat},${group.members.length}`);
      else {
        const label = cleanLabel(group.members[0]!.label);
        singles.push(label ? `${lng},${lat},${label}` : `${lng},${lat}`);
      }
    }
    if (singles.length) params.set("markers", singles.join(";"));
    if (clusters.length) params.set("clusters", clusters.join(";"));
    params.set("cluster", "0");
  }
  if (options.format === "png") params.set("format", "png");
  params.set("v", STYLE_VERSION);
  return `${src}/static?${params}`;
}

interface Connection {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
}

/**
 * How dense a picture to ask for: 2 on a dense screen, 1 otherwise. With detail "auto", a visitor who has asked
 * the browser to save data, or whose connection is slow, gets 1: about a third of the bytes, a little softer.
 * Browsers that do not report the connection get 2.
 */
export function pixelRatio(detail?: string | null): 1 | 2 {
  if (detail === "low" || (globalThis.devicePixelRatio ?? 1) <= 1) return 1;
  if (detail === "high") return 2;
  const connection = (globalThis.navigator as { connection?: Connection } | undefined)?.connection;
  if (!connection) return 2;
  return connection.saveData || /2g|3g/.test(connection.effectiveType ?? "") || (connection.downlink ?? 10) < 2.5 ? 1 : 2;
}

export function tileUrl(src: string, z: number, x: number, y: number, ratio: number, theme?: string, colors?: Partial<Record<string, string>>): string {
  const params = new URLSearchParams({ v: STYLE_VERSION });
  if (theme && theme !== "daylight") params.set("theme", theme);
  const encoded = colors ? encodeColors(colors) : "";
  if (encoded) params.set("colors", encoded);
  return `${src.replace(/\/$/, "")}/tiles/${z}/${x}/${y}${ratio > 1 ? "@2x" : ""}.jpg?${params}`;
}
