---
title: Popups and cards
description: Use the built-in card, render your own HTML or components, or skip popups and navigate.
sidebar:
  order: 2
---

Clicking a marker selects it, and the map opens a popup above it. You choose what goes in that popup.

## The built-in card

If a marker has a `title`, `subtitle` or `image`, the map shows a card with:
- the photo,
- the title and subtitle,
- the label as a price,
- a **View details** button that links to `href`.

You don't need any code beyond the marker data.

The card follows the theme: white on light themes and dark on `midnight`. Tune it with CSS:

```css
.instant-map-card { width: 320px; border-radius: 20px; }
.instant-map-card .cta { background: #ff5a5f; }
```

## Your own HTML

```js
map.popup = (marker) => {
  const card = document.createElement("article");
  card.className = "my-card";
  card.innerHTML = `<h3>${marker.title}</h3><button>Add to cart</button>`;
  card.querySelector("button").onclick = () => addToCart(marker.id);
  return card;
};
```

Return an element or an HTML string, or return `null` to show nothing for that marker. Popups live in your page's light DOM, so your stylesheets, Tailwind and design-system classes apply.

:::caution
If you return an HTML string, escape any user content in it. To be safe, build elements and set `textContent` instead.
:::

## React components

```tsx
<InstantMap markers={markers} renderPopup={(marker) => <ListingCard listing={marker.data} />} />
```

The component renders through a portal, so it keeps your providers, context and state.

## No popup: navigate instead

```js
map.popup = null;
map.addEventListener("markerclick", (event) => {
  location.href = event.detail.marker.href;
});
```

## Behaviour

- The map pans just enough to keep the open card on screen.
- Escape, the ✕ button, or a click on empty map closes it.
- `map.select(id)` opens it from code, for example from a list. `map.select(null)` closes it.
- On narrow maps the card shrinks to fit (`100cqw - 32px`).
