---
title: "<instant-map> element"
description: Every attribute, property, method and event of the <instant-map> custom element.
sidebar:
  order: 1
---

`<instant-map>` is a standard custom element. Importing `instantmap` (or loading `https://instantmap.org/instant-map.js`) defines it once; importing it twice is harmless.

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
| `selected` | marker `id` | none | Selects a marker and opens its popup. |
| `src` | URL | `https://instantmap.org` | Origin of the image server (your own Worker in production). |
| `load` | `intent` · `visible` · `eager` · `none` | `intent` | When the interactive map loads. `intent`: first hover, touch, focus or wheel. `visible`: when the map scrolls into view and the browser is idle. `eager`: straight away. `none`: never, the map stays a picture. |
| `scroll-zoom` | `cooperative` · `always` · `off` | `cooperative` | `cooperative` lets the page scroll and zooms only with ⌘/Ctrl held, or after the visitor has dragged the map. |
| `aria-label` | text | `Map` | Accessible name. Also the poster's `alt`. |

## Properties

| Property | Type | Notes |
| --- | --- | --- |
| `markers` | `Marker[]` | Set an array; the map re-clusters and redraws. Replace the array to update. |
| `popup` | `(marker) => HTMLElement \| string \| null` | Builds the popup for a selected marker. Defaults to a card from `title`, `subtitle`, `image`, `label` and `href`. Set `null` for no popups. |
| `theme` | `string` | Same as the attribute. |
| `colors` | `Partial<Record<PaletteKey, string>>` | Token overrides, e.g. `{ accent: "#ff5a5f" }`. |
| `camera` | `{ center: [lng, lat], zoom }` | Read-only. Current view. |
| `bounds` | `[west, south, east, north]` | Read-only. Visible area. |
| `selected` | `Marker \| null` | Read-only. Use `select()` to change. |
| `interactive` | `boolean` | Read-only. `true` once the interactive map has taken over. |
| `palette` | `Palette` | Read-only. The resolved colours. |

### Marker

```ts
interface Marker<Data = unknown> {
  id: string | number;   // required, unique
  lng: number;
  lat: number;
  label?: string;        // shown in the pill, e.g. "$42" (10 characters max)
  title?: string;        // popup heading
  subtitle?: string;     // popup second line
  image?: string;        // popup photo URL
  href?: string;         // popup "View details" link
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
| `select(id \| null)` | `void` | Select a marker and open its popup; `null` closes it. |
| `highlight(id \| null)` | `void` | Emphasise a marker without opening anything. Use it for list hover. |
| `getMarker(id)` | `Marker \| undefined` | Look up by id. |
| `project(lng, lat)` | `[x, y]` | Screen position in CSS pixels, relative to the element. |
| `unproject(x, y)` | `[lng, lat]` | The reverse. |
| `whenIdle()` | `Promise<void>` | Resolves when the image or every tile in view has loaded. |
| `activate()` | `void` | Load the interactive map now, whatever `load` says. |

## Events

All events bubble and cross shadow roots. Listen with `addEventListener`, or `on…` props in the [React component](/docs/reference/react/).

| Event | `detail` | Cancelable | Default action |
| --- | --- | --- | --- |
| `markerclick` | `{ marker }` | yes | Selects the marker and opens its popup. `event.preventDefault()` to handle it yourself. |
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
| Escape | Close the popup |

## Styling hooks

The element uses a shadow root. Style the parts from outside with `::part`:

```css
instant-map::part(controls) { top: auto; bottom: 32px; }
instant-map::part(attribution) { font-size: 10px; }
```

Popups are rendered in the light DOM (`<div slot="popup" class="instant-map-popup">`), so your own CSS, Tailwind classes and components style them normally. The default card uses these classes: `.instant-map-card`, `.title`, `.subtitle`, `.price`, `.cta`, `.close`.
