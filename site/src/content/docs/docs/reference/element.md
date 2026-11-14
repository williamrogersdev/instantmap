---
title: "<instant-map> element"
description: Every attribute, property, method and event of the <instant-map> custom element.
sidebar:
  order: 1
---

`<instant-map>` is a standard custom element. Importing `instantmap` (or loading `https://instantmap.org/instant-map.js`) defines it once; importing it twice is harmless.

What loads, and when: the element and its first image come to about 7 KB gzipped before anyone touches the map. The engine (tiles, gestures, markers and cards) is about 11 KB more, fetched on the first sign of intent: pointer enter, touch, focus or wheel, or as the `load` attribute says. A press or tap that lands while the engine is loading is replayed, so it is not lost.

```ts
import "instantmap";
```

## Sizing

The element is `display: block` and fills the box you give it. Give it a height, or an aspect ratio, or it collapses to zero:

```css
instant-map { height: 480px; }
/* or */
instant-map { aspect-ratio: 16 / 9; }
```

## The first image

Put the server-rendered image inside the element as an `<img>`, or as a `<picture>` when phones should get their own, smaller view:

```html
<instant-map style="height: 480px">
  <picture>
    <source media="(max-width: 900px)" srcset="/static?center=...&size=400x320&r=2" />
    <img src="/static?center=...&size=1280x800&r=2" alt="Map of listings" />
  </picture>
</instant-map>
```

Without `center` and `zoom` attributes, the map starts from the view of whichever image the browser shows, so each image can frame its own view. Use `<picture>` with `media`, not `srcset` width descriptors: the browser may pick either image by pixel density, so a phone could get the large view.

## Attributes

Attributes are for HTML and server templates. Every attribute also has a JavaScript route (a property or a method) listed under it.

