# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.1]

### Added

- `detail` attribute (`auto`, `high`, `low`): on a slow connection or with data saving on, pictures are requested at 1× instead of 2×.
- Benchmarks (`bun run bench`), a comparison tool and one-command profiling (`bun run profile`), with results published at `/benchmarks/`.
- Worker: optional `MAP_DATA` bucket and `MAP_ARCHIVE` name. Map data is read straight from a PMTiles archive in R2, with no request to a tile server.
- Worker: fetched vector tiles are shared between neighbouring pictures and kept in the R2 bucket, so a screen of nine uncached tiles makes 25 requests to the tile source instead of 81, and none once the area has been seen.
- Benchmarks: a whole-screen case that counts requests to the tile source, and `--source-delay`.
- Worker: Cloudflare Workers Cache in front of the Worker, a rate limit on uncached renders, and one log line per render with fetch and draw times.
- `fitView(boundsOrMarkers, { width, height }, options)`: the camera `fitBounds` would move to, without a map, for building a fitted poster. `fitBounds` and `fitView` take `minZoom` and `wholeZoom`.
- `posterSources(options, detail)`: a poster's `src` and `srcset`.
- `detail` prop on `<InstantMap>` and option on `posterHtml`.

### Changed

- 2× JPEGs use quality 60 instead of 72, about 16% smaller.
- `<InstantMap>` and `posterHtml` posters offer 1× and 2× in a `srcset` and the browser picks by screen density, instead of always asking for 2×. `detail` `"low"` or `"high"` asks for one density.

### Fixed

- `whenIdle()` no longer waits forever when the map is already idle with one more frame to draw.

## [0.1.0]

### Added

- Smaller loader: about 7 KB gzipped up front, and the engine, about 11 KB, loads on first intent.
- Sprite-based marker drawing.
- Tile retry.
- Redesigned built-in card with layouts, CSS custom properties, `<template data-card>` and image warming.
- `brandTheme()` and `brandThemeFromCss()`.
- New entry points `instantmap-js/card` and `instantmap-js/brand`.
- Worker: canonical cache keys, upstream timeout and retry, lighter 2x JPEGs, an optional R2 tile store, an optional rate limit and `/health`.

### Changed

- No tile requests for zoom levels an animation only passes through.

### Removed

- `map.palette`. Use `resolvePalette`.
- `defaultPopup`. Use `defaultCard` from `instantmap-js/card`.

Initial version.
