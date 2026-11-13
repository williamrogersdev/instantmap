import { createSignal } from "solid-js";
import type { InstantMapElement } from "instantmap";
import { staticUrl } from "instantmap/server";
import { listings } from "./listings";

const src = import.meta.env.VITE_INSTANTMAP_SRC || "https://instantmap.org";
const center: [number, number] = [-97.74, 30.27];
const zoom = 12;
const markers = listings();
const poster = staticUrl({ src, center, zoom, width: 1200, height: 640, ratio: 2, markers });

export function App() {
  let map: InstantMapElement | undefined;
  const [opened, setOpened] = createSignal("Click a price to open its card.");

  return (
    <main style={{ "max-width": "960px", margin: "0 auto", padding: "24px 16px", "font-family": "system-ui, sans-serif" }}>
      <h1>Austin stays</h1>
      <instant-map
        ref={map}
        attr:src={src}
        attr:center={center.join(",")}
        attr:zoom={zoom}
        prop:markers={markers}
        on:markerclick={(event) => setOpened(`${event.detail.marker.title}, ${event.detail.marker.label}`)}
        style={{ display: "block", position: "relative", height: "520px" }}
      >
        <img
          src={poster}
          alt="Map of Austin"
          width="1200"
          height="640"
          fetchpriority="high"
          style={{ position: "absolute", inset: "0", width: "100%", height: "100%", "object-fit": "cover" }}
        />
      </instant-map>
      <p>{opened()}</p>
      <button type="button" onClick={() => void map?.flyTo({ center: [-97.743, 30.267], zoom: 15 })}>
        Show downtown
      </button>
    </main>
  );
}
