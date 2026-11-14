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
  /** A short tag shown on the card, such as "New". */
  badge?: string;
  data?: Data;
}

export interface CardOptions {
  /** "stacked" puts the image on top (the default); "row" puts a small image beside the text. */
  layout?: "stacked" | "row";
  /** The text of the link to `marker.href`. `false` leaves the link out. Default "View details". */
  action?: string | false;
  /** Where the link opens. Default "_self". */
  target?: "_self" | "_blank";
  /** The accessible name of the close button. Default "Close". */
  closeLabel?: string;
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

export type LoadMode = "intent" | "visible" | "eager" | "none";

export type ScrollZoom = "cooperative" | "always" | "off";
/** Picture density on dense screens. "auto" drops to 1x on a slow connection or when the visitor saves data. */
export type Detail = "auto" | "high" | "low";

/** When card images are fetched ahead of a click: for markers in view, on hover or press only, or never. */
export type CardImages = "visible" | "hover" | "off";

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
