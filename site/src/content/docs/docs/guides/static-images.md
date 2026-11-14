---
title: Static images
description: Map images with no JavaScript at all — for emails, Open Graph cards, PDFs, AMP and RSS.
sidebar:
  order: 6
---

Every map starts as an image, and sometimes the image is all you need.

## In a page, with no script

```html
<img
  src="https://instantmap.org/static?center=-73.9857,40.7484&zoom=14&size=640x360&r=2&markers=-73.9857,40.7484"
  width="640" height="360" alt="Map of the Empire State Building" loading="lazy">
```

Always set `width` and `height` so the page doesn't shift while the image loads. For anything above the fold, set `loading="eager"` and `fetchpriority="high"`.

## Build the URL in code

```ts
import { staticUrl } from "instantmap-js/server";

const src = staticUrl({ center: [-73.9857, 40.7484], zoom: 14, width: 640, height: 360, ratio: 2, markers: [{ lng: -73.9857, lat: 40.7484 }] });
```

`staticUrl()` is a pure function with no dependencies. It runs in Node, Bun, Deno, Workers and the browser.

For other languages, build the query string yourself; the format is in the [HTTP API](/docs/reference/http-api/). Ruby, for example:

```ruby
params = { center: "#{lng},#{lat}", zoom: 13, size: "640x360", r: 2, markers: "#{lng},#{lat},$#{price}" }
url = "https://instantmap.org/static?#{URI.encode_www_form(params)}"
```

## Lighter images on slow connections

A 2× image is about three times the bytes of a 1× image. The element chooses for itself (see the [`detail` attribute](/docs/reference/element/)). When your server builds the address, it can do the same: browsers that support it send a `Save-Data: on` request header when the visitor has asked to save data.

```ts
const saveData = request.headers.get("save-data") === "on";
const src = staticUrl({ center, zoom, width: 640, height: 360, ratio: saveData ? 1 : 2 });
```

If you cache the page, add `Vary: Save-Data` to its response so the two versions are kept apart.

## Email

Email clients block scripts and many block CSS, but they all show images. Use `r=2`, keep the width at 600 or less, and link the image to the full page:

```html
<a href="https://example.com/orders/123/track">
  <img src="https://instantmap.org/static?center=-87.6298,41.8781&zoom=13&size=600x300&r=2&markers=-87.6298,41.8781" width="600" height="300" alt="Delivery area" style="display:block;border:0;border-radius:12px">
</a>
```

Gmail and Outlook proxy and cache the image, which is fine: the URL always renders the same picture.

## Open Graph and social cards

Use 1200×630 for link previews. Requests are capped at 1280 px per side, so use `r=1`:

```html
<meta property="og:image" content="https://instantmap.org/static?center=-122.4194,37.7749&zoom=12&size=1200x630&theme=midnight">
```

## PNG

Add `format=png` for print, transparency workflows or pixel-exact tests. JPEG is three to five times smaller for the same map.
