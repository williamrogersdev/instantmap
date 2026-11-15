import { DEFAULT_CLUSTER_DISTANCE } from "./cluster.ts";
import { describeView, distanceKm, type DescribedPlace, type ViewDescription } from "./places.ts";
import type { Bounds, LngLat, Marker } from "./types.ts";

// Tools an AI agent can call to read and steer a map: the same three for a browser's built-in agent (WebMCP) and for
// an app's own assistant. Loaded only when something asks for them, so pages without an agent pay nothing.

/** What the tools need from a map. `<instant-map>` has all of it. */
export interface AgentMap<Data = unknown> {
  readonly markers: Marker<Data>[];
  readonly camera: { center: LngLat; zoom: number };
  readonly clientWidth: number;
  readonly clientHeight: number;
  getAttribute(name: string): string | null;
  fitBounds(target: Bounds | readonly Pick<Marker, "lng" | "lat">[], options?: { maxZoom?: number; padding?: number }): Promise<void>;
  select(id: string | number | null): void;
  highlight(id: string | number | null): void;
  getMarker(id: string | number): Marker<Data> | undefined;
  whenIdle(): Promise<void>;
}

export interface MapTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean };
  execute(input: Record<string, unknown>): Promise<unknown>;
}

export interface MapToolOptions {
  /** Put before each tool's name, so two maps on a page do not collide. Default "map_". */
  prefix?: string;
  /** What the markers are, for the tool descriptions: "listings", "stores". Default "places". */
  noun?: string;
}

const lngLat = { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2, description: "[longitude, latitude]" };
const ids = { type: "array", items: { type: ["string", "number"] }, maxItems: 200 };

const words = (text: string): string[] => text.toLowerCase().split(/[^\p{L}\p{N}$.]+/u).filter(Boolean);

const searchable = (marker: Marker): string[] => words([marker.title, marker.subtitle, marker.label, marker.badge].filter(Boolean).join(" "));

const round = (value: number): number => Math.round(value * 1e5) / 1e5;

export type FoundPlace = Omit<DescribedPlace, "x" | "y"> & { km?: number };

const placeOf = (marker: Marker, km?: number): FoundPlace => ({
  id: marker.id,
  lng: round(marker.lng),
  lat: round(marker.lat),
  ...(marker.label ? { label: marker.label } : {}),
  ...(marker.title ? { title: marker.title } : {}),
  ...(marker.subtitle ? { subtitle: marker.subtitle } : {}),
  ...(marker.href ? { href: marker.href } : {}),
  ...(km === undefined ? {} : { km: Math.round(km * 10) / 10 }),
});

const asNumberPair = (value: unknown): LngLat | undefined =>
  Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number" && Number.isFinite(part)) ? [value[0], value[1]] : undefined;

const asBounds = (value: unknown): Bounds | undefined =>
  Array.isArray(value) && value.length === 4 && value.every((part) => typeof part === "number" && Number.isFinite(part)) ? (value as Bounds) : undefined;

/** What a map shows now, as JSON: bounds, lone markers, clusters and a summary sentence. */
export function describeMap<Data>(map: AgentMap<Data>, options: { limit?: number } = {}): ViewDescription {
  const cluster = map.getAttribute("cluster");
  const distance = cluster === "off" || cluster === "false" ? false : Number(cluster ?? DEFAULT_CLUSTER_DISTANCE) || DEFAULT_CLUSTER_DISTANCE;
  return describeView({ ...map.camera, width: map.clientWidth || 640, height: map.clientHeight || 400, markers: map.markers, cluster: distance }, options);
}

