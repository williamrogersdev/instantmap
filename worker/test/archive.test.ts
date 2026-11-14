import { describe, expect, test } from "bun:test";
import { archiveTile, type RangedBucket } from "../src/archive.ts";
import { buildFixtureArchive, fixtureTiles } from "./fixture-archive.ts";

function bucketOf(archive: Uint8Array, name: string): RangedBucket & { reads: number } {
  const bucket = {
    reads: 0,
    async get(key: string, options: { range: { offset: number; length: number } }) {
      if (key !== name) return null;
      bucket.reads++;
      const { offset, length } = options.range;
      const part = archive.slice(offset, offset + length);
      return { arrayBuffer: async () => part.buffer as ArrayBuffer, etag: "one" };
    },
  };
  return bucket;
}

describe("map data from an archive in R2", () => {
  const archive = buildFixtureArchive();

  test("every tile comes back as it went in", async () => {
    const bucket = bucketOf(archive, "a.pmtiles");
    const tiles = fixtureTiles();
    expect(tiles.length).toBeGreaterThan(40);
    for (const tile of tiles) expect(await archiveTile(bucket, "a.pmtiles", tile.z, tile.x, tile.y)).toEqual(tile.bytes);
  });

  test("a tile costs one read once the directory is known", async () => {
    const bucket = bucketOf(archive, "b.pmtiles");
    await archiveTile(bucket, "b.pmtiles", 12, 946, 1652);
    const before = bucket.reads;
    await archiveTile(bucket, "b.pmtiles", 12, 945, 1652);
    expect(bucket.reads - before).toBe(1);
  });

  test("a tile the archive does not cover is undefined, not an error", async () => {
    const bucket = bucketOf(archive, "c.pmtiles");
    expect(await archiveTile(bucket, "c.pmtiles", 12, 1, 1)).toBeUndefined();
    expect(await archiveTile(bucket, "c.pmtiles", 15, 7568, 13216)).toBeUndefined();
  });

  test("a missing archive is an error that names it", async () => {
    expect(archiveTile(bucketOf(archive, "d.pmtiles"), "other.pmtiles", 12, 946, 1652)).rejects.toThrow("other.pmtiles");
  });
});
