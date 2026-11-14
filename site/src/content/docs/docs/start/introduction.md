---
title: Introduction
description: What Instant Map is, what it is for, and what it is not.
sidebar:
  order: 1
---

Instant Map is an open-source map for websites and apps that need the map on screen **now**: listings, store finders, delivery areas, property pages, event venues.

Instant Map shows the map first and loads the interactive part when someone reaches for it:

1. **The first frame is one image.** A Worker at the edge renders the view, with your markers already in it, as one cached JPEG. It loads like any other image, before any map code runs.
2. **It wakes up when touched.** That is about 7 KB gzipped before anyone touches the map. On the first hover, touch or focus, it fetches about 11 KB more and takes over with raster tiles that are pixel for pixel the same picture. Pan, zoom, click markers, open cards.
3. **It works everywhere.** `<instant-map>` is a standard web component, so it runs in React, Next.js, Astro, Vue, Svelte, Angular, Rails views and plain HTML. React gets a typed component.

## When to use it

- Pages where the map is part of the first view and speed matters: landing pages, listings, search results, detail pages.
- Many markers with prices or counts that people click into.
- Teams that want the map in their brand colours: give it the colours from your style guide with `brandTheme()`, or override single colour tokens.

## When not to use it

- You need 3D, terrain, globe views, rotation or pitch: use [MapLibre GL](https://maplibre.org).
- You need to draw or edit shapes on the map, or show live vector data that restyles every frame: use MapLibre GL or [OpenLayers](https://openlayers.org).

A vector tier for those cases is on the roadmap. It will use the same element and the same markers.

## Next

- [Quick start](/docs/start/quick-start/)
- [How it works](/docs/start/how-it-works/)
- [Build it with an AI agent](/docs/start/ai-agents/)
