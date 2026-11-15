# Design brief: maps AI agents can read

November 2026. Ships in 0.2.0.

## The problem

An agent reading a page with an Instant Map saw one `<img>` with alt text such as "Map of 40 listings". The place list the engine builds (`<ul class="sr">`) lived in shadow DOM and only after the engine loaded on first touch, which an agent never sends. Crawlers got nothing. An app's own assistant had no way to ask the map what it showed or to move it. The `/static` address was already a pure function of the view, but nothing could read a view back as text.

## What agents actually read

- **Browsing agents** (in-browser assistants, MCP browser servers, Playwright-style agents) mostly read the accessibility tree or a filtered DOM, and fall back to screenshots. Canvas content and closed widgets are blind spots. Anything that only exists after a pointer event does not exist for them.
- **Crawlers and answer engines** read the HTML as served, plus JSON-LD.
- **WebMCP** is the W3C Web Machine Learning Community Group's draft for pages to hand tools to the browser's agent. The draft of 13 November 2026 puts it on `document.modelContext` (early Chrome previews used `navigator.modelContext`): `registerTool({ name, title, description, inputSchema, annotations: { readOnlyHint }, execute(input, { signal }) }, { signal })`, unregistered by aborting the signal. Edge ships it; Chrome has it in an origin trial.

## What we chose

1. **A light-DOM place list from the first byte.** `posterHtml()` and `<InstantMap>` render `<ul data-im-places>` inside the element: one link per marker in the picture (clustered ones included, 50 by default). The element hides it visually with `::slotted`; it stays in the accessibility tree. The engine adopts this list instead of building its shadow one, so places are never announced twice, and rewrites it as the view changes. In React the list is set with `dangerouslySetInnerHTML`, so React never reconciles the children the engine rewrites.
   *Not JSON-LD in the library:* agents reading the accessibility tree never see `<script type="application/ld+json">`, and what a marker *is* (a product, a home, a store) belongs to the app. Apps add JSON-LD themselves; the list gives every app a floor.
2. **Pure spatial functions.** `viewGroups`, `describeView`, `markersIn`, `nearest`, `placesHtml`. `staticUrl` now draws from `viewGroups`, so the picture, the list and the description cannot disagree.
3. **Three tools, defined once, used two ways.** `mapTools(map)` returns `describe`, `find` and `show` as plain objects with JSON Schema inputs. `registerMapTools` hands them to WebMCP; an app's assistant calls the same `execute` functions through its own tool protocol. Three tools rather than one per method: agents choose better from few, clearly separated tools, and `show` is the only one that changes anything (`readOnlyHint` says so).
4. **`GET /describe` beside `/static`.** Same address, JSON answer: bounds, markers and clusters with pixel positions, a summary, and the image address. It cannot name places (a static address carries short labels, no titles), so it is the text twin of a picture, not a search API.

## Performance

- The tools live in their own chunk (2.7 KB gzipped) fetched only when the element has `agent-tools` *and* the browser has WebMCP. The loader grew by about 380 bytes (8,083 of the 8,192-byte budget), for the feature check and the shared `viewGroups` module.
- The place list adds about 110 bytes of HTML per listed marker; 50 markers is about 5.5 KB before compression.
- `/describe` does no rendering and is cacheable forever, like `/static`.

## Not done, and why

- **Place names in view** (cities, roads) in `/describe`. They are in the vector tiles the renderer already reads, so the renderer could report the labels it placed. Worth doing; it needs a Rust change to `crates/render` and is left for a later release.
- **A declarative WebMCP form.** The draft's declarative tools are for forms; a map is not one.
