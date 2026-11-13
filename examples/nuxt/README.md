# Instant Map in Nuxt

A Nuxt 4 app that renders the first map image on the server, then upgrades to the interactive map in the browser.

- `nuxt.config.ts`: `vue.compilerOptions.isCustomElement` tells Vue that `instant-map` is not a Vue component, and `runtimeConfig.public.instantmapSrc` holds the image server.
- `app/app.vue`: builds the poster URL with `staticUrl` from `instantmap/server`, so view-source contains the `<img>`. It binds markers with `:markers.prop` and listens for `@markerclick`.
- `app/plugins/instantmap.client.ts`: registers the element in the browser only.
- `app/listings.ts`: 200 seeded synthetic markers in Austin.

```bash
bun install
bun run build
bun run preview
bun run typecheck
```

Set `NUXT_PUBLIC_INSTANTMAP_SRC` to point at your own image server. It defaults to `https://instantmap.org`.

Guide: https://instantmap.org/docs/frameworks/nuxt/
