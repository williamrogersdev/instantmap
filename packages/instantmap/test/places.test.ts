import { afterEach, describe, expect, test } from "bun:test";
import { describeMap, mapTools, registerMapTools, type AgentMap } from "../src/agent.ts";
import { describeView, distanceKm, markersIn, nearest, placesHtml, viewBounds } from "../src/places.ts";
import { posterHtml } from "../src/poster-html.ts";
import { staticUrl } from "../src/static-url.ts";
import type { Bounds, Marker } from "../src/types.ts";

const view = { center: [-122.42, 37.77] as [number, number], zoom: 12, width: 640, height: 400 };
const markers: Marker[] = [
  { id: "a", lng: -122.42, lat: 37.77, label: "$40", title: "48x40 Grade A pallets", href: "/listings/a" },
  { id: "b", lng: -122.4201, lat: 37.7701, label: "$35", title: "48x40 Grade B pallets", href: "/listings/b" },
  { id: "c", lng: -122.39, lat: 37.79, label: "$900", title: "IBC totes <275 gal>", href: "javascript:alert(1)" },
  { id: "d", lng: 2.35, lat: 48.85, label: "€10", title: "Paris drums" },
];

describe("describeView", () => {
  test("lists what the picture draws: lone markers, clusters, and what is outside", () => {
    const described = describeView({ ...view, markers });
    expect(described.count).toBe(3);
    expect(described.clusters).toHaveLength(1);
    expect(described.clusters[0]!.count).toBe(2);
    expect(described.clusters[0]!.ids.sort()).toEqual(["a", "b"]);
    expect(described.places.map((place) => place.id)).toEqual(["c"]);
    expect(described.places[0]!.x).toBeGreaterThan(320);
    expect(described.summary).toStartWith("3 places in view: 1 on its own and 1 cluster. 1 more lies outside it.");
  });

  test("agrees with the poster address on what is drawn", () => {
    const url = new URL(staticUrl({ ...view, markers }));
    const described = describeView({ ...view, markers });
    expect(url.searchParams.get("clusters")!.split(";")).toHaveLength(described.clusters.length);
    expect(url.searchParams.get("markers")!.split(";")).toHaveLength(described.places.length);
  });

  test("bounds frame the view", () => {
    const [west, south, east, north] = viewBounds(view);
    expect(west).toBeLessThan(-122.42);
    expect(east).toBeGreaterThan(-122.42);
    expect(south).toBeLessThan(37.77);
    expect(north).toBeGreaterThan(37.77);
  });
});

describe("spatial queries", () => {
  test("markersIn handles bounds across the antimeridian", () => {
    const pacific: Marker[] = [{ id: 1, lng: 179.5, lat: 0 }, { id: 2, lng: -179.5, lat: 0 }, { id: 3, lng: 0, lat: 0 }];
    expect(markersIn(pacific, [179, -1, -179, 1] as Bounds).map((marker) => marker.id)).toEqual([1, 2]);
  });

  test("nearest ranks by great-circle distance", () => {
    const ranked = nearest(markers, [-122.39, 37.79], 2);
    expect(ranked.map((entry) => entry.marker.id)).toEqual(["c", "b"]);
    expect(ranked[0]!.km).toBe(0);
    expect(Math.round(distanceKm([-122.42, 37.77], [2.35, 48.85]))).toBe(8954);
  });
});

describe("placesHtml", () => {
  test("escapes text and refuses unsafe links", () => {
    const html = placesHtml({ ...view, markers });
    expect(html).toContain('<a href="/listings/a">48x40 Grade A pallets, $40</a>');
    expect(html).toContain("IBC totes &lt;275 gal&gt;, $900");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Paris");
  });

  test("posterHtml puts the list inside the element unless asked not to", () => {
    const html = posterHtml({ ...view, markers, alt: "Map of pallets" });
    expect(html).toMatch(/<img [^>]+><ul data-im-places aria-label="Places on the map">.+<\/ul><\/instant-map>$/);
    expect(posterHtml({ ...view, markers, places: false })).not.toContain("data-im-places");
    expect(posterHtml({ ...view, markers, agentTools: "pallets_" })).toContain('agent-tools="pallets_"');
  });
});

function fakeMap(): AgentMap & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    markers,
    camera: { center: view.center, zoom: view.zoom },
    clientWidth: view.width,
    clientHeight: view.height,
    getAttribute: () => null,
    fitBounds: async (target) => void log.push(`fit:${Array.isArray(target) && typeof target[0] === "number" ? "bounds" : (target as Marker[]).map((marker) => marker.id).join(",")}`),
    select: (id) => void log.push(`select:${id}`),
    highlight: (id) => void log.push(`highlight:${id}`),
    getMarker: (id) => markers.find((marker) => marker.id === id),
    whenIdle: async () => {},
  };
}

describe("mapTools", () => {
  test("find matches every word and ranks by distance", async () => {
    const [, find] = mapTools(fakeMap());
    const result = (await find!.execute({ query: "48x40 pallets", near: [-122.4201, 37.7701] })) as { total: number; matches: { id: string; km: number }[] };
    expect(result.total).toBe(2);
    expect(result.matches.map((match) => match.id)).toEqual(["b", "a"]);
    const far = (await find!.execute({ near: [2.35, 48.85], withinKm: 10 })) as { matches: { id: string }[] };
    expect(far.matches.map((match) => match.id)).toEqual(["d"]);
    const grade = (await find!.execute({ query: "grade a" })) as { matches: { id: string }[] };
    expect(grade.matches.map((match) => match.id)).toEqual(["a"]);
  });

  test("show fits ids, highlights the first and opens the card it was asked to", async () => {
    const map = fakeMap();
    const [, , show] = mapTools(map, { prefix: "pallets_" });
    expect(show!.name).toBe("pallets_show");
    const described = (await show!.execute({ ids: ["a", "c", "zzz"], select: "c" })) as { count: number };
    expect(map.log).toEqual(["fit:a,c", "highlight:a", "select:c"]);
    expect(described.count).toBe(3);
    expect(await show!.execute({})).toHaveProperty("error");
  });

  test("describe is read-only and matches describeMap", async () => {
    const map = fakeMap();
    const [describeTool] = mapTools(map);
    expect(describeTool!.annotations.readOnlyHint).toBe(true);
    expect(await describeTool!.execute({})).toEqual(describeMap(map, { limit: 50 }));
  });
});

describe("registerMapTools", () => {
  const scope = globalThis as { document?: unknown };
  const original = scope.document;
  afterEach(() => {
    scope.document = original;
  });

  test("does nothing without WebMCP", () => {
    scope.document = {};
    expect(registerMapTools(fakeMap())).toBe(false);
  });

  test("registers on document.modelContext, returns text, and unregisters on abort", async () => {
    const registered = new Map<string, { execute: (input: unknown) => Promise<string> }>();
    scope.document = {
      modelContext: {
        registerTool(tool: { name: string; execute: (input: unknown) => Promise<string> }, options: { signal: AbortSignal }) {
          registered.set(tool.name, tool);
          options.signal.addEventListener("abort", () => registered.delete(tool.name));
          return Promise.resolve();
        },
      },
    };
    const controller = new AbortController();
    expect(registerMapTools(fakeMap(), { signal: controller.signal })).toBe(true);
    expect([...registered.keys()]).toEqual(["map_describe", "map_find", "map_show"]);
    const text = await registered.get("map_find")!.execute({ query: "drums" });
    expect(JSON.parse(text).matches[0].id).toBe("d");
    controller.abort();
    expect(registered.size).toBe(0);
  });
});
