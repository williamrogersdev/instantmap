import { boundsOf, DEFAULT_CLUSTER_DISTANCE, latitudeOf, longitudeOf, mercatorX, mercatorY, TILE_SIZE } from "./cluster.ts";
import { DEFAULT_SRC, MAX_STATIC_SIZE, staticUrl } from "./static-url.ts";
import { decodeColors, parseColor } from "./colors.ts";
import type { AnimationOptions, Bounds, Camera, CameraOptions, CardOptions, FitOptions, InstantMapEventMap, LngLat, LoadMode, Marker, PopupRenderer, Theme } from "./types.ts";

// This file is everything a page pays for before anyone touches the map: the element, its first image and
// the camera arithmetic. Tiles, markers, gestures and cards live in engine.ts, fetched on the first sign of intent.

export const MAX_ZOOM = 19;

/** State the element and the engine share. */
export interface MapState<Data = unknown> {
  x: number;
  y: number;
  zoom: number;
  src: string;
  theme: string;
  colors: Partial<Record<string, string>>;
  look: string;
  markers: Marker<Data>[];
  byId: Map<string, Marker<Data>>;
  cluster: number;
  selected: string | null;
  highlighted: string | null;
  poster: HTMLImageElement | null;
  posterCamera: { x: number; y: number; zoom: number } | null;
  posterGrouping: { level: number; zoom: number } | null;
  /** Bumped whenever the grouping of markers may have changed. */
  revision: number;
  wake: { start: number; x: number; y: number } | null;
}

/** What the engine may ask of the element. */
export interface Bridge<Data = unknown> {
  state: MapState<Data>;
  root: ShadowRoot;
  viewport: HTMLElement;
  syncPoster(): void;
  drawPoster(): void;
}

/** What the element asks of the engine once it has loaded. */
export interface EngineHandle {
  activate(): void;
  schedule(): void;
  stop(): void;
  pause(): void;
  regroup(): void;
  resetTiles(): void;
  renderPopup(): void;
  flyTo(options: CameraOptions & AnimationOptions): Promise<void>;
  whenIdle(): Promise<void>;
  press(event: PointerEvent): void;
  tap(x: number, y: number): void;
}

const CSS = `
:host{display:block;position:relative;overflow:hidden;contain:strict;background:var(--im-land);touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;outline:none}
:host([engaged]),:host([scroll-zoom=always]){touch-action:none}
:host(:focus-visible){box-shadow:inset 0 0 0 2px var(--im-accent)}
.viewport{position:absolute;inset:0;container-type:size}
::slotted(img){position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:3;transform-origin:50% 50%;transition:opacity .32s ease}
::slotted(picture){position:absolute;inset:0;z-index:3}
::slotted(template){display:none}
.credit{position:absolute;right:0;bottom:0;z-index:7;font:11px/18px system-ui,sans-serif;padding:0 7px;border-top-left-radius:8px;background:color-mix(in srgb,var(--im-card) 82%,transparent);color:var(--im-muted)}
.credit a{color:inherit;text-decoration:none}
.credit a:hover{text-decoration:underline}
`;

// The few theme colours the element's own chrome needs before the engine (and the full palettes) load.
// A test keeps this table equal to THEMES.
export const CHROME_KEYS = ["land", "label", "labelMinor", "accent", "marker", "markerText", "shadow"] as const;
export const CHROME: Record<string, readonly string[]> = {
  daylight: ["f3f2ec", "1c2530", "4d5763", "0f2233", "0f2233", "ffffff", "0000004d"],
  midnight: ["161a21", "e2e7ee", "9ba5b3", "19d3a2", "eef3f1", "0f2233", "00000099"],
  paper: ["f3f1ec", "3d3a35", "7a756d", "1d2b3a", "1d2b3a", "ffffff", "2b24184d"],
  mono: ["f4f4f3", "2b2b2b", "6a6a6a", "0f2233", "0f2233", "ffffff", "00000040"],
};

