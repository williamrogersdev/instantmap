export interface Listing {
  id: number;
  lng: number;
  lat: number;
  label: string;
  title: string;
  subtitle: string;
  href: string;
}

const NEIGHBOURHOODS: readonly [name: string, lng: number, lat: number, spreadLng: number, spreadLat: number, rent: number][] = [
  ["Mission", -122.4172, 37.7598, 0.008, 0.007, 3600],
  ["SoMa", -122.4013, 37.7781, 0.007, 0.005, 3900],
  ["Nob Hill", -122.4149, 37.7924, 0.005, 0.003, 3700],
  ["Outer Sunset", -122.4925, 37.7535, 0.009, 0.008, 3100],
  ["Inner Sunset", -122.4662, 37.7608, 0.006, 0.003, 3300],
  ["Richmond", -122.4795, 37.7808, 0.012, 0.004, 3200],
  ["Noe Valley", -122.4333, 37.7502, 0.006, 0.004, 4300],
  ["Haight-Ashbury", -122.4466, 37.7699, 0.005, 0.003, 3500],
  ["Marina", -122.4380, 37.7997, 0.006, 0.002, 4400],
  ["Castro", -122.4351, 37.7616, 0.004, 0.003, 3900],
  ["Pacific Heights", -122.4357, 37.7917, 0.007, 0.003, 4800],
  ["Bernal Heights", -122.4157, 37.7397, 0.006, 0.003, 3600],
  ["Potrero Hill", -122.4004, 37.7590, 0.005, 0.004, 4000],
  ["Hayes Valley", -122.4255, 37.7763, 0.004, 0.002, 4100],
  ["Excelsior", -122.4300, 37.7235, 0.009, 0.004, 2900],
  ["Russian Hill", -122.4183, 37.8005, 0.004, 0.002, 4200],
  ["Dogpatch", -122.3895, 37.7590, 0.002, 0.004, 3800],
  ["Glen Park", -122.4335, 37.7345, 0.004, 0.002, 3500],
  ["Western Addition", -122.4350, 37.7800, 0.006, 0.003, 3400],
  ["Bayview", -122.3920, 37.7300, 0.006, 0.006, 2800],
];

const KINDS = ["studio", "1-bed flat", "2-bed flat", "3-bed house", "loft", "1-bed condo", "2-bed condo"] as const;
const BEDS = [0, 1, 2, 3, 1, 1, 2] as const;
const ADJECTIVES = ["Sunny", "Quiet", "Corner", "Top-floor", "Renovated", "Garden", "Bay-window", "Edwardian", "Modern", "Bright"] as const;

const pick = <T,>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)]!;

export function sanFranciscoListings(count: number, seed = 20261113): Listing[] {
  let state = seed;
  const random = (): number => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  return Array.from({ length: count }, (_, id) => {
    const [name, lng, lat, spreadLng, spreadLat, rent] = pick(NEIGHBOURHOODS, random);
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random());
    const kind = Math.floor(random() * KINDS.length);
    const beds = BEDS[kind]!;
    const price = Math.round((rent * (0.7 + beds * 0.32) * (0.85 + random() * 0.3)) / 50) * 50;
    return {
      id,
      lng: Math.round((lng + Math.cos(angle) * distance * spreadLng) * 1e5) / 1e5,
      lat: Math.round((lat + Math.sin(angle) * distance * spreadLat) * 1e5) / 1e5,
      label: `$${price.toLocaleString("en-US")}`,
      title: `${pick(ADJECTIVES, random)} ${KINDS[kind]}`,
      subtitle: `${name}, ${beds === 0 ? "studio" : `${beds} bed`}, per month`,
      href: `#listing-${id}`,
    };
  });
}
