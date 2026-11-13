# Instant Map with Solid

SolidJS and Vite with a typed `<instant-map>` element.

```sh
bun install
VITE_INSTANTMAP_SRC=https://instantmap.org bun run build
bun run preview
```

Open http://localhost:3303.

`src/instantmap.d.ts` types the element for JSX. `prop:markers` sets the property and `on:markerclick` listens for the DOM event. `attr:src`, `attr:center` and `attr:zoom` set attributes, because the element reads those as attributes.

`defineInstantMap()` runs before `render()`. A bare `import "instantmap"` is tree-shaken out by Vite, so the element is never defined.

The poster `<img>` renders on the client in this example. Use SolidStart if you need it in the server HTML.

Guide: https://instantmap.org/docs/frameworks/solid
