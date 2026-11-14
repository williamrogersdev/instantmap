"use client";

import { useRef, useState } from "react";
import { InstantMap, type InstantMapHandle } from "instantmap-js/react";
import type { Marker } from "instantmap-js";
import type { Listing } from "../lib/listings";

export function ListingsMap({ listings, src }: { listings: Marker<Listing>[]; src?: string }) {
  const map = useRef<InstantMapHandle<Listing>>(null);
  const [clicked, setClicked] = useState<Marker<Listing> | null>(null);

  return (
    <>
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
        onMarkerClick={(marker) => setClicked(marker)}
        alt="Map of stays in Austin"
        className="client-map"
        style={{ height: 480, borderRadius: 12 }}
      />
    </>
  );
}
