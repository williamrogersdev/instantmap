// Times the image service over HTTP: how long a picture takes when it has to be drawn, and when it is already cached.
// Against the local Worker every first request is a real render. Against a deployment the first request may already
// be cached somewhere, so the result records what the response headers said.
import { type Spread, spread } from "./stack.ts";

export interface ServerResult {
  name: string;
  description: string;
  /** First request for each distinct address. */
  firstMs: Spread;
  /** The same address asked for again. */
  repeatMs: Spread;
  bytes: number;
  /** What answered the first requests, from cf-cache-status or x-instantmap-cache. */
  firstSources: string[];
}

const CENTER: [number, number] = [-96.8, 32.79];
const THEMES = ["daylight", "midnight", "paper", "mono"];

function markerList(count: number): string {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, () => `${(CENTER[0] + (random() - 0.5) * 0.12).toFixed(5)},${(CENTER[1] + (random() - 0.5) * 0.07).toFixed(5)},$${Math.round(150 + random() * 400)}`).join(";");
}

/** Distinct addresses that cost the same to draw, so each first request is a fresh render. */
function tileAddresses(suffix: string, count: number): string[] {
  const addresses: string[] = [];
  for (const theme of THEMES) for (const x of [946, 945, 947]) for (const y of [1652, 1651, 1653]) addresses.push(`/tiles/12/${x}/${y}${suffix}?theme=${theme}`);
  return addresses.slice(0, count);
}

function staticAddresses(markers: number, count: number): string[] {
  const list = markers ? `&markers=${encodeURIComponent(markerList(markers))}&cluster=0` : "";
  // A shift of a few centimetres makes a new address without changing what has to be drawn.
  return Array.from({ length: count }, (_, index) => `/static?center=${(CENTER[0] + index * 1e-6).toFixed(6)},${CENTER[1]}&zoom=12&size=960x540&r=2${list}`);
}

async function timed(url: string): Promise<{ ms: number; bytes: number; source: string }> {
  const started = performance.now();
  const response = await fetch(url);
  const bytes = (await response.arrayBuffer()).byteLength;
  const ms = performance.now() - started;
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  // "miss" stored with a cached picture means Cloudflare's cache answered and the Worker did not run.
  const worker = response.headers.get("x-instantmap-cache") ?? "unknown";
  const source = worker === "miss" && (response.headers.get("age") !== null || response.headers.get("cf-cache-status") === "HIT") ? "cloudflare cache" : worker === "miss" ? "drawn" : worker === "hit" ? "worker cache" : worker;
  return { ms, bytes, source };
}

export async function runServer(base: string, options: { runs: number; log?: (line: string) => void }): Promise<ServerResult[]> {
  const cases = [
    { name: "tile-1x-jpeg", description: "One 512-point tile, JPEG", addresses: tileAddresses(".jpg", options.runs) },
    { name: "tile-2x-jpeg", description: "One 512-point tile at 2×, JPEG", addresses: tileAddresses("@2x.jpg", options.runs) },
    { name: "tile-2x-png", description: "One 512-point tile at 2×, PNG", addresses: tileAddresses("@2x.png", options.runs) },
    { name: "static-2x", description: "First image, 960×540 at 2×, no markers", addresses: staticAddresses(0, options.runs) },
    { name: "static-2x-50-markers", description: "First image, 960×540 at 2×, 50 markers", addresses: staticAddresses(50, options.runs) },
    { name: "static-2x-400-markers", description: "First image, 960×540 at 2×, 400 markers", addresses: staticAddresses(400, options.runs) },
  ];
  // Start the renderer before timing anything, so the first case does not carry the one-off start-up cost.
  await timed(`${base}/tiles/9/117/206.jpg`).catch(() => {});
  const results: ServerResult[] = [];
  for (const item of cases) {
    const first: number[] = [];
    const sources = new Set<string>();
    let bytes = 0;
    for (const address of item.addresses) {
      const sample = await timed(base + address);
      first.push(sample.ms);
      sources.add(sample.source);
      bytes = sample.bytes;
    }
    const repeat: number[] = [];
    for (let run = 0; run < Math.max(options.runs, 5); run++) repeat.push((await timed(base + item.addresses[0]!)).ms);
    const result = { name: item.name, description: item.description, firstMs: spread(first), repeatMs: spread(repeat), bytes, firstSources: [...sources] };
    results.push(result);
    options.log?.(`${item.name}: first ${result.firstMs.median} ms (${result.firstSources.join(", ")}), repeat ${result.repeatMs.median} ms, ${(bytes / 1024).toFixed(1)} KB`);
  }
  return results;
}
