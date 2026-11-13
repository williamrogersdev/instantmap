---
title: React component
description: Props, events and the imperative handle of <InstantMap> from instantmap/react.
sidebar:
  order: 2
---

```tsx
import { InstantMap } from "instantmap/react";

<InstantMap
  center={[-97.7431, 30.2672]}
  zoom={12}
  markers={listings}
  style={{ height: 480 }}
  onMarkerClick={(marker) => console.log(marker.id)}
/>;
```

Works with React 18 and 19, on the client and on the server. The file starts with `"use client"`, so you can use it directly inside Next.js Server Components. On the server it renders the `<instant-map>` element with its poster `<img>`, so the map is in the first HTML response.

## Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `center` | `[lng, lat]` | required | A new value jumps the map there. To animate, call `ref.current.flyTo()` instead. |
| `zoom` | `number` | required | A new value jumps the map there. |
| `markers` | `Marker<Data>[]` | `[]` | Pass a new array to update. Memoise it if you build it in render. |
| `theme` | `"daylight" \| "midnight" \| "paper" \| "mono"` | `"daylight"` | |
| `colors` | `Partial<Record<PaletteKey, string>>` | none | Memoise it if you build it in render. |
| `cluster` | `number \| false` | `44` | |
| `selected` | `id \| null` | uncontrolled | Controls the selection. |
| `renderPopup` | `(marker) => ReactNode` or `null` | default card | Your own popup, rendered through a portal, so context, state and Tailwind all work. `null` turns popups off. |
| `src` | `string` | `"https://instantmap.org"` | Your image server. |
| `load` | `"intent" \| "visible" \| "eager" \| "none"` | `"intent"` | |
| `scrollZoom` | `"cooperative" \| "always" \| "off"` | `"cooperative"` | |
| `posterWidth`, `posterHeight` | `number` | `1280`, `720` | Size of the first image. Match your container's aspect ratio. |
| `alt` | `string` | `"Map"` | |
| `className`, `style` | | | Give the map a height here. |

## Event props

| Prop | Called with |
| --- | --- |
| `onMarkerClick` | `(marker, event)`. Call `event.preventDefault()` to skip the default selection. |
| `onClusterClick` | `(cluster, event)`. Call `event.preventDefault()` to skip the default zoom. |
| `onMarkerEnter`, `onMarkerLeave` | `(marker)` |
| `onSelect` | `(marker \| null)` |
| `onMove`, `onMoveEnd` | `({ center, zoom })` |
| `onInteractive` | `()` |

Handlers are read from the latest render, so inline arrow functions don't re-subscribe anything.

## Ref

The ref is the `<instant-map>` element itself, with every [method](/docs/reference/element/#methods):

```tsx
const map = useRef<InstantMapHandle<Listing>>(null);

<button onClick={() => map.current?.fitBounds(listings)}>Show all</button>
<InstantMap ref={map} center={center} zoom={11} markers={listings} />
```

## Custom popup

```tsx
<InstantMap
  center={center}
  zoom={12}
  markers={listings}
  renderPopup={(marker) => (
    <article className="w-64 rounded-xl bg-white p-3 shadow-xl">
      <h3 className="font-semibold">{marker.title}</h3>
      <AddToCart id={marker.id} />
    </article>
  )}
/>
```
