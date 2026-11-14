import { $ } from "bun";

await $`rm -rf dist`;
const shared = { target: "browser" as const, format: "esm" as const, minify: true, sourcemap: "linked" as const, splitting: true };

// The package: one file per entry point, shared code in chunks, for bundlers.
const library = await Bun.build({
  ...shared,
  entrypoints: ["src/index.ts", "src/server.ts", "src/react.tsx", "src/card.ts", "src/brand.ts"],
  outdir: "dist",
  external: ["react", "react-dom", "react/jsx-runtime"],
});

// The script tag build: instant-map.js is the small loader, and the engine it fetches on first touch
// carries a content hash so it can be cached forever.
const cdn = await Bun.build({
  ...shared,
  entrypoints: ["src/cdn.ts"],
  outdir: "dist/cdn",
  naming: { entry: "instant-map.js", chunk: "im/[hash].js" },
  define: { INSTANT_MAP_FROM_SCRIPT: "true" },
});
for (const result of [library, cdn]) if (!result.success) throw new AggregateError(result.logs, "build failed");

await $`tsc --emitDeclarationOnly --outDir dist`;
const react = await Bun.file("dist/react.js").text();
if (!react.startsWith('"use client"')) await Bun.write("dist/react.js", `"use client";\n${react}`);

const gzip = async (path: string): Promise<number> => Bun.gzipSync(new Uint8Array(await Bun.file(path).arrayBuffer())).byteLength;
const sizes: Record<string, number> = {};
for (const output of cdn.outputs) {
  if (output.kind === "sourcemap") continue;
  const name = output.path.split("/").pop()!;
  const text = await Bun.file(output.path).text();
  // The entry is a stub that imports the element; the element is what a page pays for up front.
  const role = name === "instant-map.js" ? "entry" : text.includes("card-layout") ? "engine" : "element";
  sizes[role] = await gzip(output.path);
}
sizes.upfront = (sizes.entry ?? 0) + (sizes.element ?? 0);
await Bun.write("dist/cdn/sizes.json", JSON.stringify(sizes, null, 2));
for (const [name, bytes] of Object.entries(sizes)) console.log(`${name.padEnd(40)} ${(bytes / 1024).toFixed(2)} KB gzipped`);
