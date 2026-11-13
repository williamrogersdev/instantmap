# Instant Map in Vue

A Vue 3 + Vite app with `<instant-map>`.

- `vite.config.ts`: `isCustomElement` tells Vue that `instant-map` is not a Vue component.
- `src/App.vue`: binds 200 markers with `:markers.prop`, listens for `@markerclick`, and calls `fitBounds` through a template ref.
- `src/listings.ts`: 200 seeded synthetic markers in Austin.

```bash
bun install
bun run dev
bun run build
bun run typecheck
```

Set `VITE_INSTANTMAP_SRC` in `.env.local` to point at your own image server. It defaults to `https://instantmap.org`.

Guide: https://instantmap.org/docs/frameworks/vue/
