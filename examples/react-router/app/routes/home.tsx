import { useRef, useState } from "react";
import { InstantMap, type InstantMapHandle } from "instantmap/react";
import type { Marker } from "instantmap";
import { makeListings, type Listing } from "../listings";
import type { Route } from "./+types/home";

export function loader() {
  return { listings: makeListings(200), src: process.env.INSTANTMAP_SRC };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { listings, src } = loaderData;
  const map = useRef<InstantMapHandle<Listing>>(null);
  const [clicked, setClicked] = useState<Marker<Listing> | null>(null);

  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, margin: "0 0 12px" }}>Stays in Austin</h1>
      <p>
        <button onClick={() => map.current?.fitBounds(listings, { padding: 48 })}>Show all {listings.length} stays</button>{" "}
        <span>{clicked ? `Opened ${clicked.title}` : "Click a pin"}</span>
      </p>
      <InstantMap
        ref={map}
        {...(src ? { src } : {})}
        center={[-97.7431, 30.2672]}
        zoom={11.5}
        markers={listings}
        onMarkerClick={setClicked}
        alt="Map of stays in Austin"
        style={{ height: 560, borderRadius: 12 }}
      />
    </main>
  );
}
