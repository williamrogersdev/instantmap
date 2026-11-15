import { boundsOf, latitudeOf, longitudeOf, mercatorX, mercatorY, TILE_SIZE } from "./cluster.ts";
import { viewGroups, type ViewInput } from "./view-groups.ts";

export { viewGroups, type ViewGroup, type ViewInput } from "./view-groups.ts";
import type { Bounds, LngLat, Marker } from "./types.ts";

// What a view shows, as data: the same grouping the picture is drawn with, so a model reading this and a person
// looking at the image see the same places. Pure functions, safe on a server.

export interface DescribedPlace {
  id: string | number;
  lng: number;
  lat: number;
  x: number;
  y: number;
  label?: string;
  title?: string;
  subtitle?: string;
  href?: string;
}

export interface DescribedCluster {
  lng: number;
  lat: number;
  x: number;
  y: number;
  count: number;
  bounds: Bounds;
  /** The ids of the markers in the cluster, up to 20. */
  ids: (string | number)[];
}

export interface ViewDescription {
  center: LngLat;
  zoom: number;
  width: number;
  height: number;
  bounds: Bounds;
  /** Markers inside the view, counted one by one, whether drawn alone or in a cluster. */
  count: number;
  places: DescribedPlace[];
  clusters: DescribedCluster[];
  /** One or two sentences a model can repeat. */
  summary: string;
}

const round = (value: number): number => Math.round(value * 1e5) / 1e5;

export function viewBounds(view: Pick<ViewInput, "center" | "zoom" | "width" | "height">): Bounds {
  const world = TILE_SIZE * 2 ** view.zoom;
  const x = mercatorX(view.center[0]);
  const y = mercatorY(view.center[1]);
  const halfX = view.width / 2 / world;
  const halfY = view.height / 2 / world;
  return [round(longitudeOf(x - halfX)), round(latitudeOf(y + halfY)), round(longitudeOf(x + halfX)), round(latitudeOf(y - halfY))];
}

const inside = (bounds: Bounds, { lng, lat }: Pick<Marker, "lng" | "lat">): boolean => {
  const [west, south, east, north] = bounds;
  if (lat < south || lat > north) return false;
  return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
};

/** The markers inside bounds (west, south, east, north). Bounds that cross the antimeridian have west > east. */
export function markersIn<Data>(markers: readonly Marker<Data>[], bounds: Bounds): Marker<Data>[] {
  return markers.filter((marker) => inside(bounds, marker));
}

/** Great-circle distance in kilometres. */
export function distanceKm(from: LngLat, to: LngLat): number {
  const radians = Math.PI / 180;
  const dLat = (to[1] - from[1]) * radians;
  const dLng = (to[0] - from[0]) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from[1] * radians) * Math.cos(to[1] * radians) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The k markers closest to a point, nearest first, each with its distance in kilometres. */
export function nearest<Data>(markers: readonly Marker<Data>[], point: LngLat, k = 5, maxKm = Number.POSITIVE_INFINITY): { marker: Marker<Data>; km: number }[] {
  return markers
    .map((marker) => ({ marker, km: distanceKm(point, [marker.lng, marker.lat]) }))
    .filter((entry) => entry.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, Math.max(0, k));
}

const placeOf = (marker: Marker, x: number, y: number): DescribedPlace => ({
  id: marker.id,
  lng: round(marker.lng),
  lat: round(marker.lat),
  x,
  y,
  ...(marker.label ? { label: marker.label } : {}),
  ...(marker.title ? { title: marker.title } : {}),
  ...(marker.subtitle ? { subtitle: marker.subtitle } : {}),
  ...(marker.href ? { href: marker.href } : {}),
});

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Everything a view shows, as JSON: its bounds, the places drawn alone, the clusters, and a summary sentence. */
export function describeView<Data>(view: ViewInput<Data>, options: { limit?: number } = {}): ViewDescription {
  const limit = options.limit ?? 100;
  const groups = viewGroups(view, 0);
  const places: DescribedPlace[] = [];
  const clusters: DescribedCluster[] = [];
  let count = 0;
  for (const group of groups) {
    count += group.members.length;
    if (group.members.length === 1) {
      if (places.length < limit) places.push(placeOf(group.members[0] as Marker, group.x, group.y));
    } else if (clusters.length < limit) {
      clusters.push({
        lng: round(group.lng),
        lat: round(group.lat),
        x: group.x,
        y: group.y,
        count: group.members.length,
        bounds: boundsOf(group.members).map(round) as Bounds,
        ids: group.members.slice(0, 20).map((marker) => marker.id),
      });
    }
  }
  const bounds = viewBounds(view);
  const total = view.markers?.length ?? 0;
  const lone = groups.filter((group) => group.members.length === 1).length;
  const grouped = groups.length - lone;
  const shape = grouped ? `: ${lone} on ${lone === 1 ? "its" : "their"} own and ${plural(grouped, "cluster")}` : "";
  const outside = total > count ? ` ${total - count} more ${total - count === 1 ? "lies" : "lie"} outside it.` : "";
  const summary = `${plural(count, "place")} in view${shape}.${outside} The view spans longitude ${bounds[0]} to ${bounds[2]} and latitude ${bounds[1]} to ${bounds[3]}, at zoom ${round(view.zoom)}.`;
  return { center: [round(view.center[0]), round(view.center[1])], zoom: round(view.zoom), width: view.width, height: view.height, bounds, count, places, clusters, summary };
}

const escape = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SAFE_HREF = /^(https?:|\/|\.|#|\?)/i;

/** The list items for `placesHtml`: one per marker in view, a link when the marker has an `href`. */
export function placeItemsHtml<Data>(view: ViewInput<Data>, limit = 50): string {
  const items: string[] = [];
  for (const group of viewGroups(view, 0)) {
    for (const marker of group.members) {
      if (items.length >= limit) return items.join("");
      const name = escape([marker.title, marker.label].filter(Boolean).join(", ") || `Place ${items.length + 1}`);
      const where = `${marker.id === undefined ? "" : `data-id="${escape(String(marker.id))}" `}data-lnglat="${round(marker.lng)},${round(marker.lat)}"`;
      items.push(marker.href && SAFE_HREF.test(marker.href) ? `<li ${where}><a href="${escape(marker.href)}">${name}</a></li>` : `<li ${where}>${name}</li>`);
    }
  }
  return items.join("");
}

/**
 * The places a view shows, as a plain list: what a crawler, a screen reader or a browsing agent reads before any
 * script runs. Put it inside `<instant-map>`; the element keeps it out of sight, and the live map keeps it current.
 */
export function placesHtml<Data>(view: ViewInput<Data>, options: { label?: string; limit?: number } = {}): string {
  return `<ul data-im-places aria-label="${escape(options.label ?? PLACES_LABEL)}">${placeItemsHtml(view, options.limit)}</ul>`;
}

export const PLACES_LABEL = "Places on the map";
