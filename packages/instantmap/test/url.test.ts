import { afterEach, describe, expect, test } from "bun:test";
import { decodeColors, encodeColors, parseColor } from "../src/colors.ts";
import { CHROME, CHROME_KEYS, parseMarkerList } from "../src/element.ts";
import { posterHtml } from "../src/poster-html.ts";
import { pixelRatio, staticUrl, tileUrl } from "../src/static-url.ts";
import { decodePaletteColors, PALETTE_KEYS, paletteWords, resolvePalette, THEMES } from "../src/themes.ts";

const base = { src: "https://maps.example", center: [-122.42, 37.77] as [number, number], zoom: 12, width: 640, height: 400 };

describe("staticUrl", () => {
  test("builds the smallest address for a plain map", () => {
    expect(staticUrl(base)).toBe("https://maps.example/static?center=-122.42%2C37.77&zoom=12&size=640x400&v=3");
  });

  test("clamps the size and rounds the camera", () => {
    const url = new URL(staticUrl({ ...base, center: [-122.4194155, 37.7749295], zoom: 12.3456, width: 5000, height: 2 }));
    expect(url.searchParams.get("size")).toBe("1280x16");
    expect(url.searchParams.get("center")).toBe("-122.41942,37.77493");
    expect(url.searchParams.get("zoom")).toBe("12.35");
  });

  test("is the same address however the options are ordered", () => {
    const colors = { water: "#B9DDE0", land: "f3f2ec" };
    const reversed = { land: "f3f2ec", water: "#B9DDE0" };
    expect(staticUrl({ ...base, colors })).toBe(staticUrl({ ...base, colors: reversed }));
  });

  test("clusters markers and strips characters that would break the list", () => {
    const url = new URL(staticUrl({ ...base, markers: [{ lng: -122.42, lat: 37.77, label: "$1;2\n3" }, { lng: -122.4201, lat: 37.7701 }, { lng: -122.4, lat: 37.78, label: "$9" }] }));
    expect(url.searchParams.get("clusters")).toMatch(/^-122\.\d+,37\.\d+,2$/);
    expect(url.searchParams.get("markers")).toBe("-122.4,37.78,$9");
    expect(url.searchParams.get("cluster")).toBe("0");
  });

  test("leaves out markers that are off the image", () => {
    const url = new URL(staticUrl({ ...base, markers: [{ lng: 2.35, lat: 48.85 }] }));
    expect(url.searchParams.has("markers")).toBe(false);
  });

  test("tile addresses carry the theme and colours", () => {
    expect(tileUrl("https://maps.example/", 3, 1, 2, 2, "midnight", { water: "#000000" })).toBe("https://maps.example/tiles/3/1/2@2x.jpg?v=3&theme=midnight&colors=water%3A000000");
    expect(tileUrl("https://maps.example", 3, 1, 2, 1)).toBe("https://maps.example/tiles/3/1/2.jpg?v=3");
  });
});

describe("colours", () => {
  test("parseColor reads six and eight digit hex", () => {
    expect(parseColor("#ff0000")).toBe(0xff0000ff);
    expect(parseColor("00ff0080")).toBe(0x00ff0080);
    expect(parseColor("red")).toBeUndefined();
    expect(parseColor("#fff")).toBeUndefined();
  });

  test("encode and decode round-trip and drop what is not a colour", () => {
    const encoded = encodeColors({ water: "#B9DDE0", land: "nope", "bad key": "#000000" });
    expect(encoded).toBe("water:b9dde0");
    expect(decodeColors(encoded)).toEqual({ water: "#b9dde0" });
    expect(decodeColors('water:b9dde0,x:"><script>')).toEqual({ water: "#b9dde0" });
  });

  test("decodePaletteColors keeps only palette keys", () => {
    expect(decodePaletteColors("water:000000,notAKey:ffffff")).toEqual({ water: "#000000" });
  });

  test("every theme fills every palette key with a colour", () => {
    for (const [name, palette] of Object.entries(THEMES)) {
      expect(Object.keys(palette).sort()).toEqual([...PALETTE_KEYS].sort());
      const words = paletteWords(resolvePalette(name));
      expect(words.length).toBe(36);
      for (const key of PALETTE_KEYS) expect(parseColor(palette[key])).toBeDefined();
    }
  });

  test("the loader's small colour table matches the themes", () => {
    for (const [name, palette] of Object.entries(THEMES)) {
      expect(CHROME[name]).toEqual(CHROME_KEYS.map((key) => palette[key].slice(1)));
    }
  });
});

describe("posterHtml", () => {
  test("escapes everything it writes into attributes", () => {
    const html = posterHtml({ ...base, theme: '"><script>alert(1)</script>' as never, alt: 'a "map" <b>', className: 'x" onload="y' });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('onload="y');
    expect(html).toContain('alt="a &quot;map&quot; &lt;b&gt;"');
  });

  test("carries colours so the live map matches the image", () => {
    expect(posterHtml({ ...base, colors: { water: "#000000" } })).toContain('colors="water:000000"');
  });
});

describe("parseMarkerList", () => {
  test("reads lng,lat,label entries and skips broken ones", () => {
    expect(parseMarkerList("-122.4,37.7,$9;oops;1,2")).toEqual([
      { id: 0, lng: -122.4, lat: 37.7, label: "$9" },
      { id: 2, lng: 1, lat: 2 },
    ]);
  });
});

describe("pixelRatio", () => {
  const scope = globalThis as { devicePixelRatio?: number };
  const setConnection = (connection: unknown) => Object.defineProperty(globalThis.navigator, "connection", { value: connection, configurable: true });
  afterEach(() => {
    delete scope.devicePixelRatio;
    setConnection(undefined);
  });

  test("is 1 on a standard screen whatever is asked", () => {
    scope.devicePixelRatio = 1;
    expect(pixelRatio("high")).toBe(1);
  });

  test("is 2 on a dense screen when the browser does not report the connection", () => {
    scope.devicePixelRatio = 3;
    expect(pixelRatio(null)).toBe(2);
  });

  test("drops to 1 on a dense screen when the visitor saves data or the connection is slow", () => {
    scope.devicePixelRatio = 2;
    setConnection({ saveData: true, effectiveType: "4g", downlink: 10 });
    expect(pixelRatio("auto")).toBe(1);
    setConnection({ saveData: false, effectiveType: "3g", downlink: 0.6 });
    expect(pixelRatio(null)).toBe(1);
    setConnection({ saveData: false, effectiveType: "4g", downlink: 1.6 });
    expect(pixelRatio(null)).toBe(1);
    setConnection({ saveData: false, effectiveType: "4g", downlink: 9 });
    expect(pixelRatio(null)).toBe(2);
  });

  test("detail overrides the connection", () => {
    scope.devicePixelRatio = 2;
    setConnection({ saveData: true });
    expect(pixelRatio("high")).toBe(2);
    setConnection({ downlink: 10 });
    expect(pixelRatio("low")).toBe(1);
  });
});
