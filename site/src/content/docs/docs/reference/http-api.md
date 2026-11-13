---
title: HTTP API
description: The /static and /tiles endpoints, every parameter, limits and error codes.
sidebar:
  order: 4
---

The image server is a Cloudflare Worker. It renders map images from vector tiles in the Rust renderer (compiled to WebAssembly) and caches every response at the edge.

- **Hosted:** `https://instantmap.org` works for prototypes and small sites, with no key and no guarantees.
- **Production:** run your own copy, which takes about ten minutes. See [Self-hosting](/docs/guides/self-hosting/).

Every response sends `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=604800, immutable`. A URL always renders the same picture, so caches, CDNs and email clients can keep it.

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
| `format` | no | `jpg` · `png` | | Default `jpg`, a progressive JPEG at quality 86. |

Build these URLs with [`staticUrl()`](/docs/reference/javascript/#staticurl) rather than by hand. `staticUrl()` clusters your markers in the same way the browser does and drops the ones outside the frame, so a URL for 50,000 markers stays short.

## `GET /tiles/{z}/{x}/{y}.jpg`

512 px raster tiles for the interactive map. `{z}` runs 0 to 15. Beyond zoom 15 the map scales the zoom 15 tile.

| Variant | Example |
| --- | --- |
| Standard | `/tiles/12/944/1652.jpg` |
| Retina | `/tiles/12/944/1652@2x.jpg` |
| PNG | `/tiles/12/944/1652.png` |
| Themed | `/tiles/12/944/1652.jpg?theme=midnight&colors=accent:ff5a5f` |

Tiles never contain markers. Labels are placed per tile, so a `/static` image at a whole-number zoom is pixel for pixel the same picture as the tile mosaic. That is why the hand-off from the still image to the interactive map doesn't flicker.

## Errors

| Status | Body | Cause |
| --- | --- | --- |
| `400` | A sentence naming the bad parameter, e.g. `zoom must be a number from 0 to 18` | Invalid input. Fix the request; retrying won't help. |
| `405` | `method not allowed` | Only `GET`, `HEAD` and `OPTIONS` are served. |
| `502` | `render failed` | The upstream vector tiles failed or the render crashed. Safe to retry. |

## Attribution

Map data is © OpenStreetMap contributors (ODbL), with tiles from Protomaps. `<instant-map>` shows the credit for you. When you use `/static` images on their own, show "© OpenStreetMap" near them. Each response also carries an `x-attribution` header with the text.
