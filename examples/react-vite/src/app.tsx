import { useMemo, useRef, useState } from "react";
import { InstantMap, type InstantMapHandle } from "instantmap/react";
import type { Marker } from "instantmap";
import { makeListings, type Listing } from "./listings";

const src = import.meta.env.VITE_INSTANTMAP_SRC as string | undefined;

export function App() {
  const listings = useMemo(() => makeListings(200), []);
  const map = useRef<InstantMapHandle<Listing>>(null);
  const [selected, setSelected] = useState<Marker<Listing> | null>(null);

  return (
    <div className="results">
      <ol className="list">
        {listings.slice(0, 40).map((listing) => (
          <li
            key={listing.id}
            aria-current={selected?.id === listing.id}
            onPointerEnter={() => map.current?.highlight(listing.id)}
            onPointerLeave={() => map.current?.highlight(null)}
          >
            <strong>{listing.title}</strong>
            {listing.subtitle}
          </li>
        ))}
      </ol>
      <InstantMap
        ref={map}
        {...(src ? { src } : {})}
        className="map"
        center={[-97.7431, 30.2672]}
        zoom={11.5}
        markers={listings}
        onSelect={setSelected}
        renderPopup={(marker) => (
          <div className="card">
            <h3>{marker.title}</h3>
            <p>{marker.subtitle}</p>
            <a href={marker.href}>View stay</a>
          </div>
        )}
      />
    </div>
  );
}
