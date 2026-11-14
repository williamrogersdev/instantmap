# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

## [0.1.0]

Initial version.
