import type { Marker } from "instantmap";

export interface Listing {
  price: number;
  beds: number;
}

const AUSTIN = { west: -97.8, east: -97.68, south: 30.22, north: 30.33 };
const RIVER: [number, number][] = [
  [-97.8, 30.282],
  [-97.785, 30.279],
  [-97.765, 30.27],
  [-97.745, 30.262],
  [-97.715, 30.25],
  [-97.68, 30.24],
];
const STREETS = ["Congress Ave", "Lamar Blvd", "South 1st St", "Guadalupe St", "Manor Rd", "Barton Springs Rd", "Burnet Rd", "East 6th St"];

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nearRiver(lng: number, lat: number) {
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, ay] = RIVER[i]!;
    const [bx, by] = RIVER[i + 1]!;
    const t = Math.max(0, Math.min(1, ((lng - ax) * (bx - ax) + (lat - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    if (Math.hypot(lng - (ax + t * (bx - ax)), lat - (ay + t * (by - ay))) < 0.004) return true;
  }
  return false;
}

export function makeListings(count = 200, seed = 7): Marker<Listing>[] {
  const random = mulberry32(seed);
  const listings: Marker<Listing>[] = [];
  while (listings.length < count) {
    const lng = AUSTIN.west + random() * (AUSTIN.east - AUSTIN.west);
    const lat = AUSTIN.south + random() * (AUSTIN.north - AUSTIN.south);
    if (nearRiver(lng, lat)) continue;
    const id = listings.length + 1;
    const price = Math.round((95 + random() * 260) / 5) * 5;
    const beds = 1 + Math.floor(random() * 4);
    listings.push({
      id,
      lng: Number(lng.toFixed(5)),
      lat: Number(lat.toFixed(5)),
      label: `$${price}`,
      title: `${beds}-bed on ${STREETS[Math.floor(random() * STREETS.length)]}`,
      subtitle: `$${price} per night`,
      href: `/listings/${id}`,
      data: { price, beds },
    });
  }
  return listings;
}
