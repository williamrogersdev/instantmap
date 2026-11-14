import { CARD_CSS, CARD_STYLE_ID, cardFromTemplate, defaultCard, safeUrl } from "./card.ts";
import { boundsOf, clusterAt, type Group, MAX_LABEL_LENGTH, mercatorX, mercatorY, TILE_SIZE } from "./cluster.ts";
import { type Bridge, type EngineHandle, type InstantMapElement, type MapState, MAX_ZOOM } from "./element.ts";
import { pixelRatio, tileUrl } from "./static-url.ts";
import { type Palette, resolvePalette } from "./themes.ts";
import type { AnimationOptions, CameraOptions, CardImages, CardOptions, Cluster, Marker, ScrollZoom } from "./types.ts";

// The live map: raster tiles, markers on a canvas, gestures, keyboard and cards.
// The element imports this file on the first sign of intent, so nothing here costs a page that is never touched.

const MAX_TILE_ZOOM = 15;
const FONT_FAMILY = '"Instant Map Sans", "Noto Sans", system-ui, sans-serif';
const PILL_HEIGHT = 26;
const PILL_PADDING = 10;
const DOT_RADIUS = 7;
const SPRITE_MARGIN = 18;
const MAX_SPRITES = 800;
const MAX_CANVAS_RATIO = 2;
const WARM_LIMIT = 8;
const WARM_MEMORY = 32;

type Kind = "pill" | "dot" | "cluster";

interface Hit<Data> {
  group: Group<Data>;
  x: number;
  y: number;
  kind: Kind;
  width: number;
  height: number;
}

interface Tile extends HTMLImageElement {
  zoomLevel: number;
  column: number;
  row: number;
  loaded: boolean;
  look: string;
  attempts: number;
}

interface Grouping<Data> {
  zoom: number;
  revision: number;
  groups: Group<Data>[];
  groupOf: Map<string, Group<Data>>;
}

interface Sprite {
  image: CanvasImageSource;
  width: number;
  height: number;
}

const CSS = `
:host{font-family:${FONT_FAMILY}}
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
.hint{position:absolute;inset:0;z-index:8;display:grid;place-items:center;background:color-mix(in srgb,#000 38%,transparent);color:#fff;font:600 15px/1.4 system-ui,sans-serif;opacity:0;transition:opacity .25s;pointer-events:none}
.hint.on{opacity:1}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;margin:0;padding:0;list-style:none}
@media (prefers-reduced-motion:reduce){.controls,.tiles img,.hint{transition:none}}
`;

const ICON_PLUS = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_MINUS = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const clampZoom = (zoom: number): number => Math.max(0, Math.min(MAX_ZOOM, zoom));

const wrap = (value: number): number => ((value % 1) + 1) % 1;

function shortCount(count: number): string {
  if (count >= 10000) return `${Math.floor(count / 1000)}k`;
  if (count >= 1000) {
    const tenths = Math.floor(count / 100);
    return tenths % 10 ? `${Math.floor(tenths / 10)}.${tenths % 10}k` : `${tenths / 10}k`;
  }
  return String(count);
}

const savesData = (): boolean => {
  const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!connection && (connection.saveData === true || /2g/.test(connection.effectiveType ?? ""));
};

export class Engine<Data = unknown> implements EngineHandle {
  #host: InstantMapElement<Data>;
  #state: MapState<Data>;
  #bridge: Bridge<Data>;
  #tileLayer: HTMLDivElement;
  #canvas: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #hint: HTMLDivElement;
  #list: HTMLUListElement;
  #controls: HTMLElement;
  #groups: Grouping<Data> | null = null;
  #hovered: Hit<Data> | null = null;
  #hits: Hit<Data>[] = [];
  #tiles = new Map<string, Tile>();
  #sprites = new Map<string, Sprite>();
  #spriteLook = "";
  #palette: Palette = resolvePalette("daylight");
  #paletteLook = "";
  #widths = new Map<string, number>();
  #frame = 0;
  #active = false;
  #idle = false;
  /** Decided once, when the first tile is asked for, so one map does not mix sharp and soft tiles. */
  #ratio?: 1 | 2;
  #idleWaiters: (() => void)[] = [];
  #pointers = new Map<number, { x: number; y: number }>();
  #pinch: { distance: number; midX: number; midY: number } | null = null;
  #samples: { x: number; y: number; t: number }[] = [];
  #dragged = 0;
  #animation = 0;
  #zooming = false;
  #engaged = false;
  #hintTimer = 0;
  #moveEndTimer = 0;
  #popupHost: HTMLDivElement | null = null;
  #popupFor: string | null = null;
  #warmed = new Map<string, HTMLImageElement>();
  #warmQueued = false;

