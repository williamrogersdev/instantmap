import { PALETTE_KEYS, type Palette, type PaletteKey, THEMES, type ThemeName } from "./themes.ts";

// A whole map palette from the handful of colours a style guide already has.
// Plain arithmetic on sRGB bytes: no dependency, no DOM, a few microseconds, the same answer on the server and in the browser.

/** The colours of a brand. Only `primary` is required. The names follow common design-token sets (Tailwind, shadcn/ui, Material). */
export interface BrandInput {
  /** The brand colour. Markers, clusters and highways take it. */
  primary: string;
  /** The page or surface colour the map sits on. Land takes a tint of it. Default near-white, or near-black when `mode` is "dark". */
  background?: string;
  /** Body text colour. Labels and outlines are mixed from it. Default dark ink, or light ink on a dark background. */
  foreground?: string;
  /** A second colour, used for the selected marker. Default: the foreground colour. */
  accent?: string;
  /** Water. Default: a quiet blue leaning toward the brand colour. */
  water?: string;
  /** Parks and forests. Default: a quiet green. */
  park?: string;
  /** "light" or "dark". Default: decided from `background`. */
  mode?: "light" | "dark";
  /** How strongly the brand colour tints land, water and roads, from 0 (neutral) to 1. Default 0.5. */
  tint?: number;
}

export interface BrandTheme {
  /** The built-in theme the colours are layered over. */
  theme: ThemeName;
  /** Only the colours that differ from that theme, ready for the `colors` attribute, prop or staticUrl option. */
  colors: Partial<Record<PaletteKey, string>>;
}

type Rgb = [number, number, number];

const clamp = (value: number, min = 0, max = 255): number => Math.max(min, Math.min(max, value));

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number): number => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)];
}

/** Reads "#rgb", "#rrggbb", "rgb(r g b)", "hsl(h s% l%)" and the bare "h s% l%" triplets some token files use. */
export function parseBrandColor(value: string): Rgb | undefined {
  const text = String(value).trim().toLowerCase();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    const digits = hex[1]!.length === 3 ? hex[1]!.replace(/./g, "$&$&") : hex[1]!;
    return [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16)) as Rgb;
  }
  const numbers = text.match(/-?\d*\.?\d+%?/g);
  if (!numbers || numbers.length < 3) return undefined;
  const [first, second, third] = numbers.map((part) => Number.parseFloat(part)) as [number, number, number];
  if (text.startsWith("rgb")) return [first, second, third].map((channel, index) => clamp(Math.round(numbers[index]!.endsWith("%") ? channel * 2.55 : channel))) as Rgb;
  if (text.startsWith("hsl") || /^[\d.\s%,-]+$/.test(text)) return hslToRgb(((first % 360) + 360) % 360, clamp(second, 0, 100) / 100, clamp(third, 0, 100) / 100);
  return undefined;
}

const toHex = (color: Rgb): string => `#${color.map((channel) => clamp(Math.round(channel)).toString(16).padStart(2, "0")).join("")}`;

const mix = (from: Rgb, to: Rgb, amount: number): Rgb => [0, 1, 2].map((index) => from[index]! + (to[index]! - from[index]!) * amount) as Rgb;

