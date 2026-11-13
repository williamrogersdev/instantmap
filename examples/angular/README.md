# Instant Map with Angular

Standalone components, server rendering, and a typed `<instant-map>` element.

```sh
bun install
bun run build
bun run start
```

Open http://localhost:3302.

The server renders the poster `<img>` with `staticUrl()`, so the first map image is in the HTML. The element is defined before Angular bootstraps, so `[markers]` binds to the live setter.

Set `INSTANTMAP_SRC` to point the poster and the element at another image server. The default is `https://instantmap.org`.

Guide: https://instantmap.org/docs/frameworks/angular
