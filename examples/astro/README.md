# Instant Map in Astro

A static Astro page that renders the map's first image on the server and makes it interactive in the browser.

- `src/pages/index.astro`: `staticUrl()` builds the poster URL at build time; a `<script>` defines the element and assigns 200 markers.
- `src/pages/helper.astro`: the same first image from the `posterHtml()` one-liner.
- `src/lib/listings.ts`: 200 seeded synthetic markers in Austin.

```bash
bun install
bun run dev
bun run build
bun run check
```

Set `PUBLIC_INSTANTMAP_SRC` in `.env` to point at your own image server. It defaults to `https://instantmap.org`.

Guide: https://instantmap.org/docs/frameworks/astro/
