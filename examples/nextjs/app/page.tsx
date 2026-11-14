import { InstantMap } from "instantmap-js/react";
import { makeListings } from "../lib/listings";
import { ListingsMap } from "./listings-map";

const src = process.env.INSTANTMAP_SRC;

export default function Page() {
  const listings = makeListings(200);
  return (
    <main style={{ padding: 16, display: "grid", gap: 24 }}>
      <section>
        <h1 style={{ fontSize: 20, margin: "0 0 12px" }}>Stays in Austin</h1>
        <InstantMap
          {...(src ? { src } : {})}
          className="server-map"
          center={[-97.7431, 30.2672]}
          zoom={11.5}
          markers={listings}
          alt="Map of stays in Austin"
          style={{ height: 480, borderRadius: 12 }}
        />
      </section>
      <section>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>With events and a ref</h2>
        <ListingsMap listings={listings} src={src} />
      </section>
    </main>
  );
}
