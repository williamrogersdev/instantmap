import { clusterAt, DEFAULT_CLUSTER_DISTANCE, latitudeOf, longitudeOf, mercatorX, mercatorY, TILE_SIZE } from "./cluster.ts";
import type { LngLat, Marker } from "./types.ts";

// The lone markers and clusters a picture of a view draws, with their place in the frame. Shared by the poster
// address and the descriptions in places.ts, so both always agree.

export interface ViewInput<Data = unknown> {
  center: LngLat;
  zoom: number;
  width: number;
  height: number;
  markers?: readonly Marker<Data>[];
  cluster?: number | false;
}

export interface ViewGroup<Data = unknown> {
  lng: number;
  lat: number;
  /** Position in the view, in CSS pixels from the top left. */
  x: number;
  y: number;
  radius: number;
  members: Marker<Data>[];
}

/** The groups the picture draws for this view: lone markers and clusters, each with its place in the frame. */
export function viewGroups<Data>(view: ViewInput<Data>, margin = 8): ViewGroup<Data>[] {
  const markers = view.markers ?? [];
  if (!markers.length) return [];
  const distance = view.cluster === false ? 0 : (view.cluster ?? DEFAULT_CLUSTER_DISTANCE);
  const groupZoom = Math.floor(view.zoom);
  const world = TILE_SIZE * 2 ** view.zoom;
  const worldAtGroup = TILE_SIZE * 2 ** groupZoom;
  const centerX = mercatorX(view.center[0]) * world;
  const centerY = mercatorY(view.center[1]) * world;
  const scale = 2 ** (view.zoom - groupZoom);
  const groups: ViewGroup<Data>[] = [];
  for (const group of clusterAt(markers, groupZoom, distance)) {
    let dx = group.x * scale - centerX;
    if (dx > world / 2) dx -= world;
    if (dx < -world / 2) dx += world;
    const dy = group.y * scale - centerY;
    const reach = group.radius + margin;
    if (Math.abs(dx) > view.width / 2 + reach || Math.abs(dy) > view.height / 2 + reach) continue;
    groups.push({
      lng: longitudeOf(group.x / worldAtGroup),
      lat: latitudeOf(group.y / worldAtGroup),
      x: Math.round(view.width / 2 + dx),
      y: Math.round(view.height / 2 + dy),
      radius: group.radius,
      members: group.members,
    });
  }
  return groups;
}

