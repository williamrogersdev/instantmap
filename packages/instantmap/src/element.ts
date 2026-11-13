import { boundsOf, clusterAt, DEFAULT_CLUSTER_DISTANCE, type Group, latitudeOf, longitudeOf, MAX_LABEL_LENGTH, mercatorX, mercatorY, TILE_SIZE } from "./cluster.ts";
import { DEFAULT_SRC, MAX_STATIC_SIZE, staticUrl, tileUrl } from "./static-url.ts";
import { decodeColors, type Palette, resolvePalette } from "./themes.ts";
import type { AnimationOptions, Bounds, Camera, CameraOptions, Cluster, FitOptions, InstantMapEventMap, LngLat, Marker, PopupRenderer, Theme } from "./types.ts";

const MAX_ZOOM = 19;
const MAX_TILE_ZOOM = 15;
const FONT_FAMILY = '"Instant Map Sans", "Noto Sans", system-ui, sans-serif';
const PILL_HEIGHT = 26;
const PILL_PADDING = 10;
const DOT_RADIUS = 7;

type LoadMode = "intent" | "visible" | "eager" | "none";
type ScrollZoom = "cooperative" | "always" | "off";

interface Hit<Data> {
  group: Group<Data>;
  x: number;
  y: number;
  kind: "pill" | "dot" | "cluster";
  width: number;
  height: number;
}

interface Tile extends HTMLImageElement {
  zoomLevel: number;
  column: number;
  row: number;
  loaded: boolean;
  look: string;
}

const SHADOW_CSS = `
:host{display:block;position:relative;overflow:hidden;contain:strict;background:var(--im-land);touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;outline:none;font-family:${FONT_FAMILY}}
:host([engaged]),:host([scroll-zoom=always]){touch-action:none}
:host(:focus-visible){box-shadow:inset 0 0 0 2px var(--im-accent)}
.viewport{position:absolute;inset:0;container-type:size}
::slotted(img){position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:3;transform-origin:50% 50%;transition:opacity .32s ease}
::slotted(picture){position:absolute;inset:0;z-index:3}
.tiles{position:absolute;inset:0;z-index:1;pointer-events:none}
.tiles img{position:absolute;left:0;top:0;width:${TILE_SIZE}px;height:${TILE_SIZE}px;transform-origin:0 0;pointer-events:none;opacity:0;transition:opacity .18s linear}
.tiles img.on{opacity:1}
canvas{position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none}
.popups{position:absolute;inset:0;z-index:6;pointer-events:none}
::slotted([slot=popup]){pointer-events:auto}
.controls{position:absolute;right:12px;top:12px;z-index:7;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;background:var(--im-card);box-shadow:0 0 0 1px var(--im-hairline),0 6px 18px -6px var(--im-shadow);opacity:0;transform:translateY(-6px) scale(.96);transition:opacity .35s ease .1s,transform .45s cubic-bezier(.2,.9,.3,1.2) .1s;pointer-events:none}
:host([interactive]) .controls{opacity:1;transform:none;pointer-events:auto}
.controls button{all:unset;box-sizing:border-box;width:44px;height:44px;display:grid;place-items:center;color:var(--im-ink);cursor:pointer}
.controls button+button{border-top:1px solid var(--im-hairline)}
.controls button:hover{background:var(--im-hover)}
.controls button:focus-visible{box-shadow:inset 0 0 0 2px var(--im-accent)}
.controls svg{width:18px;height:18px}
.credit{position:absolute;right:0;bottom:0;z-index:7;font:11px/18px system-ui,sans-serif;padding:0 7px;border-top-left-radius:8px;background:color-mix(in srgb,var(--im-card) 82%,transparent);color:var(--im-muted)}
.credit a{color:inherit;text-decoration:none}
.credit a:hover{text-decoration:underline}
.hint{position:absolute;inset:0;z-index:8;display:grid;place-items:center;background:color-mix(in srgb,#000 38%,transparent);color:#fff;font:600 15px/1.4 system-ui,sans-serif;opacity:0;transition:opacity .25s;pointer-events:none}
.hint.on{opacity:1}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;margin:0;padding:0;list-style:none}
`;

const CARD_CSS = `
.instant-map-popup{position:absolute;left:0;top:0;will-change:transform}
.instant-map-card{box-sizing:border-box;width:min(280px,calc(100cqw - 32px));background:var(--im-card);color:var(--im-ink);border-radius:16px;overflow:hidden;box-shadow:0 0 0 1px var(--im-hairline),0 18px 40px -12px var(--im-shadow),0 4px 10px -4px var(--im-shadow);font:14px/1.45 var(--im-font,system-ui,-apple-system,"Segoe UI",sans-serif);animation:instant-map-in .26s cubic-bezier(.2,.9,.3,1.15)}
.instant-map-card img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--im-hover)}
.instant-map-card .body{padding:12px 14px 14px}
.instant-map-card .title{font-weight:650;font-size:15px;margin:0 0 2px;letter-spacing:-.01em}
.instant-map-card .subtitle{color:var(--im-muted);margin:0}
.instant-map-card .price{margin:8px 0 0;font-weight:650}
.instant-map-card a.cta{display:flex;align-items:center;justify-content:center;min-height:44px;margin-top:12px;border-radius:10px;background:var(--im-marker);color:var(--im-marker-text);font-weight:600;text-decoration:none}
.instant-map-card a.cta:focus-visible{outline:2px solid var(--im-accent);outline-offset:2px}
.instant-map-card button.close{all:unset;position:absolute;right:8px;top:8px;width:32px;height:32px;display:grid;place-items:center;border-radius:999px;background:color-mix(in srgb,var(--im-card) 88%,transparent);color:var(--im-ink);cursor:pointer;box-shadow:0 1px 3px var(--im-shadow)}
.instant-map-card button.close::before{content:"";position:absolute;inset:-6px}
@keyframes instant-map-in{from{transform:translateY(6px) scale(.97)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.instant-map-card{animation:none}}
`;

const ICON_PLUS = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_MINUS = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

