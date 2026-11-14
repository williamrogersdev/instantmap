// Compares two benchmark result files, to see what a change did.
//
//   bun run bench:compare before.json after.json            every metric that moved by 5% or more
//   bun run bench:compare before.json after.json --all      every metric
//   bun run bench:compare a.json b.json --fail 25           exit 1 if anything got more than 25% worse
//
// Typical use: `bun run bench --out before.json`, make the change, `bun run bench --out after.json`, compare.
// Lower is better for every metric here. Timings vary from run to run, so treat single-digit changes as noise.
import type { Results } from "./run.ts";
import { flags } from "./stack.ts";

const options = flags();
const [beforePath, afterPath] = options.rest;
if (!beforePath || !afterPath) {
  console.log((await Bun.file(import.meta.path).text()).split("\nimport")[0]!.replace(/^\/\/ ?/gm, ""));
  process.exit(2);
}
const before = (await Bun.file(beforePath).json()) as Results;
const after = (await Bun.file(afterPath).json()) as Results;

function flatten(data: Results): Map<string, number> {
  const values = new Map<string, number>();
  if (data.sizes) for (const [name, bytes] of Object.entries(data.sizes)) values.set(`size ${name} bytes`, bytes);
  for (const scene of data.renderer?.scenes ?? []) {
    values.set(`renderer ${scene.name} total ms`, scene.totalJpegMs.median);
    values.set(`renderer ${scene.name} draw ms`, scene.renderMs.median);
    values.set(`renderer ${scene.name} jpeg bytes`, scene.jpegBytes);
  }
  for (const item of data.server ?? []) {
    values.set(`server ${item.name} first ms`, item.firstMs.median);
    values.set(`server ${item.name} repeat ms`, item.repeatMs.median);
    if (item.sourceRequests !== undefined) values.set(`server ${item.name} tile source requests`, item.sourceRequests);
  }
  for (const item of data.browser ?? []) for (const [name, value] of Object.entries(item.metrics)) values.set(`${item.browser} ${item.profile} ${name}`, value.median);
  return values;
}

const a = flatten(before);
const b = flatten(after);
const showAll = options.has("all");
const failAt = options.has("fail") ? Number(options.get("fail") || 25) : undefined;
let worst = 0;
const rows: string[][] = [];
for (const [name, was] of a) {
  const now = b.get(name);
  if (now === undefined || !Number.isFinite(was) || !Number.isFinite(now)) continue;
  // Tiny values swing wildly in percentage terms without meaning anything.
  const change = Math.abs(now - was) < 0.5 ? 0 : ((now - was) / Math.max(was, 1e-9)) * 100;
  worst = Math.max(worst, change);
  if (showAll || Math.abs(change) >= 5) rows.push([name, String(Math.round(was * 10) / 10), String(Math.round(now * 10) / 10), `${change > 0 ? "+" : ""}${change.toFixed(1)}%`]);
}
console.log(`before: ${before.commit} ${before.date} (${before.target})\nafter:  ${after.commit} ${after.date} (${after.target})\n`);
if (before.machine.cpu !== after.machine.cpu) console.log("These were measured on different machines, so the comparison says little.\n");
if (!rows.length) console.log("Nothing moved by 5% or more.");
else {
  const widths = [0, 1, 2, 3].map((column) => Math.max(...rows.map((row) => row[column]!.length), ["metric", "before", "after", "change"][column]!.length));
  const line = (row: string[]) => row.map((cell, column) => (column ? cell.padStart(widths[column]!) : cell.padEnd(widths[column]!))).join("  ");
  console.log(line(["metric", "before", "after", "change"]));
  for (const row of rows) console.log(line(row));
}
if (failAt !== undefined && worst > failAt) {
  console.error(`\nSomething got ${worst.toFixed(1)}% worse, over the ${failAt}% limit.`);
  process.exit(1);
}
