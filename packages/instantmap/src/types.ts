export type LngLat = [lng: number, lat: number];

export type Bounds = [west: number, south: number, east: number, north: number];

export type Theme = "daylight" | "midnight" | "paper" | "mono";

export interface Marker<Data = unknown> {
  id: string | number;
  lng: number;
  lat: number;
  label?: string;
  title?: string;
  subtitle?: string;
  image?: string;
  href?: string;
  data?: Data;
}

export interface Camera {
  center: LngLat;
  zoom: number;
}

export interface CameraOptions {
  center?: LngLat;
  zoom?: number;
}

export interface AnimationOptions {
  duration?: number;
  animate?: boolean;
}

export interface FitOptions extends AnimationOptions {
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
  maxZoom?: number;
}

export interface Cluster<Data = unknown> {
  lng: number;
  lat: number;
  markers: Marker<Data>[];
  bounds: Bounds;
}

export type PopupContent = HTMLElement | string | null | undefined;

export type PopupRenderer<Data = unknown> = (marker: Marker<Data>) => PopupContent;

export interface StaticUrlOptions {
  src?: string;
  center: LngLat;
  zoom: number;
  width: number;
  height: number;
  ratio?: 1 | 2;
  theme?: Theme;
  markers?: Pick<Marker, "lng" | "lat" | "label">[];
  cluster?: number | false;
  format?: "jpg" | "png";
}

export interface MarkerEventDetail<Data = unknown> {
  marker: Marker<Data>;
}

export interface ClusterEventDetail<Data = unknown> {
  cluster: Cluster<Data>;
}

export interface SelectEventDetail<Data = unknown> {
  marker: Marker<Data> | null;
}

export interface InstantMapEventMap<Data = unknown> {
  markerclick: CustomEvent<MarkerEventDetail<Data>>;
  markerenter: CustomEvent<MarkerEventDetail<Data>>;
  markerleave: CustomEvent<MarkerEventDetail<Data>>;
  clusterclick: CustomEvent<ClusterEventDetail<Data>>;
  select: CustomEvent<SelectEventDetail<Data>>;
  move: CustomEvent<Camera>;
  moveend: CustomEvent<Camera>;
  interactive: Event;
  idle: Event;
}
