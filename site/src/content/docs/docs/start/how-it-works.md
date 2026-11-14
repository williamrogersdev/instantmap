---
title: How it works
description: The still image, the hand-off, and why the two never disagree.
sidebar:
  order: 4
---

## The pieces

| Piece | Where it runs | Size |
| --- | --- | --- |
| Rust renderer | Cloudflare Worker, compiled to WebAssembly | About 500 KB, never sent to the browser |
| `/static` and `/tiles` | Same Worker, behind Cloudflare's cache | One request per image |
| `<instant-map>` loader | Browser | About 7 KB gzipped before anyone touches the map |
| Engine (tiles, gestures, markers, cards) | Browser | About 11 KB more, fetched on first touch |
| Vector tiles | Any [Protomaps](https://protomaps.com)-schema source: PMTiles on R2, the Protomaps API, or your own | Fetched by the Worker, never by the browser |

## 1. The still

The server (or your framework, through `staticUrl()`) writes an `<img>` inside `<instant-map>`. Its URL describes the whole picture: centre, zoom, size, theme and markers.

The Worker renders that view from vector tiles:
- It draws roads, water and labels with [tiny-skia](https://github.com/linebender/tiny-skia).
- It sets type from Noto Sans glyphs.
- It draws the markers in.
- It encodes a progressive JPEG.

The image is then cached at the edge. Most visitors get a cache hit served from a data centre near them.

Until someone touches the map, that image is all there is. The only script is the loader, about 7 KB gzipped. The image does not wait for it, nothing shifts layout, and there is no GPU work.

## 2. The hand-off

On the first hover, touch, focus or wheel (the default `load="intent"`), the element fetches its engine, about 11 KB gzipped. A press or tap that lands while the engine is loading is replayed, so the first gesture is not lost. Then the element:

1. Reads the camera from the image URL, so the first live frame matches the image exactly, even when CSS scales the image.
2. Starts fetching the 512 px tiles for the view. Until they arrive, any drag or zoom moves the image itself, so the map responds to input straight away.
3. Clusters the markers with the same algorithm the server used, and draws them on a canvas in the same font, at the same positions.
4. Cross-fades from the image to the tiles once every tile in view has loaded. Tiles are rendered with the same per-tile label placement as the image, so nothing moves.
5. Ripples the markers outward from where you touched, and brings in the zoom controls. That signals the map is live.

## 3. Why markers don't jump

Instant Map clusters in **world space at each whole zoom level**, so the groups do not change as you pan. The server and the browser run the same function, [`clusterAt`](/docs/reference/javascript/#clusteratmarkers-zoom-distance), on the same input. They get the same groups whatever the viewport. `staticUrl()` sends the server the finished groups, not your raw markers, so the URL stays short with 50,000 markers.

## 4. Caching

Every image and tile URL is deterministic, so it gets `Cache-Control: immutable`. A map that a thousand visitors open in the same place costs one render. The cache entry is keyed on the request as the server parsed it, so unknown query parameters and parameter order do not cause new renders. The Worker also caches the upstream vector tiles it reads, and can keep rendered tiles in an R2 bucket so each is drawn once worldwide.

## 5. Keeping it light

A few choices keep the live map quick on a phone:

- Markers are drawn once into small sprites and stamped onto the canvas each frame.
- Zoom animations do not request tiles for zoom levels they only pass through. The tiles already on screen stretch to cover the gap.
- A tile that fails to load is retried once.
- Card images for the markers nearest the centre are fetched in idle time, so a card opens with its photo ready. See [Cards and popups](/docs/guides/popups/#fast-card-images).
