---
title: Questions and answers
description: Short answers about what Instant Map is, how much JavaScript it loads, frameworks, branding, cards, self-hosting, limits, accessibility and licence.
sidebar:
  order: 5
---

## What is Instant Map?

Instant Map is an open-source map for websites and apps that shows the map as one finished image first and becomes interactive when someone touches it. The image is rendered at the edge with your markers already in it. The interactive part is a standard web component, `<instant-map>`, with pan, zoom, clusters, keyboard support and a card for each marker. It is MIT licensed.

## How much JavaScript does it load, and when?

About 7 KB gzipped before anyone touches the map, and about 11 KB more on first touch. The small loader defines the element and holds the first image. The engine (tiles, gestures, markers, cards) is fetched on the first sign of intent: pointer enter, touch, focus or wheel. The `load` attribute changes this: `visible` loads it when the map scrolls into view, `eager` loads it straight away, and `none` never loads it.

## How does the first image appear without JavaScript?

The first image is a plain `<img>` whose address describes the whole map, so it appears as soon as the HTML does. In a server-rendered page you build that address with `staticUrl()` from `instantmap-js/server`, or use the React component, which does it for you. The image is drawn by a Worker from vector tiles and cached at the edge. See [How it works](/docs/start/how-it-works/).

## Which frameworks does it work with?

Any framework, because `<instant-map>` is a standard custom element. There are guides for [Next.js](/docs/frameworks/nextjs/), [React](/docs/frameworks/react/), [React Router](/docs/frameworks/react-router/), [Astro](/docs/frameworks/astro/), [Vue](/docs/frameworks/vue/), [Nuxt](/docs/frameworks/nuxt/), [SvelteKit](/docs/frameworks/sveltekit/), [Angular](/docs/frameworks/angular/), [Solid](/docs/frameworks/solid/) and [plain HTML](/docs/frameworks/html/). React 18 and 19 also get a typed component from `instantmap-js/react`.

## Does it work without a server-rendered image?

Yes. If the element has no `<img>` inside, it creates its own first image from its `center`, `zoom`, `theme` and markers and loads the interactive map on first touch. You lose the image being in the first HTML response, so a server-rendered `<img>` paints a little sooner. Pages that cannot run any script can still use `/static` images on their own. See [Static images](/docs/guides/static-images/).

## How do I brand the map?

Give `brandTheme()` the colours from your style guide, then spread the result into `staticUrl()`, `<InstantMap />` or `posterHtml()`. Only `primary` is required. It returns a `theme` and `colors` that colour the land, water, roads, labels, markers and clusters, and it keeps label and marker text readable. In the browser, `brandThemeFromCss()` reads CSS variables such as shadcn's `--primary`. See [Customising the look](/docs/guides/theming/#brand-colours-from-your-style-guide).

## How do I customise the marker cards?

Start with marker fields, then options, then CSS variables, then a template. A marker's `title`, `subtitle`, `label`, `image`, `href` and `badge` fill the built-in card. The `card-layout`, `card-action` and `card-target` attributes change its layout and link. The `--im-card-*` CSS variables change its look. A `<template data-card>` in your HTML replaces its markup, and `map.popup` (or `renderPopup` in React) replaces it with your own code. See [Cards and popups](/docs/guides/popups/).

## Where does the map data come from, and what attribution is required?

The data is OpenStreetMap, delivered as vector tiles in the Protomaps schema. Show "© OpenStreetMap contributors" wherever the map appears. `<instant-map>` shows the credit for you. When you use `/static` images on their own, add it yourself near the image. Each image response also carries an `x-attribution` header with the text. Map data is under the ODbL licence.

## Can I run it myself, and what does it cost?

Yes. The image server is one Cloudflare Worker, and you point it at your own tile source with the `TILE_URL` setting. Rendering needs more CPU time per request than the Workers free plan allows, so it needs the Workers Paid plan, which starts at $5 a month. Cached images cost nothing to serve again. See [Self-hosting](/docs/guides/self-hosting/). The hosted `https://instantmap.org` suits prototypes and small sites, with no key and no guarantees.

## What are the limits?

An image can be at most 1280 px on each side and carry at most 2000 markers and clusters. Static images take a zoom from 0 to 18. Raster tiles are served up to zoom 15, and the live map scales those beyond that, up to zoom 19. `staticUrl()` clusters your markers and drops the ones outside the frame before it builds the address, so a very large list still fits. The full list is in the [HTTP API reference](/docs/reference/http-api/).

## What does Instant Map not do?

It does not do 3D, terrain, rotation or pitch, and it does not draw or edit shapes on the map. It is a raster map with markers, clusters and cards. If you need those features, use a vector map library such as [MapLibre GL](https://maplibre.org). It also does not geocode addresses or plan routes.

## Is it accessible?

It has keyboard and screen-reader support built in. The map has a name and `role="application"`, the arrow keys pan, `+` and `-` zoom, and a hidden list gives each visible marker a button. Focus rings are visible, touch targets are large enough, and animation turns off under `prefers-reduced-motion`. Add a normal list of the same results to the page, and name the map for its job. See [Accessibility](/docs/guides/accessibility/).

## What is the licence?

MIT. You can use it in commercial and closed-source projects. The map data carries its own licence (ODbL), and the Noto Sans type used in map labels is under the SIL Open Font License.
