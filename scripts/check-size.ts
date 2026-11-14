// Fails when the script-tag build grows past its budget.
// Run `bun run build` in packages/instantmap first. Usage: bun run scripts/check-size.ts

// Gzipped bytes. These are deliberate ceilings: raise them only on purpose, in a change that says why.
const BUDGETS = {
  upfront: 8192, // loader plus element, fetched on every page that uses the map
  engine: 13312, // fetched on first intent (hover, touch or scroll into view)
} as const;

const file = new URL("../packages/instantmap/dist/cdn/sizes.json", import.meta.url);
if (!(await Bun.file(file).exists())) {
  console.error("size: packages/instantmap/dist/cdn/sizes.json is missing. Run `bun run build` first.");
  process.exit(1);
}
const sizes = (await Bun.file(file).json()) as Record<string, number>;

let failed = false;
const rows: string[][] = [["file", "gzipped", "budget", "status"]];
for (const [name, budget] of Object.entries(BUDGETS)) {
  const size = sizes[name];
  if (typeof size !== "number") {
    rows.push([name, "missing", String(budget), "FAIL"]);
    failed = true;
    continue;
  }
  const ok = size <= budget;
  if (!ok) failed = true;
  rows.push([name, String(size), String(budget), ok ? "ok" : `FAIL (+${size - budget})`]);
}
const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
for (const row of rows) console.log(row.map((cell, i) => cell.padEnd(widths[i])).join("  "));

if (failed) {
  console.error("\nsize: over budget. Shrink the code, or raise BUDGETS in scripts/check-size.ts on purpose.");
  process.exit(1);
}
