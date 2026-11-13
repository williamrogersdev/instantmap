---
title: Customising the look
description: Pick a theme, recolour it with tokens, restyle controls and popups, and keep the first image in sync.
sidebar:
  order: 5
---

The look has three layers, from broadest to narrowest:

1. **Theme.** One of `daylight`, `midnight`, `paper` or `mono`.
2. **Colour tokens.** Override any of the [36 tokens](/docs/reference/themes/) on top of the theme.
3. **CSS.** Restyle the controls, attribution and popups like any other part of your page.

The server reads layers 1 and 2 too, so the first image is painted in your colours.

## Brand it in one line

Most brands need four tokens: the marker pill, its text, the selected state and clusters.

```html
<instant-map
  theme="daylight"
  colors="marker:ffffff,markerText:111827,selected:ff385c,cluster:ff385c,accent:ff385c">
</instant-map>
```

## Dark mode that follows the page

```js
const media = matchMedia("(prefers-color-scheme: dark)");
const apply = () => (map.theme = media.matches ? "midnight" : "daylight");
media.addEventListener("change", apply);
apply();
```

On the server, pick the theme for the poster from the visitor's `Sec-CH-Prefers-Color-Scheme` header, or from a cookie you set.

## Quieter maps for data

Use `mono` when your markers carry the meaning and the map is only context:

```html
<instant-map theme="mono" colors="accent:2563eb,cluster:2563eb,selected:2563eb"></instant-map>
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

## Restyle the listing card

The default card lives in your page (light DOM), so ordinary CSS reaches it through `.instant-map-card`. Its button takes the `marker` and `markerText` colours, so it always matches your pills.

Set `--im-font` to give the card your site's typeface:

```css
instant-map {
  --im-font: "Inter", system-ui, sans-serif;
}
```

To replace the card entirely, use your own [popup](/docs/guides/popups/).

## Keep the poster in sync

Pass the same `theme` and `colors` to `staticUrl()` (or the React component's props) that you give the element. Otherwise the visitor sees the colours change at the hand-off.

## Contrast checklist

- Keep `markerText` on `marker` at 4.5:1 or better. Prices are small text.
- Keep `label` against `land` readable at 12 px.
- Don't use colour alone to carry meaning. A selected marker also grows and gets a stronger shadow.
