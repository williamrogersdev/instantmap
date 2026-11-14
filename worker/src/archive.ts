// Reads vector tiles straight out of a PMTiles archive in an R2 bucket: no HTTP request to a tile server.
// A tile costs one ranged read once this isolate has the archive's directories, which are kept in memory.
import { PMTiles, type RangeResponse, ResolvedValueCache, type Source } from "pmtiles";

/** The part of an R2 bucket this file uses, so a test can stand in for one. */
export interface RangedBucket {
  get(key: string, options: { range: { offset: number; length: number } }): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; etag: string } | null>;
}

// Directories and headers, shared by every request this isolate serves. Keyed by archive name, and dropped by the
// library when the archive's etag changes, so replacing the archive needs no deployment.
const directories = new ResolvedValueCache(256);

/** The bucket has no archive under the configured name. */
export class ArchiveMissing extends Error {}

class BucketSource implements Source {
  constructor(
    private readonly bucket: RangedBucket,
    private readonly key: string,
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const object = await this.bucket.get(this.key, { range: { offset, length } });
    if (!object) throw new ArchiveMissing(`the map archive ${this.key} is not in the MAP_DATA bucket`);
    return { data: await object.arrayBuffer(), etag: object.etag };
  }
}

/** One vector tile, decompressed, or undefined when the archive does not cover it. */
export async function archiveTile(bucket: RangedBucket, key: string, z: number, x: number, y: number): Promise<Uint8Array | undefined> {
  const archive = new PMTiles(new BucketSource(bucket, key), directories);
  const header = await archive.getHeader();
  if (z < header.minZoom || z > header.maxZoom) return undefined;
  const tile = await archive.getZxy(z, x, y);
  return tile ? new Uint8Array(tile.data) : undefined;
}
