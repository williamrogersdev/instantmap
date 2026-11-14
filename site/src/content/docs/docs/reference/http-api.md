---
title: HTTP API
description: The /static and /tiles endpoints, every parameter, limits and error codes.
sidebar:
  order: 4
---

The image server is a Cloudflare Worker. It renders map images from vector tiles in the Rust renderer (compiled to WebAssembly) and caches every response at the edge.

- **Hosted:** `https://instantmap.org` works for prototypes and small sites, with no key and no guarantees.
- **Production:** run your own copy, which takes about ten minutes. See [Self-hosting](/docs/guides/self-hosting/).

Every image response sends `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=604800, immutable`. A URL always renders the same picture, so caches, CDNs and email clients can keep it.

## Response headers

| Header | Value |
| --- | --- |
| `cf-cache-status` | `HIT` when Cloudflare's cache answered without running the Worker. The other headers in this table are then the ones stored with the picture when it was first served. |
| `x-instantmap-cache` | How the Worker produced the picture: `miss` when it was just drawn, `hit` when it came from the Worker's own cache, `store` when it came from the optional `TILE_CACHE` R2 bucket. |
| `server-timing` | `upstream;dur=…`: the milliseconds spent fetching vector tiles when the picture was drawn. |
| `timing-allow-origin` | `*`, so pages on other origins can read the timing. |
| `x-attribution` | The attribution text. |

## Caching

A picture is cached under the request as the server understood it, not as it was written. Unknown query parameters, the order of parameters and different spellings of the same value (`zoom=12` and `zoom=12.0`) all share one cached picture, so adding a cache-busting parameter does not draw it again.

## `GET /health`

Returns `{ "ok": true, "renderer": "…" }` with `Cache-Control: no-store`. The `renderer` value changes when the renderer or the themes change. Use it for uptime checks.

## `GET /static`

One finished map image, with markers drawn in. Use it as the first frame of `<instant-map>`, in emails, in Open Graph images, or anywhere JavaScript can't run.

```
https://instantmap.org/static?center=-97.74,30.27&zoom=12&size=1200x630&r=2&markers=-97.75,30.27,$420;-97.73,30.28,$385
```

| Parameter | Required | Format | Limits | Notes |
| --- | --- | --- | --- | --- |
| `center` | yes | `lng,lat` | lng −180…180, lat −85.06…85.06 | |
| `zoom` | yes | number | 0…18 | Fractions allowed. |
| `size` | no | `WIDTHxHEIGHT` | 16…1280 each | Default `640x400`. CSS pixels. |
| `r` | no | `1` or `2` | | Pixel ratio. `2` doubles the output for retina screens. |
| `theme` | no | `daylight` · `midnight` · `paper` · `mono` | | Default `daylight`. |
| `colors` | no | `token:hex,token:hex` | 36 tokens | Overrides on top of `theme`. See [Themes](/docs/reference/themes/). |
| `markers` | no | `lng,lat[,label];…` | 2,000 entries with `clusters` | Labels over 10 characters are cut. A label may contain commas (`$6,850`); everything after the second comma is the label. Use `;` only between entries. |
| `clusters` | no | `lng,lat,count;…` | | Pre-clustered bubbles. `staticUrl()` writes these for you. |
| `cluster` | no | pixels | 0…120 | Merge distance for `markers`. Default `44`. `0` turns clustering off. |
| `v` | no | text | any | Style version. `staticUrl()` adds it so that browsers fetch a new image when the default look of a release changes. The server ignores it. |
| `format` | no | `jpg` · `png` | | Default `jpg`. JPEGs are progressive, at quality 86, or 72 when `r=2`. |

Build these URLs with [`staticUrl()`](/docs/reference/javascript/#staticurl) rather than by hand. `staticUrl()` clusters your markers in the same way the browser does and drops the ones outside the frame, so a URL for 50,000 markers stays short.

## `GET /tiles/{z}/{x}/{y}.jpg`

512 px raster tiles for the interactive map. `{z}` runs 0 to 15. Beyond zoom 15 the map scales the zoom 15 tile.

| Variant | Example |
| --- | --- |
| Standard | `/tiles/12/944/1652.jpg` |
| Retina | `/tiles/12/944/1652@2x.jpg` (JPEG quality 72; 1x is 86) |
| PNG | `/tiles/12/944/1652.png` |
| Themed | `/tiles/12/944/1652.jpg?theme=midnight&colors=accent:ff5a5f` |

Tiles never contain markers. Labels are placed per tile, so a `/static` image at a whole-number zoom is pixel for pixel the same picture as the tile mosaic. That is why the hand-off from the still image to the interactive map doesn't flicker.

## Errors

| Status | Body | Cause |
| --- | --- | --- |
| `400` | A sentence naming the bad parameter, e.g. `zoom must be a number from 0 to 18` | Invalid input. Fix the request; retrying won't help. |
| `405` | `method not allowed` | Only `GET`, `HEAD` and `OPTIONS` are served. |
| `429` | `too many uncached map requests, try again shortly` | Only on a server that has a render rate limit configured. Sent with `Retry-After`. Cached pictures are never limited. |
| `502` | `render failed` | The upstream vector tiles failed or the render crashed. Safe to retry. |

Upstream tile requests time out after 8 seconds and are tried once more before a request fails with `502`. Errors are never cached.

## Attribution

Map data is © OpenStreetMap contributors (ODbL), with tiles from Protomaps. `<instant-map>` shows the credit for you. When you use `/static` images on their own, show "© OpenStreetMap" near them. Each response also carries an `x-attribution` header with the text.