function luminance(hex: string): number {
  const value = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

function shortCount(count: number): string {
  if (count >= 10000) return `${Math.floor(count / 1000)}k`;
  if (count >= 1000) {
    const tenths = Math.floor(count / 100);
    return tenths % 10 ? `${Math.floor(tenths / 10)}.${tenths % 10}k` : `${tenths / 10}k`;
  }
  return String(count);
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

export function defaultPopup(marker: Marker): HTMLElement | null {
  if (!marker.title && !marker.image && !marker.subtitle) return null;
  const card = document.createElement("div");
  card.className = "instant-map-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", marker.title ?? marker.label ?? "Details");
  card.innerHTML = [
    marker.image ? `<img src="${escapeHtml(marker.image)}" alt="" loading="lazy" decoding="async">` : "",
    '<div class="body">',
    marker.title ? `<p class="title">${escapeHtml(marker.title)}</p>` : "",
    marker.subtitle ? `<p class="subtitle">${escapeHtml(marker.subtitle)}</p>` : "",
    marker.label ? `<p class="price">${escapeHtml(marker.label)}</p>` : "",
    marker.href ? `<a class="cta" href="${escapeHtml(marker.href)}">View details</a>` : "",
    "</div>",
    '<button class="close" type="button" aria-label="Close">✕</button>',
  ].join("");
  return card;
}

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

  popup: PopupRenderer<Data> | null = defaultPopup as PopupRenderer<Data>;

  #root!: ShadowRoot;
  #viewport!: HTMLDivElement;
  #tileLayer!: HTMLDivElement;
  #canvas!: HTMLCanvasElement;
  #hint!: HTMLDivElement;
  #list!: HTMLUListElement;
  #poster: HTMLImageElement | null = null;
  #posterCamera: { x: number; y: number; zoom: number } | null = null;
  #x = 0.5;
  #y = 0.5;
  #zoom = 2;
  #src = DEFAULT_SRC;
  #theme = "daylight";
  #colors: Partial<Record<string, string>> = {};
  #palette: Palette = resolvePalette("daylight");
  #markers: Marker<Data>[] = [];
  #byId = new Map<string, Marker<Data>>();
  #clusterDistance = DEFAULT_CLUSTER_DISTANCE;
  #groupCache: { zoom: number; groups: Group<Data>[] } | null = null;
  #posterGrouping: { level: number; zoom: number } | null = null;
  #selected: string | null = null;
  #highlighted: string | null = null;
  #hovered: Hit<Data> | null = null;
  #hits: Hit<Data>[] = [];
  #tiles = new Map<string, Tile>();
  #look = "";
  #frame = 0;
  #connected = false;
  #active = false;
  #idle = false;
  #pointers = new Map<number, { x: number; y: number }>();
  #pinch: { distance: number; midX: number; midY: number } | null = null;
  #samples: { x: number; y: number; t: number }[] = [];
  #dragged = 0;
  #animation = 0;
  #engaged = false;
  #hintTimer = 0;
  #moveEndTimer = 0;
  #wake: { start: number; x: number; y: number } | null = null;
  #popupHost: HTMLDivElement | null = null;
  #popupFor: string | null = null;
  #fontReady: Promise<void> | null = null;
  #ownPoster = false;
  #variables = "";
  #variableSheet: HTMLStyleElement | null = null;
  #posterQueued = false;

  connectedCallback(): void {
    if (this.#connected) return;
    this.#upgradeProperties();
    this.#connected = true;
    this.#build();
    this.#readAttributes();
    queueMicrotask(() => this.#start());
  }

  #upgradeProperties(): void {
    const own = this as unknown as Record<string, unknown>;
    for (const key of ["markers", "popup", "theme", "colors"]) {
      if (!Object.prototype.hasOwnProperty.call(this, key)) continue;
      const value = own[key];
      delete own[key];
      own[key] = value;
    }
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#frame);
    cancelAnimationFrame(this.#animation);
    this.#frame = 0;
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (!this.#connected || previous === value) return;
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
        this.#clusterDistance = value === "off" || value === "false" ? 0 : Number(value ?? DEFAULT_CLUSTER_DISTANCE) || DEFAULT_CLUSTER_DISTANCE;
        this.#groupCache = null;
        this.#schedule();
        break;
      case "selected":
        this.select(value);
        break;
      case "src":
        this.#src = (value ?? DEFAULT_SRC).replace(/\/$/, "");
        this.#resetTiles();
        break;
    }
  }

  get markers(): Marker<Data>[] {
    return this.#markers;
  }

  set markers(value: readonly Marker<Data>[]) {
    this.#markers = Array.from(value ?? []);
    this.#byId = new Map(this.#markers.map((marker) => [String(marker.id), marker]));
    this.#groupCache = null;
    if (this.#selected && !this.#byId.has(this.#selected)) this.select(null);
    if (this.#ownPoster && !this.#active) this.#refreshPoster();
    this.#schedule();
  }

  get theme(): string {
    return this.#theme;
  }

  set theme(value: string) {
    this.#theme = value || "daylight";
    this.#applyPalette();
  }

  get colors(): Partial<Record<string, string>> {
    return { ...this.#colors };
  }

  set colors(value: Partial<Record<string, string>>) {
    this.#colors = { ...(value ?? {}) };
    this.#applyPalette();
  }

  get palette(): Readonly<Palette> {
    return this.#palette;
  }

  get camera(): Camera {
    return { center: [longitudeOf(this.#x), latitudeOf(this.#y)], zoom: this.#zoom };
  }

  get selected(): Marker<Data> | null {
    return this.#selected ? (this.#byId.get(this.#selected) ?? null) : null;
  }

  get interactive(): boolean {
    return this.#active;
  }

  get bounds(): Bounds {
    const [west, north] = this.unproject(0, 0);
    const [east, south] = this.unproject(this.clientWidth, this.clientHeight);
    return [west, south, east, north];
  }

  getMarker(id: string | number): Marker<Data> | undefined {
    return this.#byId.get(String(id));
  }

  setCamera(options: CameraOptions): this {
    this.#stopAnimation();
    if (options.center) {
      this.#x = mercatorX(options.center[0]);
      this.#y = mercatorY(options.center[1]);
    }
    if (options.zoom !== undefined && Number.isFinite(options.zoom)) this.#zoom = Math.max(0, Math.min(MAX_ZOOM, options.zoom));
    this.#changed();
    return this;
  }

  flyTo(options: CameraOptions & AnimationOptions): Promise<void> {
    this.activate();
    const fromX = this.#x;
    const fromY = this.#y;
    const fromZoom = this.#zoom;
    const toX = options.center ? mercatorX(options.center[0]) : fromX;
    const toY = options.center ? mercatorY(options.center[1]) : fromY;
    const toZoom = Math.max(0, Math.min(MAX_ZOOM, options.zoom ?? fromZoom));
    if (options.animate === false || reducedMotion()) {
      this.setCamera({ center: [longitudeOf(toX), latitudeOf(toY)], zoom: toZoom });
      this.#moveEnd();
      return Promise.resolve();
    }
    let deltaX = toX - fromX;
    if (deltaX > 0.5) deltaX -= 1;
    if (deltaX < -0.5) deltaX += 1;
    const span = Math.max(1, this.clientWidth, this.clientHeight);
    const travel = Math.hypot(deltaX, toY - fromY) * TILE_SIZE * 2 ** Math.min(fromZoom, toZoom);
    const bump = travel > span ? Math.log2(travel / span) + 0.5 : 0;
    const duration = options.duration ?? Math.min(1600, 450 + 160 * (Math.abs(toZoom - fromZoom) + bump));
    const started = performance.now();
    this.#stopAnimation();
    return new Promise((resolve) => {
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = easeInOut(progress);
        this.#x = (((fromX + deltaX * eased) % 1) + 1) % 1;
        this.#y = fromY + (toY - fromY) * eased;
        this.#zoom = fromZoom + (toZoom - fromZoom) * eased - bump * Math.sin(Math.PI * progress);
        this.#changed();
        if (progress < 1) this.#animation = requestAnimationFrame(step);
        else {
          this.#animation = 0;
          this.#moveEnd();
          resolve();
        }
      };
      this.#animation = requestAnimationFrame(step);
    });
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
    const key = id === null || id === undefined || id === "" ? null : String(id);
    if (key === this.#selected) return;
    this.#selected = key && this.#byId.has(key) ? key : null;
    this.#renderPopup();
    this.#schedule();
    this.dispatchEvent(new CustomEvent("select", { detail: { marker: this.selected }, bubbles: true, composed: true }));
  }

  highlight(id: string | number | null | undefined): void {
    this.#highlighted = id === null || id === undefined ? null : String(id);
    this.#schedule();
  }

  project(lng: number, lat: number): [x: number, y: number] {
    const world = this.#world;
    let dx = (mercatorX(lng) - this.#x) * world;
    if (dx > world / 2) dx -= world;
    if (dx < -world / 2) dx += world;
    return [this.clientWidth / 2 + dx, this.clientHeight / 2 + (mercatorY(lat) - this.#y) * world];
  }

  unproject(x: number, y: number): LngLat {
    const world = this.#world;
    return [longitudeOf(this.#x + (x - this.clientWidth / 2) / world), latitudeOf(this.#y + (y - this.clientHeight / 2) / world)];
  }

  whenIdle(): Promise<void> {
    if (!this.#active) {
      const poster = this.#poster;
      if (!poster || poster.complete) return Promise.resolve();
      return new Promise((resolve) => poster.addEventListener("load", () => resolve(), { once: true }));
    }
    if (this.#idle && !this.#frame) return Promise.resolve();
    return new Promise((resolve) => this.addEventListener("idle", () => resolve(), { once: true }));
  }

  activate(): void {
    if (this.#active || !this.#connected) return;
    this.#active = true;
    if (this.#poster && this.#posterCamera) {
      const rect = this.#poster.getBoundingClientRect();
      const natural = readPosterCamera(this.#poster);
      if (natural && rect.width > 0) {
        const camera = this.#posterCamera;
        if (camera.x === this.#x && camera.y === this.#y && camera.zoom === this.#zoom) {
          camera.x = this.#x = mercatorX(natural.center[0]);
          camera.y = this.#y = mercatorY(natural.center[1]);
          camera.zoom = natural.zoom;
        }
        const cover = Math.max(rect.width / natural.width, rect.height / natural.height);
        this.#zoom = this.#posterCamera.zoom + Math.log2(cover);
        this.#posterCamera.zoom = this.#zoom;
        this.#posterGrouping = { level: Math.floor(natural.zoom), zoom: this.#zoom };
        this.#groupCache = null;
        this.#drawMarkers(this.clientWidth, this.clientHeight, false);
      }
    }
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave", "dblclick", "keydown"]) {
      this.addEventListener(type, this);
    }
    this.addEventListener("wheel", this, { passive: false });
    new ResizeObserver(() => this.#schedule()).observe(this);
    this.#fontReady = this.#loadFont();
    this.#fontReady.then(() => {
      this.toggleAttribute("interactive", true);
      this.dispatchEvent(new Event("interactive"));
      this.#schedule();
    });
    this.#schedule();
  }

  handleEvent(event: Event): void {
    if (event.type === "keydown") return this.#onKey(event as KeyboardEvent);
    if (event.type === "wheel") return this.#onWheel(event as WheelEvent);
    const pointer = event as PointerEvent;
    const rect = this.getBoundingClientRect();
    const x = pointer.clientX - rect.left;
    const y = pointer.clientY - rect.top;
    if (this.#popupHost?.contains(event.target as Node) || (event.target as Element)?.closest?.("[slot=popup]")) return;
    switch (event.type) {
      case "pointerdown":
        if (pointer.button !== 0 && pointer.pointerType === "mouse") return;
        if (this.#viewport.querySelector(".controls")?.contains(event.composedPath()[0] as Node)) return;
        if (pointer.pointerType === "mouse") this.#engage();
        this.#stopAnimation();
        this.setPointerCapture(pointer.pointerId);
        this.#pointers.set(pointer.pointerId, { x, y });
        this.#samples = [{ x, y, t: performance.now() }];
        this.#dragged = 0;
        this.#pinch = null;
        if (!this.#wake) this.#wake = { start: performance.now(), x, y };
        break;
      case "pointermove": {
        const previous = this.#pointers.get(pointer.pointerId);
        if (!previous) {
          this.#hover(x, y);
          return;
        }
        this.#pointers.set(pointer.pointerId, { x, y });
        const points = [...this.#pointers.values()];
        if (points.length === 1) {
          this.#dragged += Math.hypot(x - previous.x, y - previous.y);
          this.#panBy(previous.x - x, previous.y - y);
          this.#samples.push({ x, y, t: performance.now() });
          if (this.#samples.length > 6) this.#samples.shift();
        } else {
          const [a, b] = points as [{ x: number; y: number }, { x: number; y: number }];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          if (!this.hasAttribute("engaged")) this.#engage();
          if (this.#pinch) {
            this.#panBy(this.#pinch.midX - midX, this.#pinch.midY - midY);
            this.#zoomAround(Math.log2(distance / this.#pinch.distance), midX, midY);
          }
          this.#pinch = { distance, midX, midY };
          this.#dragged = Infinity;
        }
        break;
      }
      case "pointerup":
      case "pointercancel": {
        if (!this.#pointers.delete(pointer.pointerId)) return;
        if (this.#pointers.size === 0) {
          if (this.#dragged < 6 && event.type === "pointerup") this.#tap(x, y);
          else this.#fling();
        }
        this.#pinch = null;
        break;
      }
      case "pointerleave":
        if (this.#hovered) this.#hover(-1, -1);
        break;
      case "dblclick":
        if (this.#hitAt(x, y)) return;
        this.#animateZoom(1, x, y);
        break;
    }
  }

  get #world(): number {
    return TILE_SIZE * 2 ** this.#zoom;
  }

  #build(): void {
    this.#root = this.attachShadow({ mode: "open" });
    this.#root.innerHTML = `<style>${SHADOW_CSS}</style><style class="variables"></style><div class="viewport" part="viewport"><slot></slot><div class="tiles"></div><canvas></canvas><div class="popups"><slot name="popup"></slot></div><div class="controls" part="controls"><button type="button" data-zoom="1" aria-label="Zoom in">${ICON_PLUS}</button><button type="button" data-zoom="-1" aria-label="Zoom out">${ICON_MINUS}</button></div><div class="credit" part="attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a></div><div class="hint" aria-hidden="true"></div><ul class="sr" aria-label="Places on the map"></ul></div>`;
    this.#variableSheet = this.#root.querySelector("style.variables");
    this.#variableSheet!.textContent = this.#variables;
    this.#viewport = this.#root.querySelector(".viewport")!;
    this.#tileLayer = this.#root.querySelector(".tiles")!;
    this.#canvas = this.#root.querySelector("canvas")!;
    this.#hint = this.#root.querySelector(".hint")!;
    this.#list = this.#root.querySelector(".sr")!;
    for (const button of this.#root.querySelectorAll<HTMLButtonElement>("[data-zoom]")) {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.#animateZoom(Number(button.dataset.zoom), this.clientWidth / 2, this.clientHeight / 2);
      });
    }
    this.#list.addEventListener("click", (event) => {
      const id = (event.target as HTMLElement).closest<HTMLElement>("[data-id]")?.dataset.id;
      if (id) this.#activateMarker(this.#byId.get(id)!);
    });
    this.#list.addEventListener("focusin", (event) => this.highlight((event.target as HTMLElement).dataset.id ?? null));
    this.#list.addEventListener("focusout", () => this.highlight(null));
    if (!document.getElementById("instant-map-card-style")) {
      const style = document.createElement("style");
      style.id = "instant-map-card-style";
      style.textContent = CARD_CSS;
      document.head.append(style);
    }
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    if (!this.hasAttribute("role")) this.setAttribute("role", "application");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "Map");
    this.setAttribute("aria-roledescription", "map");
  }

  #readAttributes(): void {
    this.#src = (this.getAttribute("src") ?? DEFAULT_SRC).replace(/\/$/, "");
    this.#theme = this.getAttribute("theme") ?? this.#theme;
    if (this.hasAttribute("colors")) this.#colors = decodeColors(this.getAttribute("colors"));
    const distance = this.getAttribute("cluster");
    if (distance !== null) this.#clusterDistance = distance === "off" || distance === "false" ? 0 : Number(distance) || DEFAULT_CLUSTER_DISTANCE;
    if (this.hasAttribute("markers") && !this.#markers.length) this.markers = parseMarkerList(this.getAttribute("markers")) as Marker<Data>[];
    const poster = this.querySelector<HTMLImageElement>(":scope > img, :scope > picture > img");
    const fromPoster = poster ? readPosterCamera(poster) : null;
    const center = this.getAttribute("center")?.split(",").map(Number);
    if (center && center.length === 2 && center.every(Number.isFinite)) {
      this.#x = mercatorX(center[0]!);
      this.#y = mercatorY(center[1]!);
    } else if (fromPoster) {
      this.#x = mercatorX(fromPoster.center[0]);
      this.#y = mercatorY(fromPoster.center[1]);
    }
    const zoom = Number(this.getAttribute("zoom"));
    if (this.hasAttribute("zoom") && Number.isFinite(zoom)) this.#zoom = zoom;
    else if (fromPoster) this.#zoom = fromPoster.zoom;
    if (this.hasAttribute("selected")) this.#selected = this.getAttribute("selected");
    this.#applyPalette();
    if (poster) this.#adoptPoster(poster);
  }

  #start(): void {
    if (!this.#poster && !this.hasAttribute("center") && this.#markers.length && this.clientWidth) {
      const target = this.#fitCamera(boundsOf(this.#markers));
      this.#x = target.x;
      this.#y = target.y;
      this.#zoom = target.zoom;
    }
    if (!this.#poster) this.#adoptPoster(this.#createPoster());
    const mode = (this.getAttribute("load") ?? "intent") as LoadMode;
    if (mode === "eager") return this.activate();
    if (mode === "none") return;
    const wake = (event: Event) => {
      if (event instanceof PointerEvent || event.type === "touchstart") {
        const rect = this.getBoundingClientRect();
        const point = event instanceof PointerEvent ? event : (event as TouchEvent).touches[0];
        if (point) this.#wake = { start: performance.now(), x: point.clientX - rect.left, y: point.clientY - rect.top };
      }
      const asleep = !this.#active;
      this.activate();
      if (asleep && event.type === "pointerdown") this.handleEvent(event);
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

  #fitCamera(bounds: Bounds): { x: number; y: number; zoom: number } {
    const [west, south, east, north] = bounds;
    const width = Math.max(1, this.clientWidth - 96);
    const height = Math.max(1, this.clientHeight - 96);
    const spanX = Math.max(1e-9, mercatorX(east) - mercatorX(west));
    const spanY = Math.max(1e-9, mercatorY(south) - mercatorY(north));
    const zoom = Math.min(15, Math.log2(Math.min(width / spanX, height / spanY) / TILE_SIZE));
    return { x: (mercatorX(west) + mercatorX(east)) / 2, y: (mercatorY(north) + mercatorY(south)) / 2, zoom: Math.round(zoom * 100) / 100 };
  }

  #refreshPoster(): void {
    if (this.#posterQueued) return;
    this.#posterQueued = true;
    queueMicrotask(() => {
      this.#posterQueued = false;
      if (this.#poster && this.#ownPoster && !this.#active) this.#poster.src = this.#posterUrl();
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
    return staticUrl({
      src: this.#src,
      center: [longitudeOf(this.#x), latitudeOf(this.#y)],
      zoom: this.#zoom,
      width: Math.min(MAX_STATIC_SIZE, this.clientWidth || 640),
      height: Math.min(MAX_STATIC_SIZE, this.clientHeight || 400),
      ratio: (globalThis.devicePixelRatio ?? 1) > 1 ? 2 : 1,
      theme: this.#theme as Theme,
      colors: this.#colors,
      markers: this.#markers,
      cluster: this.#clusterDistance || false,
    });
  }

  #adoptPoster(img: HTMLImageElement): void {
    this.#poster = img;
    img.draggable = false;
    if (img.parentElement !== this) Object.assign(img.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", transformOrigin: "50% 50%", transition: "opacity .32s ease" });
    this.#posterCamera = { x: this.#x, y: this.#y, zoom: this.#zoom };
  }

  #applyPalette(): void {
    this.#palette = resolvePalette(this.#theme, this.#colors);
    const palette = this.#palette;
    const dark = luminance(palette.land) < 0.18;
    const card = dark ? "#1b2029" : "#ffffff";
    const variables: Record<string, string> = {
      "--im-land": palette.land,
      "--im-card": card,
      "--im-ink": palette.label,
      "--im-muted": palette.labelMinor,
      "--im-accent": palette.accent,
      "--im-marker": palette.marker,
      "--im-marker-text": palette.markerText,
      "--im-hairline": dark ? "#ffffff1f" : "#0000001a",
      "--im-hover": dark ? "#ffffff12" : "#0000000a",
      "--im-shadow": palette.shadow,
    };
    this.#variables = `:host{${Object.entries(variables)
      .map(([name, value]) => `${name}:${value}`)
      .join(";")}}`;
    if (this.#variableSheet) this.#variableSheet.textContent = this.#variables;
    this.#look = `${this.#theme}|${JSON.stringify(this.#colors)}`;
    if (this.#ownPoster && !this.#active) this.#refreshPoster();
    this.#schedule();
  }

  async #loadFont(): Promise<void> {
    if (typeof FontFace === "undefined") return;
    const id = "Instant Map Sans";
    if ([...document.fonts].some((font) => font.family.replace(/"/g, "") === id && font.status === "loaded")) return;
    try {
      const face = new FontFace(id, `url(${this.#src}/fonts/noto-sans-500.woff2) format("woff2")`, { weight: "500" });
      document.fonts.add(face);
      await Promise.race([face.load(), new Promise((resolve) => setTimeout(resolve, 400))]);
    } catch {
      return;
    }
  }

  #resetTiles(): void {
    for (const tile of this.#tiles.values()) tile.remove();
    this.#tiles.clear();
    this.#schedule();
  }

  #panBy(dx: number, dy: number): void {
    const world = this.#world;
    this.#x = (((this.#x + dx / world) % 1) + 1) % 1;
    this.#y = Math.max(0, Math.min(1, this.#y + dy / world));
    this.#changed();
  }

  #zoomAround(delta: number, px: number, py: number): void {
    const before = this.#world;
    this.#zoom = Math.max(0, Math.min(MAX_ZOOM, this.#zoom + delta));
    const after = this.#world;
    const offsetX = px - this.clientWidth / 2;
    const offsetY = py - this.clientHeight / 2;
    this.#x = (((this.#x + offsetX / before - offsetX / after) % 1) + 1) % 1;
    this.#y = Math.max(0, Math.min(1, this.#y + offsetY / before - offsetY / after));
    this.#changed();
  }

  #animateZoom(delta: number, px: number, py: number): void {
    this.activate();
    const target = Math.max(0, Math.min(MAX_ZOOM, Math.round(this.#zoom + delta)));
    if (reducedMotion()) {
      this.#zoomAround(target - this.#zoom, px, py);
      this.#moveEnd();
      return;
    }
    const start = this.#zoom;
    const began = performance.now();
    this.#stopAnimation();
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / 260);
      this.#zoomAround(start + (target - start) * easeInOut(progress) - this.#zoom, px, py);
      if (progress < 1) this.#animation = requestAnimationFrame(step);
      else {
        this.#animation = 0;
        this.#moveEnd();
      }
    };
    this.#animation = requestAnimationFrame(step);
  }

  #fling(): void {
    const samples = this.#samples;
    const first = samples[0];
    const last = samples.at(-1);
    if (!first || !last || reducedMotion() || last.t - first.t <= 0 || performance.now() - last.t > 80) return this.#moveEnd();
    let velocityX = (last.x - first.x) / (last.t - first.t);
    let velocityY = (last.y - first.y) / (last.t - first.t);
    if (Math.hypot(velocityX, velocityY) < 0.15) return this.#moveEnd();
    let previous = performance.now();
    const step = (now: number) => {
      const elapsed = now - previous;
      previous = now;
      this.#panBy(-velocityX * elapsed, -velocityY * elapsed);
      const decay = 0.995 ** elapsed;
      velocityX *= decay;
      velocityY *= decay;
      if (Math.hypot(velocityX, velocityY) > 0.02) this.#animation = requestAnimationFrame(step);
      else {
        this.#animation = 0;
        this.#moveEnd();
      }
    };
    this.#animation = requestAnimationFrame(step);
  }

  #stopAnimation(): void {
    if (this.#animation) cancelAnimationFrame(this.#animation);
    this.#animation = 0;
  }

  #onWheel(event: WheelEvent): void {
    const mode = (this.getAttribute("scroll-zoom") ?? "cooperative") as ScrollZoom;
    if (mode === "off") return;
    const modified = event.ctrlKey || event.metaKey;
    if (mode === "cooperative" && !modified && !this.#engaged) {
      this.#hint.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "Use ⌘ + scroll to zoom the map" : "Use Ctrl + scroll to zoom the map";
      this.#hint.classList.add("on");
      clearTimeout(this.#hintTimer);
      this.#hintTimer = window.setTimeout(() => this.#hint.classList.remove("on"), 1100);
      return;
    }
    event.preventDefault();
    this.#hint.classList.remove("on");
    this.#stopAnimation();
    const rect = this.getBoundingClientRect();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const delta = event.deltaY * scale;
    const amount = event.ctrlKey ? -delta * 0.012 : -delta * 0.0024;
    this.#zoomAround(Math.max(-1, Math.min(1, amount)), event.clientX - rect.left, event.clientY - rect.top);
    clearTimeout(this.#moveEndTimer);
    this.#moveEndTimer = window.setTimeout(() => this.#moveEnd(), 160);
  }

  #onKey(event: KeyboardEvent): void {
    if (event.target !== this) {
      if (event.key === "Escape" && this.#selected) {
        this.select(null);
        this.focus();
      }
      return;
    }
    const step = 96;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) {
      this.activate();
      this.#panBy(move[0], move[1]);
      clearTimeout(this.#moveEndTimer);
      this.#moveEndTimer = window.setTimeout(() => this.#moveEnd(), 200);
    } else if (event.key === "+" || event.key === "=") this.#animateZoom(1, this.clientWidth / 2, this.clientHeight / 2);
    else if (event.key === "-" || event.key === "_") this.#animateZoom(-1, this.clientWidth / 2, this.clientHeight / 2);
    else if (event.key === "Escape" && this.#selected) this.select(null);
    else return;
    event.preventDefault();
  }

  #hitAt(x: number, y: number): Hit<Data> | null {
    for (let index = this.#hits.length - 1; index >= 0; index--) {
      const hit = this.#hits[index]!;
      const slop = 6;
      if (hit.kind === "pill") {
        if (Math.abs(x - hit.x) <= hit.width / 2 + slop && Math.abs(y - hit.y) <= hit.height / 2 + slop) return hit;
      } else if (Math.hypot(x - hit.x, y - hit.y) <= hit.width / 2 + slop) return hit;
    }
    return null;
  }

  #hover(x: number, y: number): void {
    const hit = x < 0 ? null : this.#hitAt(x, y);
    const previous = this.#hovered;
    if (previous?.group === hit?.group) return;
    this.#hovered = hit;
    this.style.cursor = hit ? "pointer" : "";
    const previousMarker = previous && previous.group.members.length === 1 ? previous.group.members[0] : null;
    const nextMarker = hit && hit.group.members.length === 1 ? hit.group.members[0] : null;
    if (previousMarker) this.dispatchEvent(new CustomEvent("markerleave", { detail: { marker: previousMarker }, bubbles: true, composed: true }));
    if (nextMarker) this.dispatchEvent(new CustomEvent("markerenter", { detail: { marker: nextMarker }, bubbles: true, composed: true }));
    this.#schedule();
  }

  #tap(x: number, y: number): void {
    this.#engage();
    const hit = this.#hitAt(x, y);
    if (!hit) {
      if (this.#selected) this.select(null);
      this.#moveEnd();
      return;
    }
    if (hit.group.members.length > 1) {
      const cluster: Cluster<Data> = {
        lng: this.unproject(hit.x, hit.y)[0],
        lat: this.unproject(hit.x, hit.y)[1],
        markers: hit.group.members,
        bounds: boundsOf(hit.group.members),
      };
      const event = new CustomEvent("clusterclick", { detail: { cluster }, bubbles: true, composed: true, cancelable: true });
      if (this.dispatchEvent(event)) {
        const [west, south, east, north] = cluster.bounds;
        if (west === east && south === north) this.flyTo({ center: [west, south], zoom: Math.min(MAX_ZOOM, this.#zoom + 3) });
        else this.fitBounds(cluster.bounds, { padding: 64, maxZoom: Math.max(this.#zoom + 1, 17) });
      }
      return;
    }
    this.#activateMarker(hit.group.members[0]!);
  }

  #engage(): void {
    this.#engaged = true;
    this.toggleAttribute("engaged", true);
  }

  #activateMarker(marker: Marker<Data>): void {
    const event = new CustomEvent("markerclick", { detail: { marker }, bubbles: true, composed: true, cancelable: true });
    if (this.dispatchEvent(event)) this.select(marker.id);
  }

  #renderPopup(): void {
    this.#popupHost?.remove();
    this.#popupHost = null;
    this.#popupFor = null;
    const marker = this.selected;
    if (!marker || !this.popup) return;
    const content = this.popup(marker);
    if (content === null || content === undefined || content === "") return;
    const host = document.createElement("div");
    host.slot = "popup";
    host.className = "instant-map-popup";
    if (typeof content === "string") host.innerHTML = content;
    else host.append(content);
    host.addEventListener("click", (event) => {
      if ((event.target as Element).closest("button.close")) {
        event.stopPropagation();
        this.select(null);
        this.focus();
      }
    });
    host.addEventListener("pointerdown", (event) => event.stopPropagation());
    host.addEventListener("wheel", (event) => event.stopPropagation());
    this.append(host);
    this.#popupHost = host;
    this.#popupFor = String(marker.id);
    this.#positionPopup();
    requestAnimationFrame(() => this.#keepPopupInView());
  }

  #positionPopup(): void {
    const host = this.#popupHost;
    if (!host || !this.#popupFor) return;
    const marker = this.#byId.get(this.#popupFor);
    if (!marker) return;
    const [x, y] = this.project(marker.lng, marker.lat);
    const offset = marker.label ? PILL_HEIGHT / 2 + 10 : DOT_RADIUS + 10;
    host.style.transform = `translate(${Math.round(x)}px,${Math.round(y - offset)}px) translate(-50%,-100%)`;
  }

  #keepPopupInView(): void {
    const host = this.#popupHost;
    if (!host) return;
    const map = this.getBoundingClientRect();
    const box = host.getBoundingClientRect();
    const margin = 12;
    const dx = Math.min(0, box.left - map.left - margin) + Math.max(0, box.right - map.right + margin + 56);
    const dy = Math.min(0, box.top - map.top - margin) + Math.max(0, box.bottom - map.bottom + margin);
    if (!dx && !dy) return;
    const [lng, lat] = this.unproject(this.clientWidth / 2 + dx, this.clientHeight / 2 + dy);
    void this.flyTo({ center: [lng, lat], zoom: this.#zoom, duration: 320 });
  }

  #changed(): void {
    this.#schedule();
    this.dispatchEvent(new CustomEvent("move", { detail: this.camera, bubbles: true, composed: true }));
  }

  #moveEnd(): void {
    this.#updateList();
    this.dispatchEvent(new CustomEvent("moveend", { detail: this.camera, bubbles: true, composed: true }));
  }

  #schedule(): void {
    if (this.#frame || !this.#connected) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#draw();
    });
  }

  #draw(): void {
    const width = this.clientWidth;
    const height = this.clientHeight;
    if (!width || !height) return;
    if (!this.#active) {
      this.#drawPosterTransform();
      return;
    }
    const pending = this.#drawTiles(width, height);
    this.#drawPosterTransform();
    const handedOff = !this.#poster;
    if (!pending && this.#poster) this.#retirePoster();
    this.#drawMarkers(width, height, handedOff);
    this.#positionPopup();
    const wasIdle = this.#idle;
    this.#idle = pending === 0 && !this.#animation && !this.#wakeRunning();
    if (this.#idle && !wasIdle) {
      this.#updateList();
      this.dispatchEvent(new Event("idle"));
    }
    if (this.#wakeRunning()) this.#schedule();
  }

  #drawPosterTransform(): void {
    const poster = this.#poster;
    const camera = this.#posterCamera;
    if (!poster || !camera) return;
    const scale = 2 ** (this.#zoom - camera.zoom);
    const world = this.#world;
    let dx = camera.x - this.#x;
    if (dx > 0.5) dx -= 1;
    if (dx < -0.5) dx += 1;
    const tx = dx * world;
    const ty = (camera.y - this.#y) * world;
    poster.style.transform = scale === 1 && !tx && !ty ? "" : `translate(${tx}px,${ty}px) scale(${scale})`;
  }

  #retirePoster(): void {
    const poster = this.#poster!;
    this.#poster = null;
    poster.style.opacity = "0";
    setTimeout(() => {
      poster.style.visibility = "hidden";
    }, 360);
    if (!this.#wake) this.#wake = { start: performance.now(), x: this.clientWidth / 2, y: this.clientHeight / 2 };
    else this.#wake.start = performance.now();
  }

  #wakeRunning(): boolean {
    return !!this.#wake && performance.now() - this.#wake.start < 900;
  }

  #drawTiles(width: number, height: number): number {
    const z = Math.max(0, Math.min(MAX_TILE_ZOOM, Math.round(this.#zoom)));
    const count = 2 ** z;
    const size = TILE_SIZE * 2 ** (this.#zoom - z);
    const left = this.#x * this.#world - width / 2;
    const top = this.#y * this.#world - height / 2;
    const ratio = (globalThis.devicePixelRatio ?? 1) > 1 ? 2 : 1;
    const wanted = new Set<string>();
    let pending = 0;
    const firstRow = Math.max(0, Math.floor(top / size));
    const lastRow = Math.min(count - 1, Math.floor((top + height) / size));
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = Math.floor(left / size); column <= Math.floor((left + width) / size); column++) {
        const key = `${z}/${column}/${row}/${this.#look}`;
        wanted.add(key);
        let tile = this.#tiles.get(key);
        if (!tile) {
          tile = new Image() as Tile;
          tile.decoding = "async";
          tile.alt = "";
          tile.zoomLevel = z;
          tile.column = column;
          tile.row = row;
          tile.loaded = false;
          tile.look = this.#look;
          const created = tile;
          created.onload = created.onerror = () => {
            created.loaded = true;
            created.classList.add("on");
            this.#schedule();
          };
          created.src = tileUrl(this.#src, z, ((column % count) + count) % count, row, ratio, this.#theme, this.#colors);
          this.#tiles.set(key, created);
          this.#tileLayer.append(created);
        }
        if (!tile.loaded) pending++;
        tile.style.zIndex = "2";
        tile.style.transform = `translate(${column * size - left}px,${row * size - top}px) scale(${size / TILE_SIZE})`;
      }
    }
    for (const [key, tile] of this.#tiles) {
      if (wanted.has(key)) continue;
      if (pending === 0 || (tile.zoomLevel === z && tile.look === this.#look) || !tile.loaded) {
        tile.remove();
        this.#tiles.delete(key);
        continue;
      }
      const scale = 2 ** (this.#zoom - tile.zoomLevel);
      tile.style.zIndex = "1";
      tile.style.transform = `translate(${tile.column * TILE_SIZE * scale - left}px,${tile.row * TILE_SIZE * scale - top}px) scale(${scale})`;
    }
    return pending;
  }

  #groups(): Group<Data>[] {
    if (this.#posterGrouping && this.#posterGrouping.zoom !== this.#zoom) this.#posterGrouping = null;
    const zoom = this.#posterGrouping?.level ?? Math.floor(this.#zoom);
    if (this.#groupCache?.zoom !== zoom) this.#groupCache = { zoom, groups: clusterAt(this.#markers, zoom, this.#clusterDistance) };
    return this.#groupCache.groups;
  }

  #drawMarkers(width: number, height: number, visible: boolean): void {
    const ratio = globalThis.devicePixelRatio ?? 1;
    const canvas = this.#canvas;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d")!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    this.#hits = [];
    context.globalAlpha = visible ? 1 : 0;
    const palette = this.#palette;
    const groups = this.#groups();
    const scale = 2 ** (this.#zoom - this.#groupCache!.zoom);
    const world = this.#world;
    const centerX = this.#x * world;
    const centerY = this.#y * world;
    const now = performance.now();
    const wake = this.#wake && !reducedMotion() ? this.#wake : null;
    const selectedId = this.#selected;
    const highlightId = this.#highlighted;
    const items: (Hit<Data> & { emphasis: number; pop: number })[] = [];
    for (const group of groups) {
      let dx = group.x * scale - centerX;
      if (dx > world / 2) dx -= world;
      if (dx < -world / 2) dx += world;
      const x = width / 2 + dx;
      const y = height / 2 + group.y * scale - centerY;
      if (x < -80 || y < -40 || x > width + 80 || y > height + 40) continue;
      const count = group.members.length;
      const first = group.members[0]!;
      const label = count === 1 ? (first.label ?? "").slice(0, MAX_LABEL_LENGTH) : "";
      let kind: Hit<Data>["kind"] = count > 1 ? "cluster" : label ? "pill" : "dot";
      let itemWidth: number;
      let itemHeight: number;
      if (kind === "pill") {
        context.font = `500 13px ${FONT_FAMILY}`;
        itemWidth = Math.max(PILL_HEIGHT, Math.ceil(context.measureText(label).width) + PILL_PADDING * 2);
        itemHeight = PILL_HEIGHT;
      } else if (kind === "cluster") {
        itemWidth = itemHeight = 2 * (10 + 3.5 * Math.min(7, Math.log2(count)));
      } else {
        itemWidth = itemHeight = DOT_RADIUS * 2;
      }
      const ids = group.members.map((member) => String(member.id));
      const emphasis = ids.includes(selectedId ?? "\u0000") ? 2 : ids.includes(highlightId ?? "\u0000") || this.#hovered?.group === group ? 1 : 0;
      let pop = 0;
      if (wake) {
        const delay = Math.hypot(x - wake.x, y - wake.y) * 0.55;
        const t = (now - wake.start - delay) / 420;
        if (t > 0 && t < 1) pop = Math.sin(Math.PI * t) * (1 - t);
      }
      if (kind === "pill" && emphasis === 0 && !label) kind = "dot";
      items.push({ group, x, y, kind, width: itemWidth, height: itemHeight, emphasis, pop });
    }
    items.sort((a, b) => a.emphasis - b.emphasis);
    for (const item of items) {
      this.#paintItem(context, item, palette);
      this.#hits.push(item);
    }
  }

  #paintItem(context: CanvasRenderingContext2D, item: Hit<Data> & { emphasis: number; pop: number }, palette: Palette): void {
    const lift = item.emphasis > 0 ? 1.08 : 1;
    const scale = lift + item.pop * 0.22;
    context.save();
    context.translate(item.x, item.y);
    context.scale(scale, scale);
    context.shadowColor = palette.shadow;
    context.shadowBlur = item.emphasis ? 12 : 6 + item.pop * 10;
    context.shadowOffsetY = item.emphasis ? 4 : 2 + item.pop * 3;
    const selected = item.emphasis === 2;
    if (item.kind === "pill") {
      const width = item.width;
      const half = width / 2;
      const radius = PILL_HEIGHT / 2;
      context.beginPath();
      context.roundRect(-half, -radius, width, PILL_HEIGHT, radius);
      context.fillStyle = selected ? palette.selected : palette.marker;
      context.fill();
      context.shadowColor = "transparent";
      if (item.emphasis === 1) {
        context.lineWidth = 2;
        context.strokeStyle = palette.selected;
        context.stroke();
      }
      context.fillStyle = selected ? palette.selectedText : palette.markerText;
      context.font = `500 13px ${FONT_FAMILY}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText((item.group.members[0]!.label ?? "").slice(0, MAX_LABEL_LENGTH), 0, 1);
    } else if (item.kind === "cluster") {
      const radius = item.width / 2;
      context.beginPath();
      context.arc(0, 0, radius + 2.5, 0, Math.PI * 2);
      context.fillStyle = palette.land;
      context.fill();
      context.shadowColor = "transparent";
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fillStyle = palette.cluster;
      context.fill();
      if (item.emphasis) {
        context.lineWidth = 2.5;
        context.strokeStyle = palette.selected;
        context.stroke();
      }
      context.fillStyle = palette.clusterText;
      context.font = `500 12px ${FONT_FAMILY}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(shortCount(item.group.members.length), 0, 0.5);
    } else {
      context.beginPath();
      context.arc(0, 0, DOT_RADIUS + (item.emphasis ? 2 : 0), 0, Math.PI * 2);
      context.fillStyle = selected ? palette.selected : palette.accent;
      context.fill();
      context.shadowColor = "transparent";
      context.lineWidth = 2.5;
      context.strokeStyle = palette.land;
      context.stroke();
    }
    context.restore();
  }

  #updateList(): void {
    const singles = this.#hits.filter((hit) => hit.group.members.length === 1).slice(0, 50);
    this.#list.replaceChildren(
      ...singles.map((hit) => {
        const marker = hit.group.members[0]!;
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.id = String(marker.id);
        button.textContent = [marker.title, marker.label].filter(Boolean).join(", ") || `Place ${marker.id}`;
        item.append(button);
        return item;
      }),
    );
  }
}
