import type { InstantMapElement } from "instantmap";
import type { Listing } from "../data/listings.ts";

declare global {
  interface Window {
    __heroPaint?: number;
  }
}

const TOKENS = ["cluster", "marker", "markerText", "selected", "water", "land"] as const;
const RACE_TIMEOUT_MS = 30000;

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let toastTimer = 0;
function toast(text: string): void {
  let element = document.querySelector<HTMLDivElement>(".toast");
  if (!element) {
    element = document.createElement("div");
    element.className = "toast";
    element.setAttribute("role", "status");
    document.body.append(element);
  }
  element.textContent = text;
  element.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove("on"), 1800);
}

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${what}`);
  } catch {
    toast("Select the text and copy it with your keyboard");
  }
}

function setupCopyButtons(): void {
  document.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-copy], [data-copy-target]");
    if (!button) return;
    const target = button.dataset.copyTarget;
    const text = target ? (byId(target).textContent ?? "") : (button.dataset.copy ?? "");
    const what = text.startsWith("npm") ? "install command" : text.startsWith("Add an Instant Map") ? "prompt" : "code";
    void copy(text, what);
  });
}

function setupHero(listings: Listing[]): void {
  const map = byId<InstantMapElement>("hero-map");
  map.markers = listings;
  const paint = byId("meter-paint");
  const badge = byId("badge-paint");
  const showPaint = (): void => {
    if (!window.__heroPaint) return;
    const milliseconds = Math.round(window.__heroPaint);
    paint.replaceChildren(String(milliseconds), Object.assign(document.createElement("span"), { className: "unit", textContent: "ms" }));
    badge.textContent = `in ${milliseconds} ms`;
    const poster = performance.getEntriesByType("resource").find((entry) => entry.name.includes("/static?")) as PerformanceResourceTiming | undefined;
    if (poster && poster.transferSize === 0 && poster.decodedBodySize > 0) byId("meter-cache").hidden = false;
  };
  showPaint();
  document.addEventListener("heropaint", showPaint);
  const script = performance.getEntriesByType("resource").find((entry) => entry.name.endsWith("/instant-map.js")) as PerformanceResourceTiming | undefined;
  if (script?.encodedBodySize) byId("meter-script").textContent = `${(script.encodedBodySize / 1024).toFixed(1)} KB, loads after the map shows`;
  map.addEventListener("interactive", () => {
    byId("meter-state").textContent = "live now, try dragging it";
  });
}

function studioCode(tab: string, theme: string, colors: string): string {
  const themeAttribute = theme === "daylight" ? "" : ` theme="${theme}"`;
  const colorsAttribute = colors ? `\n  colors="${colors}"` : "";
  if (tab === "react") {
    const themeProp = theme === "daylight" ? "" : `\n      theme="${theme}"`;
    const colorsProp = colors
      ? `\n      colors={{ ${colors
          .split(",")
          .map((pair) => {
            const [key, value] = pair.split(":");
            return `${key}: "#${value}"`;
          })
          .join(", ")} }}`
      : "";
    return `import { InstantMap } from "instantmap/react";

export function ListingsMap({ listings }) {
  return (
    <InstantMap
      center={[-122.42, 37.77]}
      zoom={13}${themeProp}${colorsProp}
      markers={listings}
      style={{ height: 480 }}
    />
  );
}`;
  }
  if (tab === "agent") {
    const look = [theme === "daylight" ? "the default daylight theme" : `the ${theme} theme`, colors ? `these colour overrides: ${colors}` : "no colour overrides"].join(" and ");
    return `Add an Instant Map to this project, styled with ${look}.

Read https://instantmap.org/llms.txt and the framework guide for this stack at https://instantmap.org/docs/frameworks/ first.
Use the same theme and colours for the server-rendered first image (staticUrl or the React component) and the live map, so the colours do not change when it wakes up.
Pass my records as markers: { id, lng, lat, label, title, subtitle, href }.
Then run the app and confirm the map renders in these colours, drags, and opens a card when a marker is clicked.`;
  }
  return `<script type="module" src="https://instantmap.org/instant-map.js"></script>

<instant-map
  center="-122.42,37.77"
  zoom="13"${themeAttribute}${colorsAttribute}
  style="height:480px">
</instant-map>`;
}

function setupStudio(listings: Listing[]): void {
  const map = byId<InstantMapElement>("studio-map");
  map.markers = listings;
  const code = byId("studio-code");
  const inputs = [...document.querySelectorAll<HTMLInputElement>(".tokens input[data-token]")];
  const tabs = [...document.querySelectorAll<HTMLButtonElement>(".tabs [role=tab]")];
  let tab = "html";
  let overrides: Record<string, string> = {};

  const encoded = (): string =>
    Object.entries(overrides)
      .map(([key, value]) => `${key}:${value.replace("#", "").toLowerCase()}`)
      .join(",");

  const render = (): void => {
    map.colors = Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, value.startsWith("#") ? value : `#${value}`]));
    for (const input of inputs) input.value = map.palette[input.dataset.token as (typeof TOKENS)[number]].slice(0, 7);
    code.textContent = studioCode(tab, map.theme, encoded());
  };

  document.querySelectorAll<HTMLInputElement>("input[name=theme]").forEach((radio) =>
    radio.addEventListener("change", () => {
      map.activate();
      map.theme = radio.value;
      overrides = {};
      render();
    }),
  );
  for (const input of inputs) {
    input.addEventListener("input", () => {
      map.activate();
      overrides[input.dataset.token!] = input.value;
      render();
    });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) =>
    button.addEventListener("click", () => {
      overrides = Object.fromEntries((button.dataset.preset ?? "").split(",").filter(Boolean).map((pair) => pair.split(":") as [string, string]));
      render();
      map.activate();
    }),
  );
  for (const button of tabs) {
    button.addEventListener("click", () => {
      tab = button.dataset.tab!;
      for (const other of tabs) other.setAttribute("aria-selected", String(other === button));
      render();
    });
  }
  render();
}

