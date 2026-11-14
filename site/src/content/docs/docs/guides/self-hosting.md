---
title: Self-hosting
description: Run your own image server on Cloudflare Workers with your own tile source, before you launch.
sidebar:
  order: 9
---

`https://instantmap.org` is a shared demo server. Run your own before launch:
- you control its uptime,
- your map traffic isn't shared with anyone else's,
- you can point it at your own tiles.

It is one Cloudflare Worker, and it takes about ten minutes to set up.

## What you need

| | |
| --- | --- |
| Cloudflare account | **Workers Paid** plan ($5/month). Rendering a tile takes 20–200 ms of CPU, more than the free plan allows per request. Cached images cost nothing to serve again. |
| Vector tiles | Any source in the [Protomaps basemap schema](https://docs.protomaps.com/basemaps/layers), served as `{z}/{x}/{y}` MVT. See [Tile sources](#tile-sources). |
| Toolchain | [Rust](https://rustup.rs) with the `wasm32-unknown-unknown` target, `wasm-bindgen-cli` 0.2.129, and [Bun](https://bun.sh). |

## Deploy

```bash
git clone https://github.com/williamrogersdev/instantmap
cd instantmap
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129
bun install
bun run build
```

In `worker/wrangler.jsonc`, make these changes:

1. Set `TILE_URL` to your tile source.
2. Remove `account_id` and `routes`; they belong to instantmap.org.
3. Add your own domain, if you want one.

```jsonc
{
  "name": "maps",
  "vars": { "TILE_URL": "https://tiles.example.com/{z}/{x}/{y}.mvt" },
  "routes": [{ "pattern": "maps.example.com", "custom_domain": true }]
}
```

Then deploy:

```bash
cd worker && bunx wrangler deploy
```

Point your maps at the new server:

```html
<instant-map src="https://maps.example.com" …></instant-map>
```

```ts
staticUrl({ src: "https://maps.example.com", … });
```

Your server also serves `/instant-map.js` and the font, so you can load the client from it as well.

## Tile sources

| Source | `TILE_URL` | Notes |
| --- | --- | --- |
| Protomaps API | `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=YOUR_KEY` | Fastest start. Needs a free key from [protomaps.com](https://protomaps.com). |
| Your own PMTiles on R2 | The URL of a [PMTiles Worker](https://docs.protomaps.com/deploy/cloudflare) in front of your bucket | Download a planet or regional `.pmtiles` build, upload it to R2, and deploy Protomaps' serverless Worker. You own every part of the stack. |
| Any z/x/y server | Your URL with `{z}`, `{x}`, `{y}` | Must use the Protomaps schema (layers `earth`, `water`, `landuse`, `roads`, `boundaries`, `places`, `buildings`). |

The Worker caches upstream tiles for 7 days, so your tile source sees roughly one request per tile per data centre per week (once per tile in total with the `TILE_CACHE` bucket below). A request to the tile source times out after 8 seconds and is retried once.

## Optional: keep tiles in R2

The checked-in Worker configuration binds `TILE_CACHE` to an R2 bucket named `instantmap-tiles`. Create that bucket in your own account before deploying, or remove the `r2_buckets` block to use only the per-data-centre edge cache. With R2 enabled, an edge-cache miss checks the bucket before drawing a tile.

```bash
cd worker && bunx wrangler r2 bucket create instantmap-tiles
```

The binding in `worker/wrangler.jsonc` is:

```jsonc
"r2_buckets": [{ "binding": "TILE_CACHE", "bucket_name": "instantmap-tiles" }]
```

Give the bucket a lifecycle rule, for example delete objects after 90 days, so it cannot grow without bound. Only tiles are stored. Static images are not.

## Optional: limit uncached renders

A request that has to be drawn costs CPU time. To cap how many uncached pictures one address can ask for, add a rate limit binding named `RENDER_LIMIT` (the `ratelimits` block in `worker/wrangler.jsonc`, 600 per 60 seconds in the example). Pictures that are already cached are never limited. A request over the limit gets `429` with `Retry-After: 10`. Without the binding there is no limit and the Worker never returns `429`.

## Check it

```bash
curl -sI "https://maps.example.com/static?center=0,51.5&zoom=10&size=400x300" | grep -iE "^(HTTP|content-type|cache-control)"
```

You should see `200`, `image/jpeg` and `public, max-age=604800, immutable`. Ask again and the response carries `x-instantmap-cache: hit`.

The Worker also answers `GET /health` with `{ "ok": true, "renderer": "…" }`, which suits an uptime check.