function luminance(hex: string): number {
  const value = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

export function parseMarkerList(value: string | null): Marker[] {
  return (value ?? "")
    .split(";")
    .filter(Boolean)
    .map((entry, index) => {
      const [lng, lat, ...rest] = entry.split(",");
      const label = rest.join(",");
      return { id: index, lng: Number(lng), lat: Number(lat), ...(label ? { label } : {}) };
    })
    .filter((marker) => Number.isFinite(marker.lng) && Number.isFinite(marker.lat));
}

function readPosterCamera(img: HTMLImageElement): { center: LngLat; zoom: number; width: number; height: number } | null {
  try {
    const url = new URL(img.currentSrc || img.src, location.href);
    const center = url.searchParams.get("center")?.split(",").map(Number);
    const zoom = Number(url.searchParams.get("zoom"));
    const size = url.searchParams.get("size")?.split("x").map(Number);
    if (!center || center.length !== 2 || !Number.isFinite(zoom) || !size || size.length !== 2) return null;
    return { center: [center[0]!, center[1]!], zoom, width: size[0]!, height: size[1]! };
  } catch {
    return null;
  }
}

const clusterDistance = (value: string | null): number => (value === "off" || value === "false" ? 0 : Number(value ?? DEFAULT_CLUSTER_DISTANCE) || DEFAULT_CLUSTER_DISTANCE);

const clampZoom = (zoom: number): number => Math.max(0, Math.min(MAX_ZOOM, zoom));

const Base = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;

export interface InstantMapElement<Data = unknown> {
  addEventListener<K extends keyof InstantMapEventMap<Data>>(type: K, listener: (this: InstantMapElement<Data>, event: InstantMapEventMap<Data>[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: InstantMapElement<Data>, event: HTMLElementEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof InstantMapEventMap<Data>>(type: K, listener: (this: InstantMapElement<Data>, event: InstantMapEventMap<Data>[K]) => unknown, options?: boolean | EventListenerOptions): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: InstantMapElement<Data>, event: HTMLElementEventMap[K]) => unknown, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

// oxlint-disable-next-line no-unsafe-declaration-merging
export class InstantMapElement<Data = unknown> extends Base {
  static observedAttributes = ["center", "zoom", "theme", "colors", "markers", "cluster", "selected", "src"];

  /**
   * What a selected marker shows. Leave it unset for the built-in card (or a `<template data-card>` child),
   * set a function to draw your own, or set `null` for no card.
   */
  popup: PopupRenderer<Data> | null | undefined = undefined;

  /** Options for the built-in card. The `card-layout`, `card-action` and `card-target` attributes set the same things. */
  card: CardOptions = {};

  #state: MapState<Data> = {
    x: 0.5,
    y: 0.5,
    zoom: 2,
    src: DEFAULT_SRC,
    theme: "daylight",
    colors: {},
    look: "",
    markers: [],
    byId: new Map(),
    cluster: DEFAULT_CLUSTER_DISTANCE,
    selected: null,
    highlighted: null,
    poster: null,
    posterCamera: null,
    posterGrouping: null,
    revision: 0,
    wake: null,
  };
  #root!: ShadowRoot;
  #viewport!: HTMLElement;
  #variables: HTMLStyleElement | null = null;
  #engine: EngineHandle | null = null;
  #loading: Promise<EngineHandle> | null = null;
  #connected = false;
  #ownPoster = false;
  #posterQueued = false;
  #held: { event: PointerEvent; x: number; y: number; moved: number } | null = null;
  #tapped: { x: number; y: number } | null = null;

  connectedCallback(): void {
    if (this.#connected) {
      this.#engine?.schedule();
      return;
    }
    this.#upgradeProperties();
    this.#connected = true;
    this.#build();
    this.#readAttributes();
    queueMicrotask(() => this.#start());
  }

  disconnectedCallback(): void {
    this.#engine?.pause();
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (!this.#connected || previous === value) return;
    const state = this.#state;
    switch (name) {
      case "center":
      case "zoom": {
        const center = this.getAttribute("center")?.split(",").map(Number);
        this.setCamera({
          ...(center && center.length === 2 ? { center: [center[0]!, center[1]!] as LngLat } : {}),
          ...(this.hasAttribute("zoom") ? { zoom: Number(this.getAttribute("zoom")) } : {}),
        });
        break;
      }
      case "theme":
        this.theme = value ?? "daylight";
        break;
      case "colors":
        this.colors = decodeColors(value);
        break;
      case "markers":
        this.markers = parseMarkerList(value) as Marker<Data>[];
        break;
      case "cluster":
        state.cluster = clusterDistance(value);
        this.#regroup();
        break;
      case "selected":
        this.select(value);
        break;
      case "src":
        state.src = (value ?? DEFAULT_SRC).replace(/\/$/, "");
        this.#engine?.resetTiles();
        break;
    }
  }

  get markers(): Marker<Data>[] {
    return this.#state.markers;
  }

  set markers(value: readonly Marker<Data>[]) {
    const state = this.#state;
    state.markers = Array.from(value ?? []);
    state.byId = new Map(state.markers.map((marker) => [String(marker.id), marker]));
    if (state.selected && !state.byId.has(state.selected)) this.select(null);
    this.#regroup();
  }

  get theme(): string {
    return this.#state.theme;
  }

  set theme(value: string) {
    this.#state.theme = value || "daylight";
    this.#applyPalette();
  }

  get colors(): Partial<Record<string, string>> {
    return { ...this.#state.colors };
  }

  set colors(value: Partial<Record<string, string>>) {
    this.#state.colors = { ...(value ?? {}) };
    this.#applyPalette();
  }

  get camera(): Camera {
    const state = this.#state;
    return { center: [longitudeOf(state.x), latitudeOf(state.y)], zoom: state.zoom };
  }

  get selected(): Marker<Data> | null {
    const state = this.#state;
    return state.selected ? (state.byId.get(state.selected) ?? null) : null;
  }

  /** True once the live map has taken over from the first image. */
  get interactive(): boolean {
    return !!this.#engine;
  }

  get bounds(): Bounds {
    const [west, north] = this.unproject(0, 0);
    const [east, south] = this.unproject(this.clientWidth, this.clientHeight);
    return [west, south, east, north];
  }

  getMarker(id: string | number): Marker<Data> | undefined {
    return this.#state.byId.get(String(id));
  }

  setCamera(options: CameraOptions): this {
    const state = this.#state;
    this.#engine?.stop();
    if (options.center) {
      state.x = mercatorX(options.center[0]);
      state.y = mercatorY(options.center[1]);
    }
    if (options.zoom !== undefined && Number.isFinite(options.zoom)) state.zoom = clampZoom(options.zoom);
    if (this.#engine) this.#engine.schedule();
    else this.#drawPoster();
    this.dispatchEvent(new CustomEvent("move", { detail: this.camera, bubbles: true, composed: true }));
    return this;
  }

  flyTo(options: CameraOptions & AnimationOptions): Promise<void> {
    return this.#load().then((engine) => engine.flyTo(options));
  }

  fitBounds(target: Bounds | readonly Pick<Marker, "lng" | "lat">[], options: FitOptions = {}): Promise<void> {
    const bounds: Bounds = Array.isArray(target) && typeof target[0] === "number" ? (target as Bounds) : boundsOf(target as Pick<Marker, "lng" | "lat">[]);
    const padding = typeof options.padding === "number" ? { top: options.padding, right: options.padding, bottom: options.padding, left: options.padding } : { top: 48, right: 48, bottom: 48, left: 48, ...options.padding };
    const width = Math.max(1, (this.clientWidth || 640) - padding.left - padding.right);
    const height = Math.max(1, (this.clientHeight || 400) - padding.top - padding.bottom);
    const [west, south, east, north] = bounds;
    const spanX = Math.max(1e-9, mercatorX(east) - mercatorX(west));
    const spanY = Math.max(1e-9, mercatorY(south) - mercatorY(north));
    const zoom = Math.min(options.maxZoom ?? 16, Math.log2(Math.min(width / spanX, height / spanY) / TILE_SIZE));
    const world = TILE_SIZE * 2 ** zoom;
    const centerX = (mercatorX(west) + mercatorX(east)) / 2 + (padding.right - padding.left) / 2 / world;
    const centerY = (mercatorY(north) + mercatorY(south)) / 2 + (padding.bottom - padding.top) / 2 / world;
    return this.flyTo({ center: [longitudeOf(centerX), latitudeOf(centerY)], zoom, ...options });
  }

  select(id: string | number | null | undefined): void {
    const state = this.#state;
    const wanted = id === null || id === undefined || id === "" ? null : String(id);
    const key = wanted && state.byId.has(wanted) ? wanted : null;
    if (key === state.selected) return;
    state.selected = key;
    if (this.#engine) {
      this.#engine.renderPopup();
      this.#engine.schedule();
    } else if (key && this.#connected) void this.#load().then((engine) => engine.renderPopup());
    this.dispatchEvent(new CustomEvent("select", { detail: { marker: this.selected }, bubbles: true, composed: true }));
  }

  highlight(id: string | number | null | undefined): void {
    this.#state.highlighted = id === null || id === undefined ? null : String(id);
    this.#engine?.schedule();
  }

  project(lng: number, lat: number): [x: number, y: number] {
    const state = this.#state;
    const world = TILE_SIZE * 2 ** state.zoom;
    let dx = (mercatorX(lng) - state.x) * world;
    if (dx > world / 2) dx -= world;
    if (dx < -world / 2) dx += world;
    return [this.clientWidth / 2 + dx, this.clientHeight / 2 + (mercatorY(lat) - state.y) * world];
  }

  unproject(x: number, y: number): LngLat {
    const state = this.#state;
    const world = TILE_SIZE * 2 ** state.zoom;
    return [longitudeOf(state.x + (x - this.clientWidth / 2) / world), latitudeOf(state.y + (y - this.clientHeight / 2) / world)];
  }

  whenIdle(): Promise<void> {
    if (this.#loading) return this.#loading.then((engine) => engine.whenIdle());
    const poster = this.#state.poster;
    if (!poster || poster.complete) return Promise.resolve();
    return new Promise((resolve) => poster.addEventListener("load", () => resolve(), { once: true }));
  }

  /** Swap the first image for the live map now, without waiting for a pointer. */
  activate(): void {
    if (this.#connected) void this.#load();
  }

  /**
   * Fetches the engine. The script-tag build replaces this with one that, if its engine file has gone
   * (a tab left open across a release), asks the server for the current one.
   */
  static loadEngine: () => Promise<typeof import("./engine.ts")> = () => import("./engine.ts");

  #load(): Promise<EngineHandle> {
    this.#loading ??= InstantMapElement.loadEngine().then(({ Engine }) => {
      const engine: EngineHandle = new Engine<Data>(this, {
        state: this.#state,
        root: this.#root,
        viewport: this.#viewport,
        syncPoster: () => this.#syncPosterCamera(),
        drawPoster: () => this.#drawPoster(),
      });
      this.#engine = engine;
      engine.activate();
      const held = this.#held;
      const tapped = this.#tapped;
      this.#held = this.#tapped = null;
      if (held) engine.press(held.event);
      else if (tapped) engine.tap(tapped.x, tapped.y);
      return engine;
    });
    // A failed fetch must not leave the map asleep for good: the next sign of intent tries again.
    this.#loading.catch(() => {
      this.#loading = null;
    });
    return this.#loading;
  }

  #upgradeProperties(): void {
    const own = this as unknown as Record<string, unknown>;
    for (const key of ["markers", "popup", "card", "theme", "colors"]) {
      if (!Object.prototype.hasOwnProperty.call(this, key)) continue;
      const value = own[key];
      delete own[key];
      own[key] = value;
    }
  }

  #build(): void {
    this.#root = this.attachShadow({ mode: "open" });
    this.#root.innerHTML = `<style>${CSS}</style><style></style><div class="viewport" part="viewport"><slot></slot><div class="credit" part="attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a></div></div>`;
    this.#variables = this.#root.querySelectorAll("style")[1]!;
    this.#viewport = this.#root.querySelector(".viewport")!;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    if (!this.hasAttribute("role")) this.setAttribute("role", "application");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "Map");
    this.setAttribute("aria-roledescription", "map");
  }

  #readAttributes(): void {
    const state = this.#state;
    state.src = (this.getAttribute("src") ?? DEFAULT_SRC).replace(/\/$/, "");
    state.theme = this.getAttribute("theme") ?? state.theme;
    if (this.hasAttribute("colors")) state.colors = decodeColors(this.getAttribute("colors"));
    if (this.hasAttribute("cluster")) state.cluster = clusterDistance(this.getAttribute("cluster"));
    if (this.hasAttribute("markers") && !state.markers.length) this.markers = parseMarkerList(this.getAttribute("markers")) as Marker<Data>[];
    const poster = this.querySelector<HTMLImageElement>(":scope > img, :scope > picture > img");
    const fromPoster = poster ? readPosterCamera(poster) : null;
    const center = this.getAttribute("center")?.split(",").map(Number);
    if (center && center.length === 2 && center.every(Number.isFinite)) {
      state.x = mercatorX(center[0]!);
      state.y = mercatorY(center[1]!);
    } else if (fromPoster) {
      state.x = mercatorX(fromPoster.center[0]);
      state.y = mercatorY(fromPoster.center[1]);
    }
    const zoom = Number(this.getAttribute("zoom"));
    if (this.hasAttribute("zoom") && Number.isFinite(zoom)) state.zoom = clampZoom(zoom);
    else if (fromPoster) state.zoom = fromPoster.zoom;
    if (this.hasAttribute("selected")) state.selected = this.getAttribute("selected");
    this.#applyPalette();
    if (poster) this.#adoptPoster(poster);
  }

  #start(): void {
    const state = this.#state;
    if (!state.poster && !this.hasAttribute("center") && state.markers.length && this.clientWidth) {
      const [west, south, east, north] = boundsOf(state.markers);
      const spanX = Math.max(1e-9, mercatorX(east) - mercatorX(west));
      const spanY = Math.max(1e-9, mercatorY(south) - mercatorY(north));
      const zoom = Math.min(15, Math.log2(Math.min(Math.max(1, this.clientWidth - 96) / spanX, Math.max(1, this.clientHeight - 96) / spanY) / TILE_SIZE));
      state.x = (mercatorX(west) + mercatorX(east)) / 2;
      state.y = (mercatorY(north) + mercatorY(south)) / 2;
      state.zoom = Math.round(zoom * 100) / 100;
    }
    if (!state.poster) this.#adoptPoster(this.#createPoster());
    const mode = (this.getAttribute("load") ?? "intent") as LoadMode;
    if (mode === "eager") return this.activate();
    if (mode === "none") return;
    const local = (event: PointerEvent): { x: number; y: number } => {
      const rect = this.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    // A press that lands while the engine is still on its way is kept, so the first drag or tap is not lost.
    const track = (event: PointerEvent): void => {
      if (this.#engine) return;
      const point = local(event);
      if (event.type === "pointerdown") {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        this.#held = { event, ...point, moved: 0 };
        this.#tapped = null;
      } else if (this.#held && event.pointerId === this.#held.event.pointerId) {
        const held = this.#held;
        if (event.type === "pointermove") {
          held.moved += Math.hypot(point.x - held.x, point.y - held.y);
          this.#held = { event, ...point, moved: held.moved };
        } else {
          if (event.type === "pointerup" && held.moved < 6) this.#tapped = point;
          this.#held = null;
        }
      }
    };
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const) this.addEventListener(type, track);
    const wake = (event: Event): void => {
      if (this.#loading) return;
      const point = event instanceof PointerEvent ? event : (event as TouchEvent).touches?.[0];
      if (point) {
        const rect = this.getBoundingClientRect();
        state.wake = { start: performance.now(), x: point.clientX - rect.left, y: point.clientY - rect.top };
      }
      void this.#load().then(() => {
        for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const) this.removeEventListener(type, track);
      });
    };
    for (const type of ["pointerenter", "pointerdown", "touchstart", "focus", "wheel"]) this.addEventListener(type, wake, { once: true, passive: true });
    if (mode === "visible") {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const idle = (globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
        if (idle) idle(() => this.activate(), { timeout: 1500 });
        else setTimeout(() => this.activate(), 200);
      });
      observer.observe(this);
    }
  }

  #regroup(): void {
    this.#state.revision++;
    if (this.#engine) this.#engine.regroup();
    else if (this.#ownPoster) this.#refreshPoster();
  }

  #refreshPoster(): void {
    if (this.#posterQueued) return;
    this.#posterQueued = true;
    queueMicrotask(() => {
      this.#posterQueued = false;
      const poster = this.#state.poster;
      if (poster && this.#ownPoster && !this.#engine) poster.src = this.#posterUrl();
    });
  }

  #createPoster(): HTMLImageElement {
    const img = document.createElement("img");
    img.alt = this.getAttribute("aria-label") ?? "Map";
    img.decoding = "async";
    img.fetchPriority = "high";
    img.src = this.#posterUrl();
    this.#ownPoster = true;
    this.prepend(img);
    return img;
  }

  #posterUrl(): string {
    const state = this.#state;
    return staticUrl({
      src: state.src,
      center: [longitudeOf(state.x), latitudeOf(state.y)],
      zoom: state.zoom,
      width: Math.min(MAX_STATIC_SIZE, this.clientWidth || 640),
      height: Math.min(MAX_STATIC_SIZE, this.clientHeight || 400),
      ratio: (globalThis.devicePixelRatio ?? 1) > 1 ? 2 : 1,
      theme: state.theme as Theme,
      colors: state.colors,
      markers: state.markers,
      cluster: state.cluster || false,
    });
  }

  #adoptPoster(img: HTMLImageElement): void {
    const state = this.#state;
    state.poster = img;
    img.draggable = false;
    if (img.parentElement !== this) Object.assign(img.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", transformOrigin: "50% 50%", transition: "opacity .32s ease" });
    state.posterCamera = { x: state.x, y: state.y, zoom: state.zoom };
    if (img.complete) this.#syncPosterCamera();
    else img.addEventListener("load", () => this.#syncPosterCamera(), { once: true });
  }

  // The first image is drawn with object-fit: cover, so its true camera depends on the box it landed in.
  #syncPosterCamera(): void {
    const state = this.#state;
    const poster = state.poster;
    const camera = state.posterCamera;
    if (!poster || !camera || camera.x !== state.x || camera.y !== state.y || camera.zoom !== state.zoom) return;
    const natural = readPosterCamera(poster);
    const rect = poster.getBoundingClientRect();
    if (!natural || rect.width <= 0) return;
    const cover = Math.max(rect.width / natural.width, rect.height / natural.height);
    camera.x = state.x = mercatorX(natural.center[0]);
    camera.y = state.y = mercatorY(natural.center[1]);
    camera.zoom = state.zoom = natural.zoom + Math.log2(cover);
    state.posterGrouping = { level: Math.floor(natural.zoom), zoom: state.zoom };
    state.revision++;
  }

  #drawPoster(): void {
    const state = this.#state;
    const poster = state.poster;
    const camera = state.posterCamera;
    if (!poster || !camera) return;
    const scale = 2 ** (state.zoom - camera.zoom);
    const world = TILE_SIZE * 2 ** state.zoom;
    let dx = camera.x - state.x;
    if (dx > 0.5) dx -= 1;
    if (dx < -0.5) dx += 1;
    const tx = dx * world;
    const ty = (camera.y - state.y) * world;
    poster.style.transform = scale === 1 && !tx && !ty ? "" : `translate(${tx}px,${ty}px) scale(${scale})`;
  }

  #applyPalette(): void {
    const state = this.#state;
    const base = CHROME[state.theme] ?? CHROME.daylight!;
    const color = (index: number): string => {
      const override = state.colors[CHROME_KEYS[index]!];
      return override !== undefined && parseColor(override) !== undefined ? override : `#${base[index]}`;
    };
    const land = color(0);
    const dark = luminance(land) < 0.18;
    const variables: Record<string, string> = {
      "--im-land": land,
      "--im-card": dark ? "#1b2029" : "#ffffff",
      "--im-ink": color(1),
      "--im-muted": color(2),
      "--im-accent": color(3),
      "--im-marker": color(4),
      "--im-marker-text": color(5),
      "--im-hairline": dark ? "#ffffff1f" : "#0000001a",
      "--im-hover": dark ? "#ffffff12" : "#0000000a",
      "--im-shadow": color(6),
    };
    if (this.#variables) {
      this.#variables.textContent = `:host{${Object.entries(variables)
        .map(([name, value]) => `${name}:${value}`)
        .join(";")}}`;
    }
    state.look = `${state.theme}|${JSON.stringify(state.colors)}`;
    if (this.#engine) this.#engine.schedule();
    else if (this.#ownPoster) this.#refreshPoster();
  }
}