function luminance(color: Rgb): number {
  const [red, green, blue] = color.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

const contrast = (a: Rgb, b: Rgb): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** White or near-black text, whichever reads better on the colour. */
const textOn = (color: Rgb, ink: Rgb): Rgb => (contrast(color, WHITE) >= contrast(color, ink) ? WHITE : ink);

/** Moves a colour toward black or white until it has at least the wanted contrast against a background. */
function readable(color: Rgb, against: Rgb, wanted: number): Rgb {
  const toward = luminance(against) > 0.4 ? BLACK : WHITE;
  let result = color;
  for (let step = 0; step < 12 && contrast(result, against) < wanted; step++) result = mix(result, toward, 0.12);
  return result;
}

/**
 * Builds a map theme from brand colours.
 *
 *     const brand = brandTheme({ primary: "#e11d48", background: "#fff7ed" });
 *     staticUrl({ center, zoom, width, height, ...brand });
 *     <InstantMap {...brand} />            // or map.theme = brand.theme; map.colors = brand.colors
 */
export function brandTheme(input: BrandInput): BrandTheme {
  const primary = parseBrandColor(input.primary);
  if (!primary) throw new TypeError(`brandTheme: "${input.primary}" is not a colour this reads (use #rrggbb, rgb() or hsl())`);
  const given = (value: string | undefined): Rgb | undefined => (value === undefined ? undefined : parseBrandColor(value));
  const backgroundInput = given(input.background);
  const dark = input.mode ? input.mode === "dark" : backgroundInput ? luminance(backgroundInput) < 0.18 : false;
  const background = backgroundInput ?? (dark ? [21, 24, 30] : [245, 245, 242]);
  const ink = given(input.foreground) ?? (dark ? [228, 232, 238] : [28, 37, 48]);
  const tint = clamp(input.tint ?? 0.5, 0, 1);
  const lift = dark ? WHITE : BLACK;

  const land = mix(background, primary, 0.05 * tint);
  const water = given(input.water) ?? mix(mix(land, dark ? [22, 60, 104] : [126, 184, 228], dark ? 0.6 : 0.62), primary, 0.14 * tint);
  const park = given(input.park) ?? mix(land, dark ? [34, 84, 52] : [150, 205, 138], dark ? 0.45 : 0.5);
  const road = dark ? mix(land, WHITE, 0.13) : WHITE;
  const marker = readable(primary, land, 3);
  const selected = given(input.accent) ?? (dark ? WHITE : ink);
  const darkInk: Rgb = [15, 23, 32];

  const palette: Record<PaletteKey, Rgb | string> = {
    land,
    water,
    waterLine: mix(water, lift, dark ? 0.14 : 0.1),
    waterLabel: readable(mix(water, ink, 0.55), water, 3),
    park,
    landuse: mix(land, ink, 0.035),
    sand: mix(land, dark ? [92, 82, 54] : [232, 216, 164], 0.4),
    building: mix(land, ink, 0.08),
    road,
    roadCasing: mix(land, ink, dark ? 0.02 : 0.15),
    majorRoad: dark ? mix(land, WHITE, 0.2) : WHITE,
    majorRoadCasing: mix(land, ink, dark ? 0.04 : 0.22),
    highway: mix(road, primary, dark ? 0.45 : 0.18 + 0.2 * tint),
    highwayCasing: mix(land, primary, dark ? 0.3 : 0.5),
    rail: mix(land, ink, 0.2),
    path: mix(land, ink, 0.1),
    boundary: mix(land, ink, 0.3),
    countryBoundary: mix(land, ink, 0.45),
    label: readable(ink, land, 7),
    labelMinor: readable(mix(ink, land, 0.3), land, 4.5),
    labelHalo: dark ? land : WHITE,
    neighbourhood: readable(mix(ink, land, 0.42), land, 3.5),
    region: mix(ink, land, 0.5),
    shield: dark ? mix(land, WHITE, 0.16) : WHITE,
    shieldText: mix(ink, land, 0.2),
    shieldLine: mix(land, ink, 0.25),
    interstate: mix(primary, dark ? WHITE : BLACK, 0.35),
    interstateText: textOn(mix(primary, dark ? WHITE : BLACK, 0.35), darkInk),
    marker,
    markerText: textOn(marker, darkInk),
    accent: marker,
    cluster: marker,
    clusterText: textOn(marker, darkInk),
    selected,
    selectedText: textOn(selected, darkInk),
    shadow: dark ? "#00000099" : "#0000004d",
  };

  const theme: ThemeName = dark ? "midnight" : "daylight";
  const base: Palette = THEMES[theme];
  const colors: Partial<Record<PaletteKey, string>> = {};
  for (const key of PALETTE_KEYS) {
    const value = palette[key];
    const hex = typeof value === "string" ? value : toHex(value);
    if (hex !== base[key].toLowerCase()) colors[key] = hex;
  }
  return { theme, colors };
}

/**
 * Reads brand colours from CSS custom properties, so the map follows the same tokens as the rest of the page.
 * Browser only, and it runs after the stylesheet has loaded: where the first image is rendered on the server,
 * pass the same token values to brandTheme() there so the image and the live map agree.
 *
 *     const brand = brandThemeFromCss({ primary: "--primary", background: "--background", foreground: "--foreground" });
 */
export function brandThemeFromCss(tokens: { [Key in keyof Omit<BrandInput, "mode" | "tint">]?: string }, options: { element?: Element; mode?: "light" | "dark"; tint?: number } = {}): BrandTheme {
  const style = getComputedStyle(options.element ?? document.documentElement);
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  // The canvas turns any colour the browser understands (oklch, color-mix, named colours) into sRGB bytes.
  const read = (name: string | undefined): string | undefined => {
    const raw = name ? style.getPropertyValue(name).trim() : "";
    if (!raw) return undefined;
    const direct = parseBrandColor(raw);
    if (direct) return toHex(direct);
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000";
    context.fillStyle = raw;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    return alpha ? toHex([red!, green!, blue!]) : undefined;
  };
  const primary = read(tokens.primary);
  if (!primary) throw new TypeError(`brandThemeFromCss: ${tokens.primary ?? "primary"} is not set or is not a colour`);
  const input: BrandInput = { primary };
  for (const key of ["background", "foreground", "accent", "water", "park"] as const) {
    const value = read(tokens[key]);
    if (value) input[key] = value;
  }
  if (options.mode) input.mode = options.mode;
  if (options.tint !== undefined) input.tint = options.tint;
  return brandTheme(input);
}