/** The map's tools as plain objects with JSON Schema inputs: register them with any agent, or call `execute` yourself. */
export function mapTools<Data>(map: AgentMap<Data>, options: MapToolOptions = {}): MapTool[] {
  const prefix = options.prefix ?? "map_";
  const noun = options.noun ?? "places";
  return [
    {
      name: `${prefix}describe`,
      title: "Describe the map",
      description: `Read what the map shows now, as JSON: its bounds, the ${noun} drawn alone (id, title, label, link, position), the clusters with their counts and ids, and a one-line summary. Cheaper and more exact than a screenshot.`,
      inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200, description: `Most ${noun} and clusters to list. Default 50.` } } },
      annotations: { readOnlyHint: true },
      execute: async (input) => describeMap(map, { limit: typeof input.limit === "number" ? input.limit : 50 }),
    },
    {
      name: `${prefix}find`,
      title: `Find ${noun} on the map`,
      description: `Search every one of the map's ${noun}, in view or not, by words in their title, subtitle or label, and/or by distance from a point. Returns matches nearest first when a point is given.`,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", maxLength: 200, description: "Words that must all appear (each matches the start of a word), such as \"48x40 grade a\"." },
          near: { ...lngLat, description: "Rank by distance from this [longitude, latitude]." },
          withinKm: { type: "number", minimum: 0, description: "With near: only matches this close." },
          limit: { type: "integer", minimum: 1, maximum: 100, description: "Default 20." },
        },
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const terms = typeof input.query === "string" ? words(input.query) : [];
        const near = asNumberPair(input.near);
        const withinKm = typeof input.withinKm === "number" ? input.withinKm : Number.POSITIVE_INFINITY;
        const limit = typeof input.limit === "number" ? Math.min(100, Math.max(1, Math.floor(input.limit))) : 20;
        const matches = map.markers
          .filter((marker) => {
            const text = searchable(marker as Marker);
            return terms.every((term) => text.some((word) => word.startsWith(term)));
          })
          .map((marker) => ({ marker, km: near ? distanceKm(near, [marker.lng, marker.lat]) : undefined }))
          .filter((entry) => entry.km === undefined || entry.km <= withinKm)
          .sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
        return { total: matches.length, matches: matches.slice(0, limit).map((entry) => placeOf(entry.marker as Marker, entry.km)) };
      },
    },
    {
      name: `${prefix}show`,
      title: `Show ${noun} on the map`,
      description: `Move the map to show ${noun} by id, or an area by bounds, and optionally open one ${noun.replace(/s$/, "")}'s card. Changes only what the person sees. Returns the map's new description.`,
      inputSchema: {
        type: "object",
        properties: {
          ids: { ...ids, description: `Ids from ${prefix}find or ${prefix}describe to fit in view.` },
          bounds: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4, description: "[west, south, east, north] to fit instead." },
          select: { type: ["string", "number"], description: "Open this id's card after moving." },
        },
      },
      annotations: { readOnlyHint: false },
      execute: async (input) => {
        const wanted = Array.isArray(input.ids) ? input.ids.map((id) => map.getMarker(id as string | number)).filter((marker): marker is Marker<Data> => !!marker) : [];
        const bounds = asBounds(input.bounds);
        const selected = typeof input.select === "string" || typeof input.select === "number" ? map.getMarker(input.select) : undefined;
        const targets = wanted.length ? wanted : selected ? [selected] : [];
        if (bounds) await map.fitBounds(bounds);
        else if (targets.length) await map.fitBounds(targets, { maxZoom: targets.length === 1 ? 13 : 16 });
        else return { error: `Pass ids, bounds or select. Unknown ids are ignored; call ${prefix}find for valid ones.` };
        map.highlight(targets[0]?.id ?? null);
        if (selected) map.select(selected.id);
        await map.whenIdle();
        return describeMap(map, { limit: 50 });
      },
    },
  ];
}

interface ModelContextLike {
  registerTool(tool: Omit<MapTool, "execute"> & { execute(input: Record<string, unknown>): Promise<string> }, options?: { signal?: AbortSignal }): unknown;
}

/** The page's WebMCP context: `document.modelContext` in current drafts, `navigator.modelContext` in early previews. */
export function modelContext(): ModelContextLike | undefined {
  const fromDocument = (globalThis.document as { modelContext?: ModelContextLike } | undefined)?.modelContext;
  return fromDocument ?? (globalThis.navigator as { modelContext?: ModelContextLike } | undefined)?.modelContext;
}

/**
 * Registers the map's tools with the browser's agent through WebMCP, where the browser has it. Abort the signal to
 * take them away. Returns false, and does nothing, in browsers without WebMCP.
 */
export function registerMapTools<Data>(map: AgentMap<Data>, options: MapToolOptions & { signal?: AbortSignal } = {}): boolean {
  const context = modelContext();
  if (!context) return false;
  for (const tool of mapTools(map, options)) {
    const registered = context.registerTool({ ...tool, execute: async (input) => JSON.stringify(await tool.execute(input ?? {})) }, { signal: options.signal });
    // Early previews returned a handle with unregister() and ignored the signal.
    const handle = registered as { unregister?: () => void } | undefined;
    if (handle && typeof handle.unregister === "function") options.signal?.addEventListener("abort", () => handle.unregister!(), { once: true });
    if (registered instanceof Promise) registered.catch(() => {});
  }
  return true;
}
