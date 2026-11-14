import type { Marker } from "instantmap-js";

export const center: [number, number] = [-97.7431, 30.2672];
export const zoom = 12;

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seededRandom(7);

export const listings: Marker[] = Array.from({ length: 200 }, (_, index) => {
  const price = 40 + Math.round(random() * 260);
  return {
    id: index + 1,
    lng: -97.79 + random() * 0.09,
    lat: 30.23 + random() * 0.07,
    label: `$${price}`,
    title: `Apartment ${index + 1}`,
    subtitle: `$${price} per night`,
    href: `/listings/${index + 1}`,
  };
});
