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
| `<instant-map>` | Browser | About 13 KB gzipped |
| Vector tiles | Any [Protomaps](https://protomaps.com)-schema source: PMTiles on R2, the Protomaps API, or your own | Fetched by the Worker, never by the browser |

## 1. The still

The server (or your framework, through `staticUrl()`) writes an `<img>` inside `<instant-map>`. Its URL describes the whole picture: centre, zoom, size, theme and markers.

The Worker renders that view from vector tiles:
- It draws roads, water and labels with [tiny-skia](https://github.com/linebender/tiny-skia).
- It sets type from Noto Sans glyphs.
- It draws the markers in.
- It encodes a progressive JPEG.

The image is then cached at the edge. Most visitors get a cache hit served from a data centre near them.

Until someone touches the map, that image is all there is. There's no script on the critical path, nothing that shifts layout, and no GPU work.

## 2. The hand-off

On the first hover, touch, focus or wheel (the default `load="intent"`), the element:

1. Reads the camera from the image URL, so the first live frame matches the image exactly, even when CSS scales the image.
2. Starts fetching the 512 px tiles for the view. Until they arrive, any drag or zoom moves the image itself, so the map responds to input straight away.
3. Clusters the markers with the same algorithm the server used, and draws them on a canvas in the same font, at the same positions.
4. Cross-fades from the image to the tiles once every tile in view has loaded. Tiles are rendered with the same per-tile label placement as the image, so nothing moves.
5. Ripples the markers outward from where you touched, and brings in the zoom controls. That signals the map is live.

## 3. Why markers don't jump

Most maps cluster markers in screen space, so the groups change as you pan. Instant Map clusters in **world space at each whole zoom level**, like `supercluster`. The server and the browser run the same function, [`clusterAt`](/docs/reference/javascript/#clusteratmarkers-zoom-distance), on the same input. They get the same groups whatever the viewport. `staticUrl()` sends the server the finished groups, not your raw markers, so the URL stays short with 50,000 markers.

## 4. Caching

Every image and tile URL is deterministic, so it gets `Cache-Control: immutable`. A map that a thousand visitors open in the same place costs one render. The Worker also caches the upstream vector tiles it reads.
