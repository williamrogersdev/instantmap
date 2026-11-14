# Contributing

## Layout

| Path | What it is |
| --- | --- |
| `crates/render` | The renderer library (Rust) |
| `crates/wasm` | wasm-bindgen bindings for the renderer |
| `packages/instantmap` | The `instantmap` npm package |
| `worker/` | The Cloudflare Worker that renders tiles and serves the site. Not in the Bun workspace |
| `site/` | instantmap.org pages and docs (Astro) |
| `scripts/` | Build, size, fixture and end-to-end scripts |

## Prerequisites

- Rust 1.95.0 (`rust-toolchain.toml` installs it, with rustfmt, clippy and the `wasm32-unknown-unknown` target)
- wasm-bindgen-cli 0.2.129, exactly: `cargo install wasm-bindgen-cli --version 0.2.129`
- Bun 1.4.4
- For `bun run e2e`: Playwright's Chromium (`bunx playwright install chromium`)

## Commands

```sh
bun install && (cd worker && bun install)   # install
bun run build                               # wasm, package, site
bun run test                                # Rust, package and Worker tests
bun run lint                                # oxlint, rustfmt, clippy
bun run typecheck
bun run size                                # size budget, after the package is built
bun run e2e                                 # fixture tiles + local Worker + browser
bun run check                               # lint, typecheck, test, build, size
```

Run locally: `bun run dev` builds the package and starts the Worker with `wrangler dev`.
For an offline run, start `bun run scripts/fixture-tiles.ts 8799` and pass
`--var 'TILE_URL:http://localhost:8799/{z}/{x}/{y}.mvt'` to wrangler.

## Where things are

- Rendering code is in `crates/render/src` (`style.rs` for themes, `render.rs` for drawing, `glyphs.rs` for text).
- To add a theme colour, add the key to `PALETTE_KEYS` in `packages/instantmap/src/themes.ts`, give every theme a value, then add the matching field, the `SLOTS` count and the `from_words` order to `Palette` in `crates/render/src/style.rs`.

## Rules

- Size budget: the script-tag build must stay under 8192 bytes gzipped up front and 13312 for the engine. `scripts/check-size.ts` enforces it. Raise a budget only on purpose, and say why in the change.
- Any change to drawing must bump `RENDERER_VERSION` in `worker/src/index.ts`, so cached tiles are redrawn.
- Docs and site copy never criticise or compare against other map libraries.
