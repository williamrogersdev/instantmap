# Benchmarks and profiling

Two commands. `bun run bench` measures how fast the map is. `bun run profile` records where the time goes, so you know what to change. The published results are at [instantmap.org/benchmarks](https://instantmap.org/benchmarks/).

Both run against a Worker started on your machine with the vector tiles in `fixtures/`, so they need no network and give the same picture every time.

## Set up once

```bash
bun install && (cd worker && bun install)
bun run build
bunx playwright install chromium   # add firefox webkit to measure those too
```

Run `bun run build` again after you change the package or the renderer, so the benchmark measures your change.

## Measure

```bash
bun run bench
```

This runs three parts and writes `bench/results/latest.json`:

| Part | What it measures |
| --- | --- |
| `renderer` | The Rust renderer, compiled natively: reading tiles, drawing, and encoding, for eight pictures. |
| `server` | The image service over HTTP: a picture that has to be drawn, and the same picture from cache. Also a whole screen of nine tiles asked for at once, with the number of requests it made to the tile source. |
| `browser` | A real visit: load with nothing cached, wake the map, drag, zoom, then 2,000 and 10,000 markers. |

Options:

| Option | Effect |
| --- | --- |
| `--quick` | Two visits on the desktop and mid-range phone profiles. About half a minute. |
| `--only renderer,server` | Run only some parts. |
| `--source-delay 150` | Make the local tile source wait 150 ms before each answer, like a distant one. Not published. |
| `--browsers all` | Chromium, Firefox and WebKit. The default is Chromium. |
| `--profiles desktop,phone-low` | Choose device profiles. The default is all four. |
| `--runs 9` | Visits per browser and profile. The default is 5. |
| `--url https://your-domain` | Measure a deployment instead of the local Worker. |
| `--out file.json` | Where to write the results. |
| `--publish` | Also write `bench/results/published.json`, which the site shows. Full local runs only. |

### Device profiles

Defined in [`profiles.ts`](./profiles.ts). The phone profiles slow the CPU and limit the network in Chromium. They imitate slower devices and are not a replacement for a real phone.

| Profile | Screen | CPU | Network |
| --- | --- | --- | --- |
| `desktop` | 1280×800 | as it is | no limit |
| `laptop-hidpi` | 1440×900 at 2× | as it is | no limit |
| `phone-mid` | 390×844 at 3× | 4× slower | 9 Mbps, 60 ms latency |
| `phone-low` | 360×780 at 2× | 6× slower | 1.6 Mbps, 150 ms latency |

### What the browser numbers mean

| Metric | Meaning |
| --- | --- |
| `firstImageMs` | From the start of the page load until the first map image is on screen. |
| `loadScriptMs` | JavaScript time used by then. |
| `wakeMs` | From the first pointer move until the map can be dragged. This includes fetching the engine. |
| `wakeToIdleMs` | From the first pointer move until the live tiles are drawn. |
| `dragFrameP95Ms`, `zoomFrameP95Ms` | Frame time at the 95th percentile. 16.7 means a full 60 frames a second. |
| `dragMainThreadMsPerFrame` | Main-thread work per frame while dragging. Frame times stop at the screen's refresh rate; this number keeps going down as the code gets faster. |
| `dragSlowFramesPercent` | Share of frames that took longer than 25 ms. |
| `markers2000Ms`, `markers10000Ms` | Time to replace the markers and draw them. |
| `totalBlockingMs` | Main-thread tasks longer than 50 ms, counting only the part beyond 50 ms. |
| `totalScriptMs`, `heapMb` | JavaScript time and memory for the whole visit. |

Script time, memory, and CPU and network limits come from Chromium. Firefox and WebKit report the timings only.

## See what a change did

```bash
bun run bench --out before.json
# make the change, then: bun run build
bun run bench --out after.json
bun run bench:compare before.json after.json
```

The comparison lists every metric that moved by 5% or more. Lower is better for all of them. Timings vary from run to run, so run a comparison twice before you believe a small difference. Add `--fail 25` to exit with an error when something gets more than 25% worse.

## Profile

```bash
bun run profile browser                       # the whole visit in Chromium
bun run profile browser --scenario drag       # one step: load, wake, drag, zoom, markers
bun run profile browser --device phone-low    # under a device profile
bun run profile worker                        # the Worker drawing uncached pictures
bun run profile renderer                      # the native renderer
bun run profile renderer --scene static-city-2x --seconds 8
```

Each command prints the functions with the most time in their own code and saves files in `bench/profiles/`.

| Target | Files | Open with |
| --- | --- | --- |
| `browser` | `.cpuprofile` and `.trace.json` | Chrome DevTools, Performance panel, Load profile. The trace also shows frames, layout and paint. |
| `worker` | `.cpuprofile` | Chrome DevTools or VS Code. Time inside the renderer shows as WebAssembly functions without names. |
| `renderer` | samply, Instruments or perf recording | `samply load`, Instruments, or `perf report`. This is the one with function names and lines inside the renderer. |

The browser profile serves a build that is not minified, so function names are readable. Pass `--as-shipped` to profile the exact bytes that are published. For the renderer, the script uses [samply](https://github.com/mstange/samply) when it is installed (`cargo install samply`), Instruments on macOS otherwise, and `perf` on Linux.

## A way of working

1. Run `bun run bench --out before.json`.
2. Pick the number you want to improve and profile that step, for example `bun run profile browser --scenario drag --device phone-low`.
3. Change the function at the top of the list.
4. Run `bun run build`, then `bun run bench --out after.json` and `bun run bench:compare before.json after.json`.
5. Keep the change if the number moved and nothing else got worse.

## Publishing results

```bash
bun run bench --browsers all --publish
```

Commit `bench/results/published.json`. The [benchmarks page](../site/src/pages/benchmarks.astro) is built from that file, so the site shows exactly what was measured, with the machine and commit it was measured on. Do not edit the file by hand.

Continuous integration runs `bun run bench --quick` on every pull request and attaches the results to the run. Shared runners are noisy, so that run is for spotting large changes, not for publishing.
