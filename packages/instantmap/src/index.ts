import { InstantMapElement } from "./element.ts";

export { InstantMapElement, defaultPopup, parseMarkerList } from "./element.ts";
export { staticUrl, tileUrl, DEFAULT_SRC, MAX_STATIC_SIZE, type StaticUrlInput } from "./static-url.ts";
export { clusterAt, boundsOf, mercatorX, mercatorY, longitudeOf, latitudeOf, DEFAULT_CLUSTER_DISTANCE } from "./cluster.ts";
export { THEMES, PALETTE_KEYS, DEFAULT_THEME, resolvePalette, type Palette, type PaletteKey, type ThemeName } from "./themes.ts";
export type * from "./types.ts";

export function defineInstantMap(tagName = "instant-map"): void {
  if (typeof customElements === "undefined" || customElements.get(tagName)) return;
  customElements.define(tagName, tagName === "instant-map" ? InstantMapElement : class extends InstantMapElement {});
}

defineInstantMap();

declare global {
  interface HTMLElementTagNameMap {
    "instant-map": InstantMapElement;
  }
}
