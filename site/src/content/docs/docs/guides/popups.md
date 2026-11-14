---
title: Cards and popups
description: The built-in marker card, how to restyle it with options, CSS variables or a template, how its images load fast, and how to use your own popup or skip it.
sidebar:
  order: 2
---

Clicking a marker selects it, and the map opens a card above it. There are four levels, from no code to full control. Use the lowest one that does the job.

| Level | You write | Good for |
| --- | --- | --- |
| 1. Marker fields | Data only | Most listings and store finders. |
| 2. Options | An attribute or a small object | Layout, link text, link target. |
| 3. CSS variables | A few lines of CSS | Matching your brand: radius, colours, font, image shape. |
| 4. Template | A `<template data-card>` in your HTML | Your own markup without writing JavaScript. |

For a card made of your own code or components, see [Your own popup](#your-own-popup).

## 1. Marker fields

If a marker has a `title`, `subtitle` or `image`, the map draws the built-in card from these fields:

| Field | Shown as |
| --- | --- |
| `image` | The photo at the top of the card. |
| `badge` | A small tag over the photo, such as `New` or `Sold`. Without a photo it sits above the title. The `row` layout does not show it. |
| `title` | The heading. Two lines at most. |
| `subtitle` | The second line, for example a neighbourhood. |
| `label` | The price, at the bottom left. This is the same text as the pill on the map. |
| `href` | A link at the bottom right. Its text is **View details** unless you change it. |

```js
map.markers = [
  {
    id: 1,
    lng: -122.4183,
    lat: 37.7758,
    label: "$4,950",
    title: "Sunny 2-bed flat",
    subtitle: "SoMa · 2 beds",
    badge: "New",
    image: "https://cdn.example.com/listings/1-560.webp",
    href: "/listings/1",
  },
];
```

A marker with none of `title`, `image` and `subtitle` opens no card. The card follows the theme: white on light themes, dark on `midnight`.

Links and image addresses in the built-in card and in templates may only be `http`, `https`, `mailto`, `tel` or a relative address. Anything else, such as a `javascript:` address, is dropped.

## 2. Options

The same three options exist as attributes and as a property.

```html
<instant-map card-layout="row" card-action="See listing" card-target="_blank"></instant-map>
```

```js
map.card = { layout: "row", action: "See listing", target: "_blank", closeLabel: "Close details" };
```

| Attribute | `card` property key | Values | Default |
| --- | --- | --- | --- |
| `card-layout` | `layout` | `stacked` (photo on top) or `row` (small photo beside the text) | `stacked` |
| `card-action` | `action` | The link text. An empty string or `off` (`false` in the property) hides the link. | `View details` |
| `card-target` | `target` | `_self` or `_blank` | `_self` |
| none | `closeLabel` | The accessible name of the close button | `Close` |

If you set both, the `card` property wins over the attributes. In React, pass the `card` prop. It takes the same object.

To turn cards off for one map, set `card="off"` on the element, or set `map.popup = null`.

## 3. CSS variables

Set these on `instant-map`, or on any ancestor. The card sits in your page, so they inherit like any other custom property.

| Variable | What it sets | Default |
| --- | --- | --- |
| `--im-card-width` | Card width. It never grows beyond the map. | `264px` (`320px` for `row`) |
| `--im-card-radius` | Corner radius | `14px` |
| `--im-card-padding` | Padding around the text | `12px` |
| `--im-card-background` | Card background | The theme's card colour |
| `--im-card-color` | Text colour | The theme's ink colour |
| `--im-card-muted` | Subtitle colour | The theme's muted colour |
| `--im-card-accent` | Link and focus colour | The theme's accent |
| `--im-card-shadow` | Shadow | A soft shadow |
| `--im-card-font` | Font family | `--im-font`, or the system font |
| `--im-card-image-ratio` | Photo shape | `3/2` |
| `--im-card-placeholder` | Photo background while it loads | A light tint |

```css
instant-map {
  --im-card-radius: 4px;
  --im-card-accent: #c2410c;
  --im-card-font: Georgia, serif;
  --im-card-image-ratio: 16/9;
}
```

For changes beyond these, the card has stable class names inside `.instant-map-card`:

| Class | Element |
| --- | --- |
| `.media` | The photo box (it holds the photo and, when there is one, the badge) |
| `.badge` | The badge |
| `.body` | The text area |
| `.title` | The title |
| `.subtitle` | The subtitle |
| `.foot` | The row holding the price and the link |
| `.price` | The label |
| `.action` | The link |
| `.close` | The close button |

The `.row` class is added to `.instant-map-card` for the row layout.

```css
.instant-map-card .price { color: #047857; }
```

## 4. A template in your HTML

For your own markup without JavaScript, put a `<template data-card>` inside the map. The map fills it in for the selected marker.

```html
<instant-map center="-96.80,32.79" zoom="12" style="height: 440px">
  <template data-card>
    <article class="mine">
      <button type="button" data-close aria-label="Close">✕</button>
      <h3>{{title}}</h3>
      <p>{{subtitle}} · {{data.beds}} beds</p>
      <a href="{{href}}" data-if="href">Open {{label}}</a>
    </article>
  </template>
</instant-map>
```

How the template is filled:

- `{{title}}`, `{{data.beds}}` and any other marker field or `data` path are replaced with the value as **text**. A value can never add markup.
- In `href`, `src` and similar address attributes, the value goes through the same address check as the built-in card. An address that fails the check removes the attribute.
- `srcset` and `style` attributes that contain a `{{…}}` are removed.
- An element with `data-if="field"` is dropped when that field is empty.
- Any `on…` attribute, such as `onclick`, is removed.
- An element with `data-close` (or a `button.close`) closes the card.
- The template must be a direct child of `<instant-map>`.

## Fast card images

The card opens with its photo already loaded when it can. The `card-images` attribute (the `cardImages` prop in React) controls this.

| Value | Behaviour |
| --- | --- |
| `visible` (default) | When the map settles, the images of up to 8 single markers nearest the centre are fetched in idle time. |
| `hover` | Images are fetched only when the pointer is over a marker, and on press. |
| `off` | No fetching ahead. The card loads its photo when it opens. |

With `visible`, nothing is fetched ahead when the visitor has Save-Data on or a 2G connection. In every mode except `off`, an image is also fetched when the pointer is over its marker and when the marker is pressed. The map also adds a `preconnect` for up to two image origins.

To keep photos light:

- Serve card images about 560 px wide. The card is 264 px wide, so that covers a 2x screen.
- Use WebP or AVIF.
- Send long cache headers, such as `Cache-Control: public, max-age=31536000, immutable`, for images with versioned file names.

## Your own popup

`map.popup` decides what a selected marker shows:

| Value | Result |
| --- | --- |
| unset (the default) | The built-in card, or your `<template data-card>` if there is one. |
| a function | Your own renderer. |
| `null` | No card. |

```js
map.popup = (marker) => {
  const card = document.createElement("article");
  card.className = "my-card";
  const heading = document.createElement("h3");
  heading.textContent = marker.title;
  const button = document.createElement("button");
  button.textContent = "Add to cart";
  button.onclick = () => addToCart(marker.id);
  card.append(heading, button);
  return card;
};
```

Return an element or an HTML string, or return `null` or an empty string to show nothing for that marker. The popup lives in your page, so your stylesheets, Tailwind and design-system classes apply.

:::caution
A returned HTML string is inserted as markup. Escape any user content in it, or build elements and set `textContent`.
:::

If you need the built-in card inside your own renderer, import it from `instantmap-js/card`:

```js
import { defaultCard } from "instantmap-js/card";

map.popup = (marker) => (marker.data.soldOut ? null : defaultCard(marker, { layout: "row" }));
```

`instantmap-js/card` also exports `cardFromTemplate`, `safeUrl`, `escapeHtml` and `CARD_CSS`.

### React

```tsx
<InstantMap
  center={[-122.42, 37.77]}
  zoom={12}
  markers={markers}
  card={{ layout: "row", action: "See listing" }}
  cardImages="visible"
/>
```

To render your own component, use `renderPopup`:

```tsx
<InstantMap markers={markers} renderPopup={(marker) => <ListingCard listing={marker.data} />} />
```

The component renders through a portal, so it keeps your providers, context and state. `renderPopup={null}` turns cards off. When `renderPopup` is set, the `card` options are not used.

## No card: navigate instead

If a click should go straight to a page, skip the card and handle `markerclick`:

```js
map.popup = null;
map.addEventListener("markerclick", (event) => {
  location.href = event.detail.marker.href;
});
```

This suits maps where each marker is a link, such as a directory or a search result page.

## Behaviour

- The map pans just enough to keep the open card on screen.
- Escape, the close button or a click on empty map closes it.
- `map.select(id)` opens a card from code, for example from a list. `map.select(null)` closes it.
- On narrow maps the card shrinks to fit the map.
- The card has `role="dialog"` and is named by the marker's title.
