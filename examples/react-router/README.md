# Instant Map in React Router

React Router v7 framework mode. The loader returns the markers and the server renders the first image in the HTML.

```sh
bun install
bun run dev
```

Open http://localhost:3103.

To point the map at another image server, set `INSTANTMAP_SRC`. It defaults to https://instantmap.org.

```sh
INSTANTMAP_SRC=http://127.0.0.1:8790 bun run dev
```

`bun run build` then `bun run start` serves production on `PORT`. `bun run typecheck` checks types.
