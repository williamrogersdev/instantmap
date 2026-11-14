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

The Worker caches upstream tiles for 7 days, so your tile source sees roughly one request per tile per data centre per week. With the `TILE_CACHE` bucket below, each vector tile is also kept in R2 the first time it is fetched, and the tile source is asked for it once in total. A request to the tile source times out after 8 seconds and is retried once.

Each picture is drawn from nine vector tiles, and neighbouring pictures share most of them. The Worker keeps the vector tiles it has fetched in memory, so a screen of nine pictures fetches 25 vector tiles, not 81.

## How pictures are cached

The Worker is set up for Cloudflare's own cache, with three layers. Workers Cache and the per-data-centre cache need no provisioning; create the R2 bucket as described below.

| Layer | What it does |
| --- | --- |
| [Workers Cache](https://developers.cloudflare.com/workers/cache/) (`"cache": { "enabled": true }` in `worker/wrangler.jsonc`) | Sits in front of the Worker. A repeated address is answered without running the Worker, so it costs no CPU time. It is tiered, so a picture drawn for one visitor is shared with other Cloudflare locations, and simultaneous requests for the same picture are drawn once. Each deployment starts a new cache. |
| The Worker's own cache | Keyed by what the address means, not how it is written. The same picture asked for with its parameters in another order, or after a new deployment, is not drawn again in that data centre. |
| R2 (optional, below) | Shares rendered tiles across locations until the bucket lifecycle rule expires them. |

With Workers Cache on, Cloudflare bills requests for the site's static files as Worker requests; without it they are free. If you serve only pictures from the Worker, this makes no difference. To turn it off, remove the `cache` line.

## Optional: keep tiles in R2

The checked-in Worker configuration binds `TILE_CACHE` to an R2 bucket named `instantmap-tiles`. Create that bucket in your own account before deploying, or remove the `r2_buckets` block to use only the Cloudflare cache layers. With R2 enabled, an edge-cache miss checks the bucket before drawing a tile.

The bucket also keeps the vector tiles the pictures are drawn from, under `mvt/`. A place nobody has looked at in a new style, or after a new renderer version, is then drawn from R2 with no request to the tile source. A stored vector tile is used for as long as it is in the bucket. After 30 days the Worker fetches a fresh copy in the background the next time the tile is used (after one day for a tile the source did not have). To pick up new map data at once, delete the `mvt/` objects.

```bash
cd worker && bunx wrangler r2 bucket create instantmap-tiles
```

The binding in `worker/wrangler.jsonc` is:

```jsonc
"r2_buckets": [{ "binding": "TILE_CACHE", "bucket_name": "instantmap-tiles" }]
```

Give the bucket a lifecycle rule, for example delete objects after 90 days, so it cannot grow without bound. Tiles and vector tiles are stored. Static images are not.

## Limit on uncached renders

A request that has to be drawn costs CPU time. The `ratelimits` block in `worker/wrangler.jsonc` adds a [rate limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) named `RENDER_LIMIT`: one address may ask for 600 uncached pictures per 60 seconds at each Cloudflare location. Pictures that are already cached are never limited. A request over the limit gets `429` with `Retry-After: 10`. Change the numbers to suit your traffic, or remove the block to have no limit.

## Logs

Each picture that is drawn writes one JSON line to [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/): the tile or image size, the milliseconds spent fetching vector tiles (`upstreamMs`), the size in bytes and the Cloudflare location (`colo`). Cloudflare records the CPU time of each request alongside it. Cached pictures write nothing, because the Worker does not run for them.

## Check it

```bash
curl -sI "https://maps.example.com/static?center=0,51.5&zoom=10&size=400x300" | grep -iE "^(HTTP|content-type|cache-control)"
```

You should see `200`, `image/jpeg` and `public, max-age=604800, immutable`. Ask again and the response carries `cf-cache-status: HIT`.

The Worker also answers `GET /health` with `{ "ok": true, "renderer": "…" }`, which suits an uptime check.
