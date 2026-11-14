---
title: Customising the look
description: Build a map theme from your brand colours, pick a theme, recolour it with tokens, restyle controls and cards, and keep the first image in sync.
sidebar:
  order: 5
---

The look has four layers, from broadest to narrowest:

1. **Brand colours.** Give `brandTheme()` the colours from your style guide and it returns a theme and the colours to go with it.
2. **Theme.** One of `daylight`, `midnight`, `paper` or `mono`.
3. **Colour tokens.** Override any of the [36 tokens](/docs/reference/themes/) on top of the theme.
4. **CSS.** Restyle the controls, attribution and [cards](/docs/guides/popups/) like any other part of your page.

The server reads layers 1 to 3 too, so the first image is painted in your colours.

## Brand colours from your style guide

`brandTheme()` turns a handful of colours into a whole map palette: land, water, parks, roads, labels, markers and clusters. Only `primary` is required.

```ts
import { brandTheme } from "instantmap"; // or "instantmap/server", or "instantmap/brand"

const brand = brandTheme({ primary: "#e11d48", background: "#fff7ed", foreground: "#1c1917" });
// { theme: "daylight", colors: { marker: "#…", cluster: "#…", land: "#…", … } }
```

| Input | Used for | Default |
| --- | --- | --- |
| `primary` (required) | Markers, clusters and highways | |
| `background` | The page colour. Land is a tint of it. | Near-white, or near-black when `mode` is `"dark"` |
| `foreground` | Text colour. Labels and outlines are mixed from it. | Dark ink, or light ink on a dark background |
| `accent` | The selected marker | The foreground colour |
| `water` | Water | A quiet blue leaning toward `primary` |
| `park` | Parks and forests | A quiet green |
| `mode` | `"light"` or `"dark"` | Decided from `background` |
| `tint` | How strongly `primary` tints land, water and roads, from `0` (neutral) to `1` | `0.5` |

Colours can be `#rgb`, `#rrggbb`, `rgb()`, `hsl()`, or the bare `h s% l%` triplets that shadcn-style tokens use, such as `222.2 47.4% 11.2%`.

The result is `{ theme, colors }`. It builds on `daylight` (or `midnight` for dark brands) and lists only the colours that differ. Label and marker text colours are chosen so they stay readable against the colour behind them.

Spread it wherever you give a theme and colours:

```ts
import { staticUrl } from "instantmap/server";

const src = staticUrl({ center: [-122.42, 37.77], zoom: 12, width: 960, height: 480, ratio: 2, markers, ...brand });
```

```tsx
<InstantMap center={[-122.42, 37.77]} zoom={12} markers={markers} {...brand} />
```

```ts
import { posterHtml } from "instantmap/server";

const html = posterHtml({ center: [-122.42, 37.77], zoom: 12, width: 960, height: 480, ...brand });
```

```js
map.theme = brand.theme;
map.colors = brand.colors;
```

### Plain tokens

If your style guide is a list of hex colours, pass them straight in:

```ts
const brand = brandTheme({
  primary: "#0f766e",
  background: "#f0fdfa",
  foreground: "#134e4a",
  accent: "#f59e0b",
  tint: 0.7,
});
```

### Tailwind and shadcn CSS variables

shadcn/ui and many Tailwind setups keep colours as CSS variables such as `--primary`, `--background` and `--foreground`.

**On the server**, pass the same values you put in your stylesheet. Bare triplets work as they are. For `oklch()` values, convert them to hex, `rgb()` or `hsl()` first, because the server reads only those.

```ts
const brand = brandTheme({
  primary: "222.2 47.4% 11.2%",
  background: "0 0% 100%",
  foreground: "222.2 84% 4.9%",
});
```

**In the browser**, `brandThemeFromCss()` reads the variables for you. It accepts any CSS colour syntax, including `oklch()`.

```js
import { brandThemeFromCss } from "instantmap";

const brand = brandThemeFromCss({ primary: "--primary", background: "--background", foreground: "--foreground" });
map.theme = brand.theme;
map.colors = brand.colors;
```

Its second argument is optional: `{ element, mode, tint }`. `element` is where the variables are read (default `<html>`), which is useful for a section that overrides them. It throws if `primary` is not set.

:::note
`brandThemeFromCss()` runs in the browser after your CSS has loaded. For a server-rendered first image, call `brandTheme()` on the server with the same token values. Otherwise the image and the live map can differ slightly.
:::

### A design-token file

If your tokens live in a JSON file, read them with your own code and pass the values in:

```ts
import tokens from "./design-tokens.json";
import { brandTheme } from "instantmap/server";

const brand = brandTheme({
  primary: tokens.color.brand.primary,
  background: tokens.color.surface.page,
  foreground: tokens.color.text.default,
});
```

The shape of your file will differ. Only the values matter: any colour in one of the syntaxes above.

## Pick a theme

If you do not need brand colours, use a built-in theme (`daylight`, `midnight`, `paper` or `mono`) and override a few tokens. Most brands need four: the marker pill, its text, the selected state and clusters.

```html
<instant-map
  theme="daylight"
  colors="marker:ffffff,markerText:111827,selected:ff385c,cluster:ff385c,accent:ff385c">
</instant-map>
```

The `colors` attribute is a comma-separated list of `token:hex` pairs, without the `#`. Tokens are written in alphabetical order when the library builds the value for you, so the same colours always give the same address.

## Dark mode that follows the page

```js
const media = matchMedia("(prefers-color-scheme: dark)");
const apply = () => (map.theme = media.matches ? "midnight" : "daylight");
media.addEventListener("change", apply);
apply();
```

On the server, pick the theme for the first image from the visitor's `Sec-CH-Prefers-Color-Scheme` header, or from a cookie you set. For a brand with both a light and a dark set of colours, build two `brandTheme()` results and switch between them the same way.

## Quieter maps for data

Use `mono` when your markers carry the meaning and the map is only context:

```html
<instant-map theme="mono" colors="accent:2563eb,cluster:2563eb,selected:2563eb"></instant-map>
```

## Read the resolved colours

To see every colour a theme and your overrides produce, call `resolvePalette()`. The map element has no palette property.

```ts
import { resolvePalette } from "instantmap"; // or "instantmap/server"

const palette = resolvePalette(map.theme, map.colors);
palette.water; // "#…"
```

## Restyle the controls

```css
instant-map::part(controls) {
  top: auto;
  bottom: 28px;
  right: 16px;
  border-radius: 999px;
}
instant-map::part(attribution) {
  font-size: 10px;
}
```

## Restyle the card

The built-in card lives in your page (light DOM). Set a few `--im-card-*` variables on `instant-map` to change its radius, colours, font and photo shape, or use the `.instant-map-card` class names for anything else:

```css
instant-map {
  --im-card-radius: 4px;
  --im-card-accent: #c2410c;
  --im-card-font: "Inter", system-ui, sans-serif;
}
```

The full list is in [Cards and popups](/docs/guides/popups/#3-css-variables). To replace the card entirely, use a [template or your own popup](/docs/guides/popups/).

## Keep the first image in sync

Pass the same `theme` and `colors` to `staticUrl()` (or the React component's props) that you give the element. Otherwise the visitor sees the colours change at the hand-off. Spreading one `brandTheme()` result into both is the simplest way.

## Contrast checklist

- `brandTheme()` keeps label and marker text readable for you. If you set tokens by hand, keep `markerText` on `marker` at 4.5:1 or better. Prices are small text.
- Keep `label` against `land` readable at 12 px.
- Don't use colour alone to carry meaning. A selected marker also grows and gets a stronger shadow.
