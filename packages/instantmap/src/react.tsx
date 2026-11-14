"use client";

import { type CSSProperties, forwardRef, type ReactNode, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { defineInstantMap, type InstantMapElement } from "./index.ts";
import { staticUrl } from "./static-url.ts";
import type { Camera, CardImages, CardOptions, Cluster, LngLat, LoadMode, Marker, ScrollZoom, Theme } from "./types.ts";

export interface InstantMapProps<Data = unknown> {
  center: LngLat;
  zoom: number;
  markers?: readonly Marker<Data>[];
  theme?: Theme;
  colors?: Partial<Record<string, string>>;
  cluster?: number | false;
  selected?: string | number | null;
  src?: string;
  load?: LoadMode;
  scrollZoom?: ScrollZoom;
  /** Options for the built-in card: layout, link text, link target. */
  card?: CardOptions;
  /** When card images are fetched ahead of a click. Default "visible". */
  cardImages?: CardImages;
  posterWidth?: number;
  posterHeight?: number;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  renderPopup?: ((marker: Marker<Data>) => ReactNode) | null;
  onMarkerClick?: (marker: Marker<Data>, event: CustomEvent) => void;
  onMarkerEnter?: (marker: Marker<Data>) => void;
  onMarkerLeave?: (marker: Marker<Data>) => void;
  onClusterClick?: (cluster: Cluster<Data>, event: CustomEvent) => void;
  onSelect?: (marker: Marker<Data> | null) => void;
  onMove?: (camera: Camera) => void;
  onMoveEnd?: (camera: Camera) => void;
  onInteractive?: () => void;
}

export type InstantMapHandle<Data = unknown> = InstantMapElement<Data>;

const EVENTS = {
  markerclick: (props: InstantMapProps<any>, event: CustomEvent) => props.onMarkerClick?.(event.detail.marker, event),
  markerenter: (props: InstantMapProps<any>, event: CustomEvent) => props.onMarkerEnter?.(event.detail.marker),
  markerleave: (props: InstantMapProps<any>, event: CustomEvent) => props.onMarkerLeave?.(event.detail.marker),
  clusterclick: (props: InstantMapProps<any>, event: CustomEvent) => props.onClusterClick?.(event.detail.cluster, event),
  select: (props: InstantMapProps<any>, event: CustomEvent) => props.onSelect?.(event.detail.marker),
  move: (props: InstantMapProps<any>, event: CustomEvent) => props.onMove?.(event.detail),
  moveend: (props: InstantMapProps<any>, event: CustomEvent) => props.onMoveEnd?.(event.detail),
  interactive: (props: InstantMapProps<any>) => props.onInteractive?.(),
} as const;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "instant-map": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        center?: string;
        zoom?: number | string;
        theme?: string;
        src?: string;
        load?: string;
        "scroll-zoom"?: string;
        cluster?: string;
        "card-images"?: string;
        class?: string;
      };
    }
  }
}

function InstantMapInner<Data>(props: InstantMapProps<Data>, ref: React.ForwardedRef<InstantMapHandle<Data>>) {
  const element = useRef<InstantMapElement<Data>>(null);
  const latest = useRef(props);
  latest.current = props;
  const [popup, setPopup] = useState<{ host: HTMLElement; marker: Marker<Data> } | null>(null);

  useImperativeHandle(ref, () => element.current!, []);

  useEffect(() => {
    defineInstantMap();
    const node = element.current;
    if (!node) return;
    const listeners = Object.entries(EVENTS).map(([type, handler]) => {
      const listener = (event: Event) => handler(latest.current as InstantMapProps<any>, event as CustomEvent);
      node.addEventListener(type, listener);
      return () => node.removeEventListener(type, listener);
    });
    return () => listeners.forEach((remove) => remove());
  }, []);

  useEffect(() => {
    const node = element.current;
    if (node) node.markers = (props.markers ?? []) as Marker<Data>[];
  }, [props.markers]);

  useEffect(() => {
    const node = element.current;
    if (node) node.colors = props.colors ?? {};
  }, [props.colors]);

  useEffect(() => {
    const node = element.current;
    if (node) node.card = props.card ?? {};
  }, [props.card]);

  useEffect(() => {
    const node = element.current;
    if (node && props.selected !== undefined) node.select(props.selected);
  }, [props.selected]);

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const render = props.renderPopup;
    if (render === null) {
      node.popup = null;
      return;
    }
    if (!render) return;
    node.popup = (marker) => {
      const host = document.createElement("div");
      setPopup({ host, marker });
      return host;
    };
    const clear = (event: Event) => {
      if (!(event as CustomEvent).detail?.marker) setPopup(null);
    };
    node.addEventListener("select", clear as EventListener);
    return () => node.removeEventListener("select", clear as EventListener);
  }, [props.renderPopup]);

  const width = props.posterWidth ?? 1280;
  const height = props.posterHeight ?? 720;
  // Building the address clusters every marker, so it is only redone when something it depends on changes.
  const poster = useMemo(
    () =>
      staticUrl({
        ...(props.src ? { src: props.src } : {}),
        center: props.center,
        zoom: props.zoom,
        width,
        height,
        ratio: 2,
        ...(props.theme ? { theme: props.theme } : {}),
        ...(props.colors ? { colors: props.colors } : {}),
        ...(props.markers ? { markers: props.markers } : {}),
        ...(props.cluster !== undefined ? { cluster: props.cluster } : {}),
      }),
    [props.src, props.center[0], props.center[1], props.zoom, width, height, props.theme, props.colors, props.markers, props.cluster],
  );

  return (
    <instant-map
      ref={element as React.Ref<HTMLElement>}
      center={`${props.center[0]},${props.center[1]}`}
      zoom={props.zoom}
      theme={props.theme}
      src={props.src}
      load={props.load}
      scroll-zoom={props.scrollZoom}
      cluster={props.cluster === false ? "off" : props.cluster === undefined ? undefined : String(props.cluster)}
      card-images={props.cardImages}
      class={props.className}
      style={{ display: "block", position: "relative", ...props.style }}
      suppressHydrationWarning
    >
      <img src={poster} alt={props.alt ?? "Map"} width={width} height={height} decoding="async" fetchPriority="high" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      {popup && props.renderPopup ? createPortal(props.renderPopup(popup.marker), popup.host) : null}
    </instant-map>
  );
}

export const InstantMap = forwardRef(InstantMapInner) as <Data = unknown>(
  props: InstantMapProps<Data> & { ref?: React.Ref<InstantMapHandle<Data>> },
) => ReturnType<typeof InstantMapInner>;
