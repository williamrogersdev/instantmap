import { describe, expect, test } from "bun:test";
import { brandTheme, parseBrandColor } from "../src/brand.ts";
import { parseColor } from "../src/colors.ts";
import { resolvePalette } from "../src/themes.ts";

const luminance = (hex: string): number => {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
};
const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

describe("parseBrandColor", () => {
  test("reads the forms token files use", () => {
    expect(parseBrandColor("#e11d48")).toEqual([225, 29, 72]);
    expect(parseBrandColor("#fff")).toEqual([255, 255, 255]);
    expect(parseBrandColor("rgb(15 34 51)")).toEqual([15, 34, 51]);
    expect(parseBrandColor("hsl(0 100% 50%)")).toEqual([255, 0, 0]);
    expect(parseBrandColor("222.2 47.4% 11.2%")).toEqual([15, 23, 42]);
    expect(parseBrandColor("tomato")).toBeUndefined();
  });
});

describe("brandTheme", () => {
  const brands = ["#e11d48", "#0f766e", "#f59e0b", "#4f46e5", "#111827", "#fde047", "#ffffff"];

  test("gives valid colours that stay readable, light and dark", () => {
    for (const primary of brands) {
      for (const mode of ["light", "dark"] as const) {
        const brand = brandTheme({ primary, mode });
        expect(brand.theme).toBe(mode === "dark" ? "midnight" : "daylight");
        for (const value of Object.values(brand.colors)) expect(parseColor(value!)).toBeDefined();
        const palette = resolvePalette(brand.theme, brand.colors);
        expect(contrast(palette.label, palette.land)).toBeGreaterThanOrEqual(7);
        expect(contrast(palette.labelMinor, palette.land)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette.markerText, palette.marker)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette.clusterText, palette.cluster)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette.selectedText, palette.selected)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette.marker, palette.land)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("picks dark mode from a dark background and honours given colours", () => {
    const brand = brandTheme({ primary: "#19d3a2", background: "#0b1220", water: "#001122", accent: "#ff00ff" });
    expect(brand.theme).toBe("midnight");
    expect(brand.colors.water).toBe("#001122");
    expect(brand.colors.selected).toBe("#ff00ff");
  });

  test("is deterministic and rejects what it cannot read", () => {
    expect(brandTheme({ primary: "#e11d48" })).toEqual(brandTheme({ primary: "E11D48" }));
    expect(() => brandTheme({ primary: "tomato" })).toThrow(TypeError);
  });
});
