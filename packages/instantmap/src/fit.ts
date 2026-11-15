import { boundsOf, latitudeOf, longitudeOf, mercatorX, mercatorY, TILE_SIZE } from "./cluster.ts";
import type { Bounds, FitOptions, LngLat, Marker } from "./types.ts";

export const DEFAULT_FIT_PADDING = 48;
export const DEFAULT_FIT_MAX_ZOOM = 16;

/**
 * The camera that fits bounds or points into a frame of the given size, without a map: use it to build the poster
 * for the same first view `fitBounds` would animate to.
 */
export function fitView(
  target: Bounds | readonly Pick<Marker, "lng" | "lat">[],
  size: { width: number; height: number },
  options: Omit<FitOptions, "duration" | "easing"> = {},
): { center: LngLat; zoom: number } {
  const bounds: Bounds = Array.isArray(target) && typeof target[0] === "number" ? (target as Bounds) : boundsOf(target as Pick<Marker, "lng" | "lat">[]);
  const fill = DEFAULT_FIT_PADDING;
  const padding =
    typeof options.padding === "number"
      ? { top: options.padding, right: options.padding, bottom: options.padding, left: options.padding }
      : { top: fill, right: fill, bottom: fill, left: fill, ...options.padding };
  const width = Math.max(1, size.width - padding.left - padding.right);
  const height = Math.max(1, size.height - padding.top - padding.bottom);
  const [west, south, east, north] = bounds;
  const spanX = Math.max(1e-9, mercatorX(east) - mercatorX(west));
  const spanY = Math.max(1e-9, mercatorY(south) - mercatorY(north));
  const fitted = Math.log2(Math.min(width / spanX, height / spanY) / TILE_SIZE);
  const clamped = Math.max(options.minZoom ?? 0, Math.min(options.maxZoom ?? DEFAULT_FIT_MAX_ZOOM, fitted));
  const zoom = options.wholeZoom ? Math.floor(clamped) : clamped;
  const world = TILE_SIZE * 2 ** zoom;
  const centerX = (mercatorX(west) + mercatorX(east)) / 2 + (padding.right - padding.left) / 2 / world;
  const centerY = (mercatorY(north) + mercatorY(south)) / 2 + (padding.bottom - padding.top) / 2 / world;
  return { center: [longitudeOf(centerX), latitudeOf(centerY)], zoom };
}
