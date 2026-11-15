---
title: Maps AI agents can read
description: The places in a map as text from the first byte, spatial queries, a JSON description of any view, and tools a browser's AI agent can call.
sidebar:
  order: 9
---

A map is a picture, and a picture is the hardest thing on a page for an AI agent to use. Instant Map gives agents the same map as data, at three levels.

| Who is reading | What they get | How |
| --- | --- | --- |
| A crawler, a screen reader, or an agent reading the page | A list of every place in the first picture, with links, in the HTML | On by default with `posterHtml()` and `<InstantMap>` |
| An agent built into the browser | Three tools: `describe`, `find`, `show` | `agent-tools` attribute, where the browser supports [WebMCP](https://webmachinelearning.github.io/webmcp/) |
| Your own assistant, or a server | The same tools as plain objects, and `describeView()` | `instantmap-js/agent`, `instantmap-js/server` |
| A model with no browser | A JSON description of any `/static` picture | `GET /describe` |

## The place list

`posterHtml()` and `<InstantMap>` put a list of the places in the first picture inside the element:

```html
<instant-map center="-97.74,30.27" zoom="11">
  <img src="https://instantmap.org/static?…" alt="Map of 40 pallet listings in Austin" …>
  <ul data-im-places aria-label="Places on the map">
    <li data-id="L29" data-lnglat="-97.71984,30.27006"><a href="/listings/L29">48x40 Grade A pallets, $93</a></li>
    …
  </ul>
</instant-map>
```

It is hidden from sight but not from the accessibility tree, so an agent reading the page sees each place as a link before any JavaScript runs. Once the live map takes over, it keeps the same list up to date with what is in view, as buttons that open each card. Nothing is listed twice.

The list holds the markers drawn in the picture, including those inside clusters, up to 50. Set `places={{ limit: 100 }}` (or `places: { limit: 100 }` in `posterHtml`) for more, or `places={false}` to leave it out. Markers need a `title` and an `href` for the list to be useful.

## Tools for the browser's agent

```html
<instant-map agent-tools="listings_" agent-noun="listings" …></instant-map>
```

```tsx
<InstantMap agentTools="listings_" agentNoun="listings" … />
```

With `agent-tools`, a browser that supports WebMCP (`document.modelContext`) gets three tools for this map. The value is a prefix for their names, so two maps on one page do not collide; an empty value means `map_`.

| Tool | Does | Changes the page |
| --- | --- | --- |
| `listings_describe` | Returns what the map shows now: bounds, places drawn alone, clusters with their counts and ids, and a summary sentence. | No |
| `listings_find` | Searches every marker, in view or not, by words in its title, subtitle or label, and ranks by distance from a point. | No |
| `listings_show` | Fits markers by id, or an area by bounds, into view and opens a card. Returns the new description. | Only what the person sees |

The tools load in a separate 2.7 KB file, and only when the browser has WebMCP. Without it, the attribute costs nothing. Removing the element takes its tools away.

## The same tools in your own assistant

```ts
import { mapTools } from "instantmap-js/agent";

const tools = mapTools(document.querySelector("instant-map"), { prefix: "map_", noun: "listings" });
// Each tool has name, description, inputSchema (JSON Schema) and execute(input).
const result = await tools.find((tool) => tool.name === "map_find").execute({ query: "grade a", near: [-97.74, 30.27] });
```

`registerMapTools(map, { prefix, noun, signal })` is what the attribute calls; use it to register on your own schedule.

## Spatial queries

From `instantmap-js` or `instantmap-js/server`:

| Function | Returns |
| --- | --- |
| `describeView({ center, zoom, width, height, markers, cluster })` | The description `describe` returns, computed anywhere: on a server, in a worker, in tests. |
| `markersIn(markers, [west, south, east, north])` | The markers inside the bounds. Bounds across the antimeridian have `west > east`. |
| `nearest(markers, [lng, lat], k, maxKm?)` | The `k` closest markers with their distance in kilometres. |
| `viewGroups(view)` | The lone markers and clusters a picture draws, with their pixel positions. `staticUrl` uses it, so the picture and the description always agree. |
| `placesHtml(view, { label, limit })` | The place list as HTML, for templates that do not use `posterHtml`. |

## `GET /describe`

The same address as `/static`, with `/describe` in place of `/static`, returns what that picture shows as JSON, without drawing it:

```json
{
  "bounds": [-97.87733, 30.19881, -97.60267, 30.34114],
  "count": 7,
  "markers": [{ "lng": -97.7, "lat": 30.3, "x": 517, "y": 139, "label": "$40" }],
  "clusters": [{ "lng": -97.73, "lat": 30.28, "x": 429, "y": 206, "count": 5 }],
  "summary": "7 markers in view: 2 on their own and 1 cluster. Labels include $40, $35. …",
  "image": "https://instantmap.org/static?…"
}
```

A model can read a map as text first and fetch the `image` only when a person needs to see it. A static address carries no titles or ids, so for names use `describeView()` with your own markers.
