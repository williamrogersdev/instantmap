export const PALETTE_KEYS = [
  "land",
  "water",
  "waterLine",
  "waterLabel",
  "park",
  "landuse",
  "sand",
  "building",
  "road",
  "roadCasing",
  "majorRoad",
  "majorRoadCasing",
  "highway",
  "highwayCasing",
  "rail",
  "path",
  "boundary",
  "countryBoundary",
  "label",
  "labelMinor",
  "labelHalo",
  "neighbourhood",
  "region",
  "shield",
  "shieldText",
  "shieldLine",
  "interstate",
  "interstateText",
  "marker",
  "markerText",
  "accent",
  "cluster",
  "clusterText",
  "selected",
  "selectedText",
  "shadow",
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];

export type Palette = Record<PaletteKey, string>;

export type ThemeName = "daylight" | "midnight" | "paper" | "mono";

export const THEMES: Record<ThemeName, Palette> = {
  daylight: {
    land: "#f6f5f2",
    water: "#a9d4f1",
    waterLine: "#8cc2e6",
    waterLabel: "#3a76a6",
    park: "#d5ebcf",
    landuse: "#efede8",
    sand: "#f4ecd6",
    building: "#e7e4de",
    road: "#ffffff",
    roadCasing: "#dfdad2",
    majorRoad: "#ffffff",
    majorRoadCasing: "#d3cdc3",
    highway: "#fde2a4",
    highwayCasing: "#e6bb63",
    rail: "#cbc7c0",
    path: "#e5e1da",
    boundary: "#bdb6c8",
    countryBoundary: "#9a93a8",
    label: "#272a2f",
    labelMinor: "#5b6068",
    labelHalo: "#ffffff",
    neighbourhood: "#7b8089",
    region: "#8b8794",
    shield: "#ffffff",
    shieldText: "#3f434a",
    shieldLine: "#c9c3b8",
    interstate: "#3d4b63",
    interstateText: "#ffffff",
    marker: "#5b3df5",
    markerText: "#ffffff",
    accent: "#5b3df5",
    cluster: "#24186b",
    clusterText: "#ffffff",
    selected: "#2de0c8",
    selectedText: "#062a25",
    shadow: "#0000004d",
  },
  midnight: {
    land: "#161a21",
    water: "#0c2a47",
    waterLine: "#1b4670",
    waterLabel: "#6f9fcc",
    park: "#14281d",
    landuse: "#191e26",
    sand: "#1c1b17",
    building: "#1e242e",
    road: "#252c37",
    roadCasing: "#161a21",
    majorRoad: "#333d4c",
    majorRoadCasing: "#161a21",
    highway: "#6e6043",
    highwayCasing: "#1b1d22",
    rail: "#2a313c",
    path: "#1d232c",
    boundary: "#3d4656",
    countryBoundary: "#5a6479",
    label: "#e2e7ee",
    labelMinor: "#9ba5b3",
    labelHalo: "#161a21",
    neighbourhood: "#7e8896",
    region: "#6d7786",
    shield: "#333d4c",
    shieldText: "#c9d1dc",
    shieldLine: "#3b485b",
    interstate: "#3a6ea5",
    interstateText: "#ffffff",
    marker: "#a594ff",
    markerText: "#140c3a",
    accent: "#a594ff",
    cluster: "#6a4cff",
    clusterText: "#ffffff",
    selected: "#2de0c8",
    selectedText: "#062a25",
    shadow: "#00000099",
  },
  paper: {
    land: "#f3f1ec",
    water: "#d0dee8",
    waterLine: "#b9d0e0",
    waterLabel: "#5f849f",
    park: "#e3ead9",
    landuse: "#eceae5",
    sand: "#f1ece0",
    building: "#e4e0d8",
    road: "#ffffff",
    roadCasing: "#dfd9cf",
    majorRoad: "#ffffff",
    majorRoadCasing: "#d2cbc0",
    highway: "#ecdcbd",
    highwayCasing: "#b3a790",
    rail: "#d6d1c9",
    path: "#e2ddd5",
    boundary: "#c9c1b4",
    countryBoundary: "#9d9384",
    label: "#3d3a35",
    labelMinor: "#7a756d",
    labelHalo: "#f3f1ec",
    neighbourhood: "#857f75",
    region: "#9a948a",
    shield: "#ffffff",
    shieldText: "#5c564e",
    shieldLine: "#bdb6aa",
    interstate: "#4a5563",
    interstateText: "#ffffff",
    marker: "#3d2fb0",
    markerText: "#ffffff",
    accent: "#3d2fb0",
    cluster: "#1f1a4d",
    clusterText: "#ffffff",
    selected: "#f0b429",
    selectedText: "#2a1a00",
    shadow: "#2b24184d",
  },
  mono: {
    land: "#f4f4f3",
    water: "#dde2e7",
    waterLine: "#c9d0d8",
    waterLabel: "#6b7480",
    park: "#e9ece8",
    landuse: "#efefee",
    sand: "#f1f0ec",
    building: "#e6e6e4",
    road: "#ffffff",
    roadCasing: "#dededc",
    majorRoad: "#ffffff",
    majorRoadCasing: "#d2d2cf",
    highway: "#ffffff",
    highwayCasing: "#bdbdb9",
    rail: "#d0d0cd",
    path: "#e4e4e2",
    boundary: "#c4c4c0",
    countryBoundary: "#9a9a96",
    label: "#2b2b2b",
    labelMinor: "#6a6a6a",
    labelHalo: "#ffffff",
    neighbourhood: "#828282",
    region: "#8f8f8f",
    shield: "#ffffff",
    shieldText: "#4a4a4a",
    shieldLine: "#c4c4c0",
    interstate: "#4a4a4a",
    interstateText: "#ffffff",
    marker: "#5b3df5",
    markerText: "#ffffff",
    accent: "#5b3df5",
    cluster: "#5b3df5",
    clusterText: "#ffffff",
    selected: "#24186b",
    selectedText: "#ffffff",
    shadow: "#00000040",
  },
};

