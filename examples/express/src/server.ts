import express from "express";
import { posterHtml } from "instantmap-js/server";
import { listings } from "./listings";

const src = process.env.INSTANTMAP_SRC || "https://instantmap.org";
const center: [number, number] = [-97.74, 30.27];
const zoom = 12;
const markers = listings();

const app = express();

app.get("/", (_request, response) => {
  const map = posterHtml({ src, center, zoom, width: 1200, height: 640, markers, alt: "Map of Austin", className: "map" });
  const data = JSON.stringify(markers).replace(/</g, "\\u003c");
  response.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Austin stays</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
  .map { height: 520px; }
</style>
</head>
<body>
<main>
  <h1>Austin stays</h1>
  ${map}
  <p id="opened">Click a price to open its card.</p>
</main>
<script type="module" src="${src}/instant-map.js"></script>
<script type="module">
  const map = document.querySelector("instant-map");
  await customElements.whenDefined("instant-map");
  map.markers = ${data};
  map.addEventListener("markerclick", (event) => {
    const marker = event.detail.marker;
    document.getElementById("opened").textContent = marker.title + ", " + marker.label;
  });
</script>
</body>
</html>`);
});

const port = Number(process.env.PORT) || 3304;
app.listen(port);
