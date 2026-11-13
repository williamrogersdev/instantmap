# Instant Map in Next.js

Next.js 16 App Router. A Server Component renders the map with its first image in the HTML. A Client Component adds `onMarkerClick` and a `fitBounds` button.

```sh
bun install
bun run dev
```

Open http://localhost:3101.

To point the map at another image server, set `INSTANTMAP_SRC`. It defaults to https://instantmap.org.

```sh
INSTANTMAP_SRC=http://127.0.0.1:8790 bun run dev
```

`bun run build` and `bun run start` build and serve production. `bun run typecheck` checks types.
