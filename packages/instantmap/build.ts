import { $ } from "bun";

await $`rm -rf dist`;
const shared = { target: "browser" as const, format: "esm" as const, minify: true, sourcemap: "linked" as const };
const library = await Bun.build({
  ...shared,
  entrypoints: ["src/index.ts", "src/server.ts", "src/react.tsx"],
  outdir: "dist",
  splitting: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
});
const cdn = await Bun.build({ ...shared, entrypoints: ["src/index.ts"], outdir: "dist", naming: "instant-map.js", define: { INSTANT_MAP_FROM_SCRIPT: "true" } });
for (const result of [library, cdn]) if (!result.success) throw new AggregateError(result.logs, "build failed");
await $`tsc --emitDeclarationOnly --outDir dist`;
const react = await Bun.file("dist/react.js").text();
if (!react.startsWith('"use client"')) await Bun.write("dist/react.js", `"use client";\n${react}`);
const size = (await Bun.file("dist/instant-map.js").arrayBuffer()).byteLength;
const gzip = Bun.gzipSync(new Uint8Array(await Bun.file("dist/instant-map.js").arrayBuffer())).byteLength;
console.log(`instant-map.js ${(size / 1024).toFixed(1)} KB, ${(gzip / 1024).toFixed(1)} KB gzipped`);
