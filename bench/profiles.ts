// The environments the browser benchmark imitates. CPU and network limits need Chromium;
// other browsers run with the viewport and pixel ratio only.
export interface DeviceProfile {
  name: string;
  description: string;
  width: number;
  height: number;
  pixelRatio: number;
  /** How many times slower the CPU is made. 1 is this machine as it is. */
  cpuSlowdown: number;
  /** Omitted means no limit. */
  network?: { downloadKbps: number; uploadKbps: number; latencyMs: number };
}

export const PROFILES: DeviceProfile[] = [
  { name: "desktop", description: "Desktop, 1280×800, CPU as it is, no network limit", width: 1280, height: 800, pixelRatio: 1, cpuSlowdown: 1 },
  { name: "laptop-hidpi", description: "High-density laptop, 1440×900 at 2×, CPU as it is, no network limit", width: 1440, height: 900, pixelRatio: 2, cpuSlowdown: 1 },
  {
    name: "phone-mid",
    description: "Mid-range phone, 390×844 at 3×, CPU 4× slower, 9 Mbps down with 60 ms latency",
    width: 390,
    height: 844,
    pixelRatio: 3,
    cpuSlowdown: 4,
    network: { downloadKbps: 9000, uploadKbps: 1500, latencyMs: 60 },
  },
  {
    name: "phone-low",
    description: "Low-end phone, 360×780 at 2×, CPU 6× slower, 1.6 Mbps down with 150 ms latency",
    width: 360,
    height: 780,
    pixelRatio: 2,
    cpuSlowdown: 6,
    network: { downloadKbps: 1600, uploadKbps: 750, latencyMs: 150 },
  },
];

export function profileNamed(name: string): DeviceProfile {
  const found = PROFILES.find((profile) => profile.name === name);
  if (!found) throw new Error(`no device profile "${name}". Choose from: ${PROFILES.map((profile) => profile.name).join(", ")}`);
  return found;
}