export const DEFAULT_THEME: ThemeName = "daylight";

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i;

export function parseColor(value: string): number | undefined {
  const match = HEX.exec(value.trim());
  if (!match) return undefined;
  const digits = match[1]!.length === 6 ? `${match[1]}ff` : match[1]!;
  return Number.parseInt(digits, 16) >>> 0;
}

export function resolvePalette(theme: string | undefined, overrides: Partial<Record<string, string>> = {}): Palette {
  const base = THEMES[(theme ?? DEFAULT_THEME) as ThemeName] ?? THEMES[DEFAULT_THEME];
  const palette = { ...base };
  for (const key of PALETTE_KEYS) {
    const value = overrides[key];
    if (value !== undefined && parseColor(value) !== undefined) palette[key] = value.startsWith("#") ? value : `#${value}`;
  }
  return palette;
}

export function paletteWords(palette: Palette): Uint32Array {
  return Uint32Array.from(PALETTE_KEYS.map((key) => parseColor(palette[key]) ?? 0));
}

export function encodeColors(overrides: Partial<Record<string, string>>): string {
  return PALETTE_KEYS.filter((key) => overrides[key] !== undefined && parseColor(overrides[key]!) !== undefined)
    .map((key) => `${key}:${overrides[key]!.replace("#", "").toLowerCase()}`)
    .join(",");
}

export function decodeColors(value: string | null | undefined): Partial<Record<PaletteKey, string>> {
  const result: Partial<Record<PaletteKey, string>> = {};
  for (const entry of (value ?? "").split(",")) {
    const [key, color] = entry.split(":");
    if (key && color && (PALETTE_KEYS as readonly string[]).includes(key) && parseColor(color) !== undefined) {
      result[key as PaletteKey] = `#${color.toLowerCase()}`;
    }
  }
  return result;
}
