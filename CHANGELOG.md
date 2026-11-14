# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Smaller loader: about 7 KB gzipped up front, and the engine, about 11 KB, loads on first intent.
- Sprite-based marker drawing.
- Tile retry.
- `detail` attribute (`auto`, `high`, `low`): on a slow connection or with data saving on, pictures are requested at 1× instead of 2×.
- Benchmarks (`bun run bench`), a comparison tool and one-command profiling (`bun run profile`), with results published at `/benchmarks/`.
- Worker: fetched vector tiles are shared between neighbouring pictures and kept in the R2 bucket, so a screen of nine uncached tiles makes 25 requests to the tile source instead of 81, and none once the area has been seen.
- Benchmarks: a whole-screen case that counts requests to the tile source, and `--source-delay`.
- Worker: Cloudflare Workers Cache in front of the Worker, a rate limit on uncached renders, and one log line per render with fetch and draw times.
- Redesigned built-in card with layouts, CSS custom properties, `<template data-card>` and image warming.
- `brandTheme()` and `brandThemeFromCss()`.
- New entry points `instantmap-js/card` and `instantmap-js/brand`.
- Worker: canonical cache keys, upstream timeout and retry, lighter 2x JPEGs, an optional R2 tile store, an optional rate limit and `/health`.

### Changed

- 2× JPEGs use quality 60 instead of 72, about 16% smaller.
- No tile requests for zoom levels an animation only passes through.

### Removed

- `map.palette`. Use `resolvePalette`.
- `defaultPopup`. Use `defaultCard` from `instantmap-js/card`.

### Fixed

- `whenIdle()` no longer waits forever when the map is already idle with one more frame to draw.

## [0.1.0]

Initial version.
