---
title: Accessibility
description: What the map does for keyboard and screen-reader users, and what you should add.
sidebar:
  order: 8
---

## What you get out of the box

| | |
| --- | --- |
| **A name** | The element has `role="application"`, `aria-roledescription="map"`, and an `aria-label` (default "Map"; set your own). |
| **Keyboard use** | Tab to the map; arrow keys pan and `+` / `-` zoom. Tab on to the zoom buttons, then to each visible marker. |
| **A marker list** | The map keeps a hidden list with a button for each visible marker (up to 50), named by its title and label, for example "Sunny loft, $420". Enter opens its card. |
| **Focus is visible** | Focus rings use the theme's `accent` colour. |
| **Touch targets** | Zoom buttons are 44×44 px, and markers accept taps 6 px beyond their edge. |
| **Reduced motion** | `flyTo`, flings, the wake ripple and card animations turn off under `prefers-reduced-motion`. |
| **The image has a name** | The poster's `alt` uses the map's label. |

## What you should add

- **Name the map for its job:** `aria-label="Map of 24 homes for rent in Austin"`, not "Map".
- **Put the data somewhere else too.** A map is never the only way to reach the listings, so render the same results as a normal list on the page. The [list and map](/docs/guides/list-and-map/) pattern does this.
- **Keep labels readable.** Short labels in high-contrast colours. See the [contrast checklist](/docs/guides/theming/#contrast-checklist).
