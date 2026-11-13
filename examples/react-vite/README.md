# Instant Map in React and Vite

A list and a map. Hovering a row highlights its marker. Clicking a marker opens a custom React popup card.

```sh
bun install
bun run dev
```

Open http://localhost:3102.

To point the map at another image server, set `VITE_INSTANTMAP_SRC`. It defaults to https://instantmap.org.

```sh
VITE_INSTANTMAP_SRC=http://127.0.0.1:8790 bun run dev
```

`bun run build` builds production. `bun run typecheck` checks types.
