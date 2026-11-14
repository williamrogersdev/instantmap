// Builds a small PMTiles archive from fixtures/*.mvt, for tests and for benchmarks that read map data from R2.
// Usage: bun run worker/test/fixture-archive.ts out.pmtiles
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { zxyToTileId } from "pmtiles";

const fixtures = new URL("../../fixtures/", import.meta.url);

export interface FixtureTile {
  z: number;
  x: number;
  y: number;
  bytes: Uint8Array;
}

export function fixtureTiles(): FixtureTile[] {
  return readdirSync(fixtures)
    .map((name) => ({ name, match: name.match(/^(\d+)-(\d+)-(\d+)\.mvt$/) }))
    .filter((item) => item.match)
    .map(({ name, match }) => ({ z: Number(match![1]), x: Number(match![2]), y: Number(match![3]), bytes: new Uint8Array(readFileSync(new URL(name, fixtures))) }));
}

function varint(out: number[], value: number): void {
  while (value >= 0x80) {
    out.push((value % 0x80) | 0x80);
    value = Math.floor(value / 0x80);
  }
  out.push(value);
}

/** A PMTiles version 3 archive: header, root directory, metadata, then the tiles, each gzipped as in a real archive. */
export function buildFixtureArchive(): Uint8Array {
  const tiles = fixtureTiles()
    .map((tile) => ({ ...tile, id: zxyToTileId(tile.z, tile.x, tile.y), data: new Uint8Array(gzipSync(tile.bytes)) }))
    .sort((a, b) => a.id - b.id);
  const directory: number[] = [];
  varint(directory, tiles.length);
  tiles.forEach((tile, index) => varint(directory, tile.id - (index ? tiles[index - 1]!.id : 0)));
  for (const _ of tiles) varint(directory, 1);
  for (const tile of tiles) varint(directory, tile.data.length);
  // Tiles are stored one after another, which the format writes as 0 ("follows the last one") after the first.
  tiles.forEach((_, index) => varint(directory, index ? 0 : 1));
  const root = new Uint8Array(gzipSync(new Uint8Array(directory)));
  const metadata = new Uint8Array(gzipSync(new TextEncoder().encode("{}")));
  const tileBytes = tiles.reduce((sum, tile) => sum + tile.data.length, 0);
  const header = new Uint8Array(127);
  const view = new DataView(header.buffer);
  header.set(new TextEncoder().encode("PMTiles"));
  header[7] = 3;
  const rootOffset = 127;
  const metadataOffset = rootOffset + root.length;
  const tileOffset = metadataOffset + metadata.length;
  if (tileOffset > 16384) throw new Error("the fixture directory no longer fits in the first 16 KB");
  const sections = [rootOffset, root.length, metadataOffset, metadata.length, tileOffset, 0, tileOffset, tileBytes, tiles.length, tiles.length, tiles.length];
  sections.forEach((value, index) => view.setBigUint64(8 + index * 8, BigInt(value), true));
  header[96] = 1; // clustered
  header[97] = 2; // directories are gzipped
  header[98] = 2; // tiles are gzipped
  header[99] = 1; // vector tiles
  header[100] = Math.min(...tiles.map((tile) => tile.z));
  header[101] = Math.max(...tiles.map((tile) => tile.z));
  view.setInt32(102, -180e7, true);
  view.setInt32(106, -85e7, true);
  view.setInt32(110, 180e7, true);
  view.setInt32(114, 85e7, true);
  const archive = new Uint8Array(tileOffset + tileBytes);
  archive.set(header);
  archive.set(root, rootOffset);
  archive.set(metadata, metadataOffset);
  let offset = tileOffset;
  for (const tile of tiles) {
    archive.set(tile.data, offset);
    offset += tile.data.length;
  }
  return archive;
}

if (import.meta.main) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: bun run worker/test/fixture-archive.ts out.pmtiles");
  await Bun.write(out, buildFixtureArchive());
}