interface LaneResult {
  lane: string;
  ms?: number;
  error?: string;
}

function runLane(lane: "instant" | "maplibre", center: string, zoom: string): Promise<LaneResult> {
  const figure = document.querySelector<HTMLElement>(`.lane[data-lane="${lane}"]`)!;
  const screen = figure.querySelector<HTMLElement>(".screen")!;
  const time = figure.querySelector<HTMLElement>("[data-time]")!;
  screen.replaceChildren();
  const frame = document.createElement("iframe");
  frame.title = lane === "instant" ? "Instant Map race lane" : "MapLibre race lane";
  frame.loading = "eager";
  const started = performance.now();
  let ticking = 0;
  const tick = (): void => {
    time.textContent = `${Math.round(performance.now() - started).toLocaleString("en-US")} ms`;
    ticking = requestAnimationFrame(tick);
  };
  tick();
  return new Promise((resolve) => {
    const finish = (result: LaneResult): void => {
      cancelAnimationFrame(ticking);
      window.removeEventListener("message", listen);
      clearTimeout(timer);
      time.textContent = result.ms ? `${Math.round(result.ms).toLocaleString("en-US")} ms` : "did not finish";
      resolve(result);
    };
    const listen = (event: MessageEvent<LaneResult>): void => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.lane !== lane) return;
      finish(event.data);
    };
    const timer = window.setTimeout(() => finish({ lane, error: "timed out" }), RACE_TIMEOUT_MS);
    window.addEventListener("message", listen);
    frame.src = `/race/${lane}.html?center=${encodeURIComponent(center)}&zoom=${zoom}`;
    screen.append(frame);
  });
}

function showResult(results: LaneResult[], fresh: boolean): void {
  for (const result of results) {
    const lane = document.querySelector<HTMLElement>(`.lane[data-lane="${result.lane}"]`)!;
    lane.querySelector<HTMLElement>("[data-track]")!.style.width = "100%";
    lane.classList.toggle("done", !!result.ms);
  }
  const [instant, maplibre] = results;
  const output = byId("race-result");
  if (!instant?.ms || !maplibre?.ms) {
    output.textContent = "One lane did not finish. Try the race again.";
    return;
  }
  const winner = instant.ms <= maplibre.ms ? instant : maplibre;
  document.querySelector(`.lane[data-lane="${winner.lane}"]`)!.classList.add("won");
  const ratio = Math.max(instant.ms, maplibre.ms) / Math.min(instant.ms, maplibre.ms);
  const name = winner.lane === "instant" ? "Instant Map" : "MapLibre";
  const format = (ms: number): string => `${Math.round(ms).toLocaleString("en-US")} ms`;
  output.innerHTML = "";
  output.append(`${name} had the map on screen ${ratio >= 1.95 ? `${ratio.toFixed(1)}× sooner` : `${format(Math.abs(maplibre.ms - instant.ms))} sooner`}.`);
  const detail = document.createElement("small");
  detail.textContent = `${format(instant.ms)} against ${format(maplibre.ms)} on this connection, ${fresh ? "nothing cached" : "browser cache allowed"}.`;
  output.append(detail);
}

function setupRace(): void {
  const start = byId<HTMLButtonElement>("race-start");
  const fresh = byId<HTMLInputElement>("race-fresh");
  start.addEventListener("click", async () => {
    start.disabled = true;
    start.textContent = "Racing";
    byId("race-result").textContent = "";
    for (const lane of document.querySelectorAll<HTMLElement>(".lane")) {
      lane.classList.remove("won", "done");
      lane.querySelector<HTMLElement>("[data-track]")!.style.width = "0";
      lane.querySelector<HTMLElement>("[data-time]")!.textContent = "–";
    }
    const jitter = fresh.checked;
    const lng = -122.4194 + (jitter ? (Math.random() - 0.5) * 0.01 : 0);
    const lat = 37.7749 + (jitter ? (Math.random() - 0.5) * 0.008 : 0);
    const center = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    const zoom = jitter ? (12 + Math.random() * 0.3).toFixed(2) : "12";
    const instant = await runLane("instant", center, zoom);
    const maplibre = await runLane("maplibre", center, zoom);
    showResult([instant, maplibre], jitter);
    start.disabled = false;
    start.textContent = "Race again";
  });
}

export function setupLanding(listings: Listing[]): void {
  setupCopyButtons();
  setupHero(listings);
  setupStudio(listings);
  setupRace();
}