  constructor(host: InstantMapElement<Data>, bridge: Bridge<Data>) {
    this.#host = host;
    this.#bridge = bridge;
    this.#state = bridge.state;
    const root = bridge.root;
    const style = document.createElement("style");
    style.textContent = CSS;
    root.insertBefore(style, root.firstChild);
    const template = document.createElement("template");
    template.innerHTML = `<div class="tiles"></div><canvas></canvas><div class="popups"><slot name="popup"></slot></div><div class="controls" part="controls"><button type="button" data-zoom="1" aria-label="Zoom in">${ICON_PLUS}</button><button type="button" data-zoom="-1" aria-label="Zoom out">${ICON_MINUS}</button></div><div class="hint" aria-hidden="true"></div><ul class="sr" aria-label="Places on the map"></ul>`;
    bridge.viewport.append(template.content);
    this.#tileLayer = root.querySelector(".tiles")!;
    this.#canvas = root.querySelector("canvas")!;
    this.#context = this.#canvas.getContext("2d")!;
    this.#hint = root.querySelector(".hint")!;
    this.#list = root.querySelector(".sr")!;
    this.#controls = root.querySelector(".controls")!;
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-zoom]")) {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.#animateZoom(Number(button.dataset.zoom), host.clientWidth / 2, host.clientHeight / 2);
      });
    }
    this.#list.addEventListener("click", (event) => {
      const marker = this.#state.byId.get((event.target as HTMLElement).closest<HTMLElement>("[data-id]")?.dataset.id ?? "");
      if (marker) this.#activateMarker(marker);
    });
    this.#list.addEventListener("focusin", (event) => host.highlight((event.target as HTMLElement).dataset.id ?? null));
    this.#list.addEventListener("focusout", () => host.highlight(null));
    // Cards sit in the map's light DOM, so their styles go wherever the map itself is styled from.
    const scope = host.getRootNode();
    const styles = scope instanceof ShadowRoot ? scope : document.head;
    if (!styles.querySelector(`#${CARD_STYLE_ID}`)) {
      const sheet = document.createElement("style");
      sheet.id = CARD_STYLE_ID;
      sheet.textContent = CARD_CSS;
      styles.append(sheet);
    }
  }

  activate(): void {
    if (this.#active) return;
    this.#active = true;
    const host = this.#host;
    if (this.#state.poster) {
      this.#bridge.syncPoster();
      this.#drawMarkers(host.clientWidth, host.clientHeight, false);
    }
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave", "dblclick", "keydown"]) host.addEventListener(type, this);
    host.addEventListener("wheel", this, { passive: false });
    new ResizeObserver(() => this.schedule()).observe(host);
    void this.#loadFont().then(() => {
      this.#sprites.clear();
      this.#widths.clear();
      host.toggleAttribute("interactive", true);
      host.dispatchEvent(new Event("interactive"));
      this.schedule();
    });
    this.#preconnect();
    if (this.#state.selected) this.renderPopup();
    this.schedule();
  }

  schedule(): void {
    if (this.#frame || !this.#host.isConnected) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#draw();
    });
  }

  stop(): void {
    if (this.#animation) cancelAnimationFrame(this.#animation);
    this.#animation = 0;
    this.#zooming = false;
  }

  pause(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.stop();
  }

  regroup(): void {
    this.#groups = null;
    this.schedule();
  }

  resetTiles(): void {
    for (const tile of this.#tiles.values()) tile.remove();
    this.#tiles.clear();
    this.schedule();
  }

  whenIdle(): Promise<void> {
    if (this.#idle && !this.#frame) return Promise.resolve();
    // Not the "idle" event: that fires only when the map goes from busy to idle, and a map that is already idle
    // with one more frame to draw would never fire it.
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  /** Starts a drag from a press that began before the engine had loaded. */
  press(event: PointerEvent): void {
    const { x, y } = this.#local(event);
    this.#down(event, x, y);
  }

  tap(x: number, y: number): void {
    this.#tap(x, y);
  }

  flyTo(options: CameraOptions & AnimationOptions): Promise<void> {
    const state = this.#state;
    const host = this.#host;
    const fromX = state.x;
    const fromY = state.y;
    const fromZoom = state.zoom;
    const toX = options.center ? mercatorX(options.center[0]) : fromX;
    const toY = options.center ? mercatorY(options.center[1]) : fromY;
    const toZoom = clampZoom(options.zoom ?? fromZoom);
    this.stop();
    if (options.animate === false || reducedMotion()) {
      state.x = toX;
      state.y = toY;
      state.zoom = toZoom;
      this.#changed();
      this.#moveEnd();
      return Promise.resolve();
    }
    let deltaX = toX - fromX;
    if (deltaX > 0.5) deltaX -= 1;
    if (deltaX < -0.5) deltaX += 1;
    const span = Math.max(1, host.clientWidth, host.clientHeight);
    const travel = Math.hypot(deltaX, toY - fromY) * TILE_SIZE * 2 ** Math.min(fromZoom, toZoom);
    const bump = travel > span ? Math.log2(travel / span) + 0.5 : 0;
    const duration = options.duration ?? Math.min(1600, 450 + 160 * (Math.abs(toZoom - fromZoom) + bump));
    const started = performance.now();
    this.#zooming = toZoom !== fromZoom || bump > 0;
    return new Promise((resolve) => {
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = easeInOut(progress);
        state.x = wrap(fromX + deltaX * eased);
        state.y = fromY + (toY - fromY) * eased;
        state.zoom = fromZoom + (toZoom - fromZoom) * eased - bump * Math.sin(Math.PI * progress);
        this.#changed();
        if (progress < 1) this.#animation = requestAnimationFrame(step);
        else {
          this.#animation = 0;
          this.#zooming = false;
          this.#moveEnd();
          resolve();
        }
      };
      this.#animation = requestAnimationFrame(step);
    });
  }

  handleEvent(event: Event): void {
    if (event.type === "keydown") return this.#onKey(event as KeyboardEvent);
    if (event.type === "wheel") return this.#onWheel(event as WheelEvent);
    const pointer = event as PointerEvent;
    const { x, y } = this.#local(pointer);
    if (this.#popupHost?.contains(event.target as Node) || (event.target as Element)?.closest?.("[slot=popup]")) return;
    switch (event.type) {
      case "pointerdown":
        if (pointer.button !== 0 && pointer.pointerType === "mouse") return;
        if (this.#controls.contains(event.composedPath()[0] as Node)) return;
        this.#down(pointer, x, y);
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
          if (!this.#engaged) this.#engage();
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

  renderPopup(): void {
    const host = this.#host;
    this.#popupHost?.remove();
    this.#popupHost = null;
    this.#popupFor = null;
    const marker = host.selected;
    if (!marker || host.popup === null || host.getAttribute("card") === "off") return;
    const template = host.querySelector<HTMLTemplateElement>(":scope > template[data-card]");
    const content = host.popup ? host.popup(marker) : template ? cardFromTemplate(template, marker) : defaultCard(marker, this.#cardOptions());
    if (content === null || content === undefined || content === "") return;
    const popup = document.createElement("div");
    popup.slot = "popup";
    popup.className = "instant-map-popup";
    if (typeof content === "string") popup.innerHTML = content;
    else popup.append(content);
    for (const image of popup.querySelectorAll("img")) {
      if (image.complete && image.naturalWidth) image.classList.add("ready");
      else image.addEventListener("load", () => image.classList.add("ready"), { once: true });
    }
    popup.addEventListener("click", (event) => {
      if ((event.target as Element).closest("button.close, [data-close]")) {
        event.stopPropagation();
        host.select(null);
        host.focus();
      }
    });
    popup.addEventListener("pointerdown", (event) => event.stopPropagation());
    popup.addEventListener("wheel", (event) => event.stopPropagation());
    host.append(popup);
    this.#popupHost = popup;
    this.#popupFor = String(marker.id);
    this.#positionPopup();
    requestAnimationFrame(() => this.#keepPopupInView());
  }

  get #world(): number {
    return TILE_SIZE * 2 ** this.#state.zoom;
  }

  #local(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.#host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  #cardOptions(): CardOptions {
    const host = this.#host;
    const layout = host.getAttribute("card-layout");
    const action = host.getAttribute("card-action");
    const target = host.getAttribute("card-target");
    return {
      ...(layout === "row" || layout === "stacked" ? { layout } : {}),
      ...(action === null ? {} : { action: action === "" || action === "off" ? false : action }),
      ...(target === "_blank" ? { target } : {}),
      ...host.card,
    };
  }

  #down(pointer: PointerEvent, x: number, y: number): void {
    if (pointer.pointerType === "mouse") this.#engage();
    this.stop();
    try {
      this.#host.setPointerCapture(pointer.pointerId);
    } catch {
      // The pointer was released while the engine was loading.
    }
    this.#pointers.set(pointer.pointerId, { x, y });
    this.#samples = [{ x, y, t: performance.now() }];
    this.#dragged = 0;
    this.#pinch = null;
    this.#state.wake ??= { start: performance.now(), x, y };
    const hit = this.#hitAt(x, y);
    if (hit?.group.members.length === 1) this.#warm(hit.group.members[0]!);
  }

  async #loadFont(): Promise<void> {
    if (typeof FontFace === "undefined") return;
    const id = "Instant Map Sans";
    if ([...document.fonts].some((font) => font.family.replace(/"/g, "") === id && font.status === "loaded")) return;
    try {
      const face = new FontFace(id, `url(${this.#state.src}/fonts/noto-sans-500.woff2) format("woff2")`, { weight: "500" });
      document.fonts.add(face);
      await Promise.race([face.load(), new Promise((resolve) => setTimeout(resolve, 400))]);
    } catch {
      return;
    }
  }

  #panBy(dx: number, dy: number): void {
    const state = this.#state;
    const world = this.#world;
    state.x = wrap(state.x + dx / world);
    state.y = Math.max(0, Math.min(1, state.y + dy / world));
    this.#changed();
  }

  #zoomAround(delta: number, px: number, py: number): void {
    const state = this.#state;
    const before = this.#world;
    state.zoom = clampZoom(state.zoom + delta);
    const after = this.#world;
    const offsetX = px - this.#host.clientWidth / 2;
    const offsetY = py - this.#host.clientHeight / 2;
    state.x = wrap(state.x + offsetX / before - offsetX / after);
    state.y = Math.max(0, Math.min(1, state.y + offsetY / before - offsetY / after));
    this.#changed();
  }

  #animateZoom(delta: number, px: number, py: number): void {
    const state = this.#state;
    const target = clampZoom(Math.round(state.zoom + delta));
    this.stop();
    if (reducedMotion()) {
      this.#zoomAround(target - state.zoom, px, py);
      this.#moveEnd();
      return;
    }
    const start = state.zoom;
    const began = performance.now();
    this.#zooming = true;
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / 260);
      this.#zoomAround(start + (target - start) * easeInOut(progress) - state.zoom, px, py);
      if (progress < 1) this.#animation = requestAnimationFrame(step);
      else {
        this.#animation = 0;
        this.#zooming = false;
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

  #onWheel(event: WheelEvent): void {
    const mode = (this.#host.getAttribute("scroll-zoom") ?? "cooperative") as ScrollZoom;
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
    this.stop();
    const { x, y } = this.#local(event);
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const delta = event.deltaY * scale;
    const amount = event.ctrlKey ? -delta * 0.012 : -delta * 0.0024;
    this.#zoomAround(Math.max(-1, Math.min(1, amount)), x, y);
    clearTimeout(this.#moveEndTimer);
    this.#moveEndTimer = window.setTimeout(() => this.#moveEnd(), 160);
  }

  #onKey(event: KeyboardEvent): void {
    const host = this.#host;
    const selected = this.#state.selected;
    if (event.target !== host) {
      if (event.key === "Escape" && selected) {
        host.select(null);
        host.focus();
      }
      return;
    }
    const step = 96;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) {
      this.#panBy(move[0], move[1]);
      clearTimeout(this.#moveEndTimer);
      this.#moveEndTimer = window.setTimeout(() => this.#moveEnd(), 200);
    } else if (event.key === "+" || event.key === "=") this.#animateZoom(1, host.clientWidth / 2, host.clientHeight / 2);
    else if (event.key === "-" || event.key === "_") this.#animateZoom(-1, host.clientWidth / 2, host.clientHeight / 2);
    else if (event.key === "Escape" && selected) host.select(null);
    else return;
    event.preventDefault();
  }

  #hitAt(x: number, y: number): Hit<Data> | null {
    const slop = 6;
    for (let index = this.#hits.length - 1; index >= 0; index--) {
      const hit = this.#hits[index]!;
      if (hit.kind === "pill") {
        if (Math.abs(x - hit.x) <= hit.width / 2 + slop && Math.abs(y - hit.y) <= hit.height / 2 + slop) return hit;
      } else if (Math.hypot(x - hit.x, y - hit.y) <= hit.width / 2 + slop) return hit;
    }
    return null;
  }

  #hover(x: number, y: number): void {
    const host = this.#host;
    const hit = x < 0 ? null : this.#hitAt(x, y);
    const previous = this.#hovered;
    if (previous?.group === hit?.group) return;
    this.#hovered = hit;
    host.style.cursor = hit ? "pointer" : "";
    const previousMarker = previous && previous.group.members.length === 1 ? previous.group.members[0] : null;
    const nextMarker = hit && hit.group.members.length === 1 ? hit.group.members[0] : null;
    if (previousMarker) host.dispatchEvent(new CustomEvent("markerleave", { detail: { marker: previousMarker }, bubbles: true, composed: true }));
    if (nextMarker) {
      this.#warm(nextMarker);
      host.dispatchEvent(new CustomEvent("markerenter", { detail: { marker: nextMarker }, bubbles: true, composed: true }));
    }
    this.schedule();
  }

  #tap(x: number, y: number): void {
    const host = this.#host;
    const state = this.#state;
    this.#engage();
    const hit = this.#hitAt(x, y);
    if (!hit) {
      if (state.selected) host.select(null);
      this.#moveEnd();
      return;
    }
    if (hit.group.members.length > 1) {
      const [lng, lat] = host.unproject(hit.x, hit.y);
      const cluster: Cluster<Data> = { lng, lat, markers: hit.group.members, bounds: boundsOf(hit.group.members) };
      const event = new CustomEvent("clusterclick", { detail: { cluster }, bubbles: true, composed: true, cancelable: true });
      if (host.dispatchEvent(event)) {
        const [west, south, east, north] = cluster.bounds;
        if (west === east && south === north) void host.flyTo({ center: [west, south], zoom: Math.min(MAX_ZOOM, state.zoom + 3) });
        else void host.fitBounds(cluster.bounds, { padding: 64, maxZoom: Math.max(state.zoom + 1, 17) });
      }
      return;
    }
    this.#activateMarker(hit.group.members[0]!);
  }

  #engage(): void {
    this.#engaged = true;
    this.#host.toggleAttribute("engaged", true);
  }

  #activateMarker(marker: Marker<Data>): void {
    const event = new CustomEvent("markerclick", { detail: { marker }, bubbles: true, composed: true, cancelable: true });
    if (this.#host.dispatchEvent(event)) this.#host.select(marker.id);
  }

  // Card images are fetched before the card is asked for, so the card opens with its picture already in memory.
  #warm(marker: Marker<Data>): void {
    const url = safeUrl(marker.image);
    if (!url || this.#warmed.has(url) || this.#host.getAttribute("card-images") === "off") return;
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    this.#warmed.set(url, image);
    if (this.#warmed.size > WARM_MEMORY) this.#warmed.delete(this.#warmed.keys().next().value!);
  }

  #warmVisible(): void {
    const mode = (this.#host.getAttribute("card-images") ?? "visible") as CardImages;
    if (mode !== "visible" || this.#warmQueued || savesData()) return;
    this.#warmQueued = true;
    const run = (): void => {
      this.#warmQueued = false;
      const host = this.#host;
      const centerX = host.clientWidth / 2;
      const centerY = host.clientHeight / 2;
      this.#hits
        .filter((hit) => hit.group.members.length === 1 && hit.group.members[0]!.image)
        .sort((a, b) => Math.hypot(a.x - centerX, a.y - centerY) - Math.hypot(b.x - centerX, b.y - centerY))
        .slice(0, WARM_LIMIT)
        .forEach((hit) => this.#warm(hit.group.members[0]!));
    };
    const idle = (globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(run, { timeout: 800 });
    else setTimeout(run, 120);
  }

  #preconnect(): void {
    if (this.#host.getAttribute("card-images") === "off") return;
    const origins = new Set<string>();
    for (const marker of this.#state.markers.slice(0, 64)) {
      const url = safeUrl(marker.image);
      if (!url) continue;
      try {
        const origin = new URL(url, location.href).origin;
        if (origin !== location.origin) origins.add(origin);
      } catch {
        continue;
      }
      if (origins.size >= 2) break;
    }
    for (const origin of origins) {
      if (document.head.querySelector(`link[rel=preconnect][href="${origin}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = origin;
      document.head.append(link);
    }
  }

  #positionPopup(): void {
    const popup = this.#popupHost;
    if (!popup || !this.#popupFor) return;
    const marker = this.#state.byId.get(this.#popupFor);
    if (!marker) return;
    const [x, y] = this.#host.project(marker.lng, marker.lat);
    const offset = (marker.label ? PILL_HEIGHT / 2 : DOT_RADIUS) + 12;
    popup.style.transform = `translate(${Math.round(x)}px,${Math.round(y - offset)}px) translate(-50%,-100%)`;
  }

  #keepPopupInView(): void {
    const popup = this.#popupHost;
    if (!popup) return;
    const host = this.#host;
    const map = host.getBoundingClientRect();
    const box = popup.getBoundingClientRect();
    const margin = 12;
    const dx = Math.min(0, box.left - map.left - margin) + Math.max(0, box.right - map.right + margin + 56);
    const dy = Math.min(0, box.top - map.top - margin) + Math.max(0, box.bottom - map.bottom + margin);
    if (!dx && !dy) return;
    const [lng, lat] = host.unproject(host.clientWidth / 2 + dx, host.clientHeight / 2 + dy);
    void this.flyTo({ center: [lng, lat], zoom: this.#state.zoom, duration: 320 });
  }

  #changed(): void {
    this.schedule();
    this.#host.dispatchEvent(new CustomEvent("move", { detail: this.#host.camera, bubbles: true, composed: true }));
  }

  #moveEnd(): void {
    this.schedule();
    this.#updateList();
    this.#warmVisible();
    this.#host.dispatchEvent(new CustomEvent("moveend", { detail: this.#host.camera, bubbles: true, composed: true }));
  }

  #draw(): void {
    const host = this.#host;
    const state = this.#state;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    const pending = this.#drawTiles(width, height);
    this.#bridge.drawPoster();
    const handedOff = !state.poster;
    if (!pending && state.poster) this.#retirePoster();
    this.#drawMarkers(width, height, handedOff);
    this.#positionPopup();
    const wasIdle = this.#idle;
    this.#idle = pending === 0 && !this.#animation && !this.#wakeRunning();
    if (this.#idle && !wasIdle) {
      this.#updateList();
      this.#warmVisible();
      host.dispatchEvent(new Event("idle"));
    }
    if (this.#idle) for (const resolve of this.#idleWaiters.splice(0)) resolve();
    if (this.#wakeRunning()) this.schedule();
  }

  #retirePoster(): void {
    const state = this.#state;
    const host = this.#host;
    const poster = state.poster!;
    state.poster = null;
    poster.style.opacity = "0";
    setTimeout(() => {
      poster.style.visibility = "hidden";
    }, 360);
    if (!state.wake) state.wake = { start: performance.now(), x: host.clientWidth / 2, y: host.clientHeight / 2 };
    else state.wake.start = performance.now();
  }

  #wakeRunning(): boolean {
    const wake = this.#state.wake;
    return !!wake && performance.now() - wake.start < 900;
  }

  #drawTiles(width: number, height: number): number {
    const state = this.#state;
    const z = Math.max(0, Math.min(MAX_TILE_ZOOM, Math.round(state.zoom)));
    const count = 2 ** z;
    const size = TILE_SIZE * 2 ** (state.zoom - z);
    const left = state.x * this.#world - width / 2;
    const top = state.y * this.#world - height / 2;
    const ratio = (this.#ratio ??= pixelRatio(this.#host.getAttribute("detail")));
    const wanted = new Set<string>();
    let pending = 0;
    const firstRow = Math.max(0, Math.floor(top / size));
    const lastRow = Math.min(count - 1, Math.floor((top + height) / size));
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = Math.floor(left / size); column <= Math.floor((left + width) / size); column++) {
        const key = `${z}/${column}/${row}/${state.look}`;
        wanted.add(key);
        let tile = this.#tiles.get(key);
        // Zoom levels an animation only passes through are never asked for; the tiles already here stretch to cover.
        if (!tile && this.#zooming) {
          pending++;
          continue;
        }
        if (!tile) {
          const created = new Image() as Tile;
          created.decoding = "async";
          created.alt = "";
          created.zoomLevel = z;
          created.column = column;
          created.row = row;
          created.loaded = false;
          created.look = state.look;
          created.attempts = 0;
          const source = tileUrl(state.src, z, ((column % count) + count) % count, row, ratio, state.theme, state.colors);
          created.onload = () => {
            created.loaded = true;
            created.classList.add("on");
            this.schedule();
          };
          // One retry for a tile that failed, then give up on it so the map can still settle.
          created.onerror = () => {
            if (created.attempts++ < 1 && this.#tiles.get(key) === created) setTimeout(() => (created.src = `${source}&retry=1`), 600);
            else {
              created.loaded = true;
              this.schedule();
            }
          };
          created.src = source;
          this.#tiles.set(key, created);
          this.#tileLayer.append(created);
          tile = created;
        }
        if (!tile.loaded) pending++;
        tile.style.zIndex = "2";
        tile.style.transform = `translate(${column * size - left}px,${row * size - top}px) scale(${size / TILE_SIZE})`;
      }
    }
    for (const [key, tile] of this.#tiles) {
      if (wanted.has(key)) continue;
      if (pending === 0 || (tile.zoomLevel === z && tile.look === state.look) || !tile.loaded) {
        tile.onload = tile.onerror = null;
        tile.remove();
        tile.removeAttribute("src");
        this.#tiles.delete(key);
        continue;
      }
      const scale = 2 ** (state.zoom - tile.zoomLevel);
      tile.style.zIndex = "1";
      tile.style.transform = `translate(${tile.column * TILE_SIZE * scale - left}px,${tile.row * TILE_SIZE * scale - top}px) scale(${scale})`;
    }
    return pending;
  }

  #grouped(): Grouping<Data> {
    const state = this.#state;
    if (state.posterGrouping && state.posterGrouping.zoom !== state.zoom) state.posterGrouping = null;
    const zoom = state.posterGrouping?.level ?? Math.floor(state.zoom);
    const cached = this.#groups;
    if (cached && cached.zoom === zoom && cached.revision === state.revision) return cached;
    const groups = clusterAt(state.markers, zoom, state.cluster);
    const groupOf = new Map<string, Group<Data>>();
    for (const group of groups) for (const member of group.members) groupOf.set(String(member.id), group);
    return (this.#groups = { zoom, revision: state.revision, groups, groupOf });
  }

  #labelWidth(label: string): number {
    let width = this.#widths.get(label);
    if (width === undefined) {
      const context = this.#context;
      context.font = `500 13px ${FONT_FAMILY}`;
      width = Math.max(PILL_HEIGHT, Math.ceil(context.measureText(label).width) + PILL_PADDING * 2);
      if (this.#widths.size > 4000) this.#widths.clear();
      this.#widths.set(label, width);
    }
    return width;
  }

  #drawMarkers(width: number, height: number, visible: boolean): void {
    const state = this.#state;
    const ratio = Math.min(MAX_CANVAS_RATIO, globalThis.devicePixelRatio ?? 1);
    const canvas = this.#canvas;
    const context = this.#context;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    if (state.look !== this.#paletteLook) {
      this.#paletteLook = state.look;
      this.#palette = resolvePalette(state.theme, state.colors);
    }
    const look = `${state.look}|${ratio}`;
    if (look !== this.#spriteLook) {
      this.#spriteLook = look;
      this.#sprites.clear();
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.globalAlpha = visible ? 1 : 0;
    const { groups, groupOf, zoom } = this.#grouped();
    const scale = 2 ** (state.zoom - zoom);
    const world = this.#world;
    const centerX = state.x * world;
    const centerY = state.y * world;
    const now = performance.now();
    const wake = this.#wakeRunning() && !reducedMotion() ? state.wake : null;
    const selectedGroup = state.selected ? groupOf.get(state.selected) : undefined;
    const highlightGroup = state.highlighted ? groupOf.get(state.highlighted) : undefined;
    const hoveredGroup = this.#hovered?.group;
    const plain: Hit<Data>[] = [];
    const raised: (Hit<Data> & { emphasis: number })[] = [];
    for (const group of groups) {
      let dx = group.x * scale - centerX;
      if (dx > world / 2) dx -= world;
      if (dx < -world / 2) dx += world;
      const x = width / 2 + dx;
      const y = height / 2 + group.y * scale - centerY;
      if (x < -80 || y < -40 || x > width + 80 || y > height + 40) continue;
      const count = group.members.length;
      const label = count === 1 ? (group.members[0]!.label ?? "").slice(0, MAX_LABEL_LENGTH) : "";
      const kind: Kind = count > 1 ? "cluster" : label ? "pill" : "dot";
      const itemWidth = kind === "pill" ? this.#labelWidth(label) : kind === "cluster" ? 2 * (10 + 3.5 * Math.min(7, Math.log2(count))) : DOT_RADIUS * 2;
      const hit: Hit<Data> = { group, x, y, kind, width: itemWidth, height: kind === "pill" ? PILL_HEIGHT : itemWidth };
      const emphasis = group === selectedGroup ? 2 : group === highlightGroup || group === hoveredGroup ? 1 : 0;
      if (emphasis) raised.push({ ...hit, emphasis });
      else plain.push(hit);
    }
    raised.sort((a, b) => a.emphasis - b.emphasis);
    const paint = (hit: Hit<Data>, emphasis: number): void => {
      const count = hit.group.members.length;
      const text = hit.kind === "cluster" ? shortCount(count) : hit.kind === "pill" ? (hit.group.members[0]!.label ?? "").slice(0, MAX_LABEL_LENGTH) : "";
      const sprite = this.#sprite(hit.kind, text, hit.width, emphasis, this.#palette, ratio);
      let size = emphasis ? 1.08 : 1;
      if (wake) {
        const t = (now - wake.start - Math.hypot(hit.x - wake.x, hit.y - wake.y) * 0.55) / 420;
        if (t > 0 && t < 1) size += Math.sin(Math.PI * t) * (1 - t) * 0.22;
      }
      const w = sprite.width * size;
      const h = sprite.height * size;
      context.drawImage(sprite.image, hit.x - w / 2, hit.y - h / 2, w, h);
    };
    for (const hit of plain) paint(hit, 0);
    for (const hit of raised) paint(hit, hit.emphasis);
    this.#hits = plain.concat(raised);
  }

  // Each distinct marker is painted once, with its shadow and text, and stamped from then on.
  // Shadows and text are the costly part of a canvas frame; a stamp is nearly free.
  #sprite(kind: Kind, text: string, width: number, emphasis: number, palette: Palette, ratio: number): Sprite {
    const key = `${kind}|${text}|${width}|${emphasis}`;
    const cached = this.#sprites.get(key);
    if (cached) return cached;
    const boxWidth = width + SPRITE_MARGIN * 2;
    const boxHeight = (kind === "pill" ? PILL_HEIGHT : width) + SPRITE_MARGIN * 2;
    const surface = typeof OffscreenCanvas === "undefined" ? Object.assign(document.createElement("canvas"), { width: Math.ceil(boxWidth * ratio), height: Math.ceil(boxHeight * ratio) }) : new OffscreenCanvas(Math.ceil(boxWidth * ratio), Math.ceil(boxHeight * ratio));
    const context = surface.getContext("2d") as CanvasRenderingContext2D;
    context.scale(ratio, ratio);
    context.translate(boxWidth / 2, boxHeight / 2);
    context.shadowColor = palette.shadow;
    context.shadowBlur = emphasis ? 12 : 6;
    context.shadowOffsetY = emphasis ? 4 : 2;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const selected = emphasis === 2;
    if (kind === "pill") {
      const radius = PILL_HEIGHT / 2;
      context.beginPath();
      context.roundRect(-width / 2, -radius, width, PILL_HEIGHT, radius);
      context.fillStyle = selected ? palette.selected : palette.marker;
      context.fill();
      context.shadowColor = "transparent";
      if (emphasis === 1) {
        context.lineWidth = 2;
        context.strokeStyle = palette.selected;
        context.stroke();
      }
      context.fillStyle = selected ? palette.selectedText : palette.markerText;
      context.font = `500 13px ${FONT_FAMILY}`;
      context.fillText(text, 0, 1);
    } else if (kind === "cluster") {
      const radius = width / 2;
      context.beginPath();
      context.arc(0, 0, radius + 2.5, 0, Math.PI * 2);
      context.fillStyle = palette.land;
      context.fill();
      context.shadowColor = "transparent";
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fillStyle = palette.cluster;
      context.fill();
      if (emphasis) {
        context.lineWidth = 2.5;
        context.strokeStyle = palette.selected;
        context.stroke();
      }
      context.fillStyle = palette.clusterText;
      context.font = `500 12px ${FONT_FAMILY}`;
      context.fillText(text, 0, 0.5);
    } else {
      context.beginPath();
      context.arc(0, 0, DOT_RADIUS + (emphasis ? 2 : 0), 0, Math.PI * 2);
      context.fillStyle = selected ? palette.selected : palette.accent;
      context.fill();
      context.shadowColor = "transparent";
      context.lineWidth = 2.5;
      context.strokeStyle = palette.land;
      context.stroke();
    }
    const sprite: Sprite = { image: surface, width: boxWidth, height: boxHeight };
    if (this.#sprites.size >= MAX_SPRITES) this.#sprites.clear();
    this.#sprites.set(key, sprite);
    return sprite;
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
