// Colour helpers small enough to ship in the loader. The list of palette keys lives in themes.ts, away from it.

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i;
const KEY = /^[a-z][a-zA-Z]{0,31}$/;

/** "#rrggbb" or "#rrggbbaa" (the "#" is optional) as a 0xRRGGBBAA number, or undefined when it is not a colour. */
export function parseColor(value: string): number | undefined {
  const match = HEX.exec(String(value).trim());
  if (!match) return undefined;
  const digits = match[1]!.length === 6 ? `${match[1]}ff` : match[1]!;
  return Number.parseInt(digits, 16) >>> 0;
}

/** `{ water: "#b9dde0" }` as "water:b9dde0", keys in alphabetical order so the same colours always give the same address. */
export function encodeColors(overrides: Partial<Record<string, string>>): string {
  return Object.keys(overrides)
    .filter((key) => KEY.test(key) && overrides[key] !== undefined && parseColor(overrides[key]!) !== undefined)
    .sort()
    .map((key) => `${key}:${overrides[key]!.trim().replace("#", "").toLowerCase()}`)
    .join(",");
}

/** The reverse of encodeColors. Entries that are not `key:hex` are dropped; unknown keys are kept for the palette to ignore. */
export function decodeColors(value: string | null | undefined): Partial<Record<string, string>> {
  const result: Partial<Record<string, string>> = {};
  for (const entry of (value ?? "").split(",")) {
    const [key, color] = entry.split(":");
    if (key && color && KEY.test(key) && parseColor(color) !== undefined) result[key] = `#${color.replace("#", "").toLowerCase()}`;
  }
  return result;
}