| Attribute | Value | Default | What it does |
| --- | --- | --- | --- |
| `center` | `"lng,lat"` | from the poster image, or `0,0` | Map centre. Longitude first. |
| `zoom` | number `0`–`19` | from the poster image, or `2` | Zoom level. Fractions are fine. |
| `markers` | `"lng,lat,label;lng,lat"` | none | Markers for pages without JavaScript data. Use the `markers` property for anything richer. |
| `theme` | `daylight` · `midnight` · `paper` · `mono` | `daylight` | Built-in palette. See [Themes](/docs/reference/themes/). |
| `colors` | `"water:0a1d31,accent:ff5a5f"` | none | Override single palette tokens on top of the theme. |
| `cluster` | pixels, or `off` | `44` | Distance at which markers merge into a cluster. |
| `selected` | marker `id` | none | Selects a marker and opens its card. |
| `src` | URL | `https://instantmap.org` (or the origin the script was loaded from) | Origin of the image server (your own Worker in production). |
| `load` | `intent` · `visible` · `eager` · `none` | `intent` | When the interactive map loads. `intent`: first hover, touch, focus or wheel. `visible`: when the map scrolls into view and the browser is idle (hover, touch and focus still load it sooner). `eager`: straight away. `none`: never, the map stays a picture. Read once, when the element starts. |
| `scroll-zoom` | `cooperative` · `always` · `off` | `cooperative` | `cooperative` lets the page scroll and zooms only with ⌘/Ctrl held, or after the visitor has dragged the map. |
| `card` | `off` | cards on | `card="off"` turns cards off. |
| `card-layout` | `stacked` · `row` | `stacked` | Layout of the built-in card. |
| `card-action` | text, `off` or empty | `View details` | Text of the card's link to `href`. An empty value or `off` hides the link. |
| `card-target` | `_blank` | `_self` | Where the card's link opens. |
| `card-images` | `visible` · `hover` · `off` | `visible` | When card images are fetched ahead of a click. See [Cards and popups](/docs/guides/popups/#fast-card-images). |
| `aria-label` | text | `Map` | Accessible name. Also the first image's `alt`. |

`center`, `zoom`, `theme`, `colors`, `markers`, `cluster`, `selected` and `src` are watched: changing them after load updates the map. The others are read when the card is drawn or the element starts.

The `colors` attribute lists `token:hex` pairs without the `#`. Tokens are sorted alphabetically when the library writes the value for you (`staticUrl()`, `posterHtml()`), so the same colours always produce the same address.

## Properties

| Property | Type | Notes |
| --- | --- | --- |
| `markers` | `Marker[]` | Set an array; the map re-clusters and redraws. Replace the array to update. |
| `popup` | `((marker) => HTMLElement \| string \| null \| undefined) \| null \| undefined` | What a selected marker shows. Unset (the default): the built-in card, or a `<template data-card>` child if there is one. A function: your own renderer. `null`: no card. See [Cards and popups](/docs/guides/popups/). |
| `card` | `CardOptions` | Options for the built-in card: `{ layout?, action?, target?, closeLabel? }`. Takes priority over the `card-*` attributes. |
| `theme` | `string` | Same as the attribute. |
| `colors` | `Partial<Record<PaletteKey, string>>` | Token overrides, e.g. `{ accent: "#ff5a5f" }`. Reading it returns a copy. |
| `camera` | `{ center: [lng, lat], zoom }` | Read-only. Current view. |
| `bounds` | `[west, south, east, north]` | Read-only. Visible area. |
| `selected` | `Marker \| null` | Read-only. Use `select()` to change. |
| `interactive` | `boolean` | Read-only. `true` once the interactive map has taken over. |

The resolved colours are not a property. Call `resolvePalette(map.theme, map.colors)` from `instantmap` or `instantmap/server`.

### CardOptions

```ts
interface CardOptions {
  layout?: "stacked" | "row"; // default "stacked"
  action?: string | false;    // link text; false hides the link. Default "View details"
  target?: "_self" | "_blank"; // default "_self"
  closeLabel?: string;        // accessible name of the close button. Default "Close"
}
```

### Marker

```ts
interface Marker<Data = unknown> {
  id: string | number;   // required, unique
  lng: number;
  lat: number;
  label?: string;        // shown in the pill, e.g. "$42" (10 characters max), and as the card's price
  title?: string;        // card heading
  subtitle?: string;     // card second line
  image?: string;        // card photo URL
  href?: string;         // card link
  badge?: string;        // a short tag on the card, e.g. "New"
  data?: Data;           // anything of yours, typed through the generic
}
```

A marker with a `label` draws as a pill; without one it draws as a dot. Markers that would overlap merge into a numbered cluster.

## Methods

| Method | Returns | What it does |
| --- | --- | --- |
| `setCamera({ center?, zoom? })` | `this` | Jump without animation. |
| `flyTo({ center?, zoom?, duration?, animate? })` | `Promise<void>` | Animate there. Zooms out mid-flight for long trips. Respects `prefers-reduced-motion`. |
| `fitBounds(boundsOrMarkers, { padding?, maxZoom?, duration?, animate? })` | `Promise<void>` | Fit `[west, south, east, north]` or an array of markers. |
| `select(id \| null)` | `void` | Select a marker and open its card; `null` closes it. Fires `select` when the selection changes. |
| `highlight(id \| null)` | `void` | Emphasise a marker without opening anything. Use it for list hover. |
| `getMarker(id)` | `Marker \| undefined` | Look up by id. |
| `project(lng, lat)` | `[x, y]` | Screen position in CSS pixels, relative to the element. |
| `unproject(x, y)` | `[lng, lat]` | The reverse. |
| `whenIdle()` | `Promise<void>` | Resolves when the image or every tile in view has loaded. |
| `activate()` | `void` | Load the interactive map now, whatever `load` says. |

`flyTo`, `fitBounds` and `whenIdle` load the engine first if it has not loaded yet.

## Events

All events bubble and cross shadow roots. Listen with `addEventListener`, or `on…` props in the [React component](/docs/reference/react/).

| Event | `detail` | Cancelable | Default action |
| --- | --- | --- | --- |
| `markerclick` | `{ marker }` | yes | Selects the marker and opens its card. `event.preventDefault()` to handle it yourself. |
| `clusterclick` | `{ cluster: { lng, lat, markers, bounds } }` | yes | Zooms to fit the cluster. |
| `markerenter` | `{ marker }` | no | |
| `markerleave` | `{ marker }` | no | |
| `select` | `{ marker \| null }` | no | Fired whenever the selection changes. |
| `move` | `{ center, zoom }` | no | Fired every frame while the view changes. |
| `moveend` | `{ center, zoom }` | no | Fired once the view settles. |
| `interactive` | | no | The interactive map has taken over. |
| `idle` | | no | Everything in view has loaded. |

```js
const map = document.querySelector("instant-map");
map.addEventListener("markerclick", (event) => {
  event.preventDefault();
  location.href = event.detail.marker.href;
});
```

## Keyboard

| Key | Action |
| --- | --- |
| Tab | Focus the map, then the zoom buttons, then each visible marker (announced by title and label) |
| Arrow keys | Pan |
| `+` / `-` | Zoom in / out |
| Enter on a marker | Select it |
| Escape | Close the card |

## Styling hooks

The element uses a shadow root. Style the parts from outside with `::part`:

```css
instant-map::part(controls) { top: auto; bottom: 32px; }
instant-map::part(attribution) { font-size: 10px; }
```

Cards are rendered in the light DOM (`<div slot="popup" class="instant-map-popup">`), so your own CSS, Tailwind classes and components style them normally. Set these custom properties on `instant-map` or any ancestor to restyle the built-in card: `--im-card-width`, `--im-card-radius`, `--im-card-padding`, `--im-card-background`, `--im-card-color`, `--im-card-muted`, `--im-card-accent`, `--im-card-shadow`, `--im-card-font`, `--im-card-image-ratio` and `--im-card-placeholder`. The classes inside `.instant-map-card` are `.media`, `.badge`, `.body`, `.title`, `.subtitle`, `.foot`, `.price`, `.action` and `.close`, plus `.row` on the card itself for the row layout. See [Cards and popups](/docs/guides/popups/) for what each does.

## Declarative cards

A `<template data-card>` that is a direct child of `<instant-map>` becomes the card. `{{title}}` and `{{data.beds}}` are filled as text, `data-if="field"` drops an element whose field is empty, `on…` attributes are removed, and an element with `data-close` closes the card. Links and image addresses accept only `http`, `https`, `mailto`, `tel` and relative addresses. See [Cards and popups](/docs/guides/popups/#4-a-template-in-your-html).
