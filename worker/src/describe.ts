import { mercatorX, mercatorY, TILE_SIZE } from "../../packages/instantmap/src/cluster.ts";
import { viewBounds } from "../../packages/instantmap/src/places.ts";
import type { StaticRequest } from "./params.ts";

// GET /describe takes the same address as /static and answers with what that picture shows, as JSON, without drawing it.
// A model can read the map as text and fetch the image only when a person needs to see it. Kept free of Worker APIs.

export interface Description {
  center: [number, number];
  zoom: number;
  width: number;
  height: number;
  bounds: [number, number, number, number];
  count: number;
  markers: { lng: number; lat: number; x: number; y: number; label?: string }[];
  clusters: { lng: number; lat: number; x: number; y: number; count: number }[];
  summary: string;
  image: string;
  attribution: string;
}

const round = (value: number): number => Math.round(value * 1e5) / 1e5;

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

export function describeStatic(request: StaticRequest, url: URL): Description {
  const world = TILE_SIZE * 2 ** request.zoom;
  const centerX = mercatorX(request.longitude) * world;
  const centerY = mercatorY(request.latitude) * world;
  const labels = request.markers.labels.split("\n");
  const markers: Description["markers"] = [];
  const clusters: Description["clusters"] = [];
  let count = 0;
  for (let index = 0; index < request.markers.count; index++) {
    const [lng, lat, size] = request.markers.values.subarray(index * 4, index * 4 + 3) as unknown as [number, number, number];
    let dx = mercatorX(lng) * world - centerX;
    if (dx > world / 2) dx -= world;
    if (dx < -world / 2) dx += world;
    const x = Math.round(request.width / 2 + dx);
    const y = Math.round(request.height / 2 + mercatorY(lat) * world - centerY);
    if (x < 0 || y < 0 || x > request.width || y > request.height) continue;
    count += size;
    if (size > 1) clusters.push({ lng: round(lng), lat: round(lat), x, y, count: size });
    else markers.push({ lng: round(lng), lat: round(lat), x, y, ...(labels[index] ? { label: labels[index] } : {}) });
  }
  const bounds = viewBounds({ center: [request.longitude, request.latitude], zoom: request.zoom, width: request.width, height: request.height });
  const shape = clusters.length ? `: ${markers.length} on ${markers.length === 1 ? "its" : "their"} own and ${plural(clusters.length, "cluster")}` : "";
  const labelled = markers.filter((marker) => marker.label).map((marker) => marker.label);
  const examples = labelled.length ? ` Labels include ${labelled.slice(0, 5).join(", ")}.` : "";
  const image = new URL(url);
  image.pathname = "/static";
  return {
    center: [round(request.longitude), round(request.latitude)],
    zoom: request.zoom,
    width: request.width,
    height: request.height,
    bounds,
    count,
    markers,
    clusters,
    summary: `${plural(count, "marker")} in view${shape}.${examples} The map spans longitude ${bounds[0]} to ${bounds[2]} and latitude ${bounds[1]} to ${bounds[3]}, centred on ${round(request.longitude)}, ${round(request.latitude)} at zoom ${request.zoom}.`,
    image: image.toString(),
    attribution: "© OpenStreetMap contributors, Protomaps",
  };
}
