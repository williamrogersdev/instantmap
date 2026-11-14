import { describe, expect, test } from "bun:test";
import { BadRequest, cacheKey, jpegQuality, MAX_MARKERS, type MapRequest, parseRequest, type StaticRequest, type TileRequest } from "../src/params.ts";

const parse = (path: string): MapRequest | undefined => parseRequest(new URL(`https://maps.example${path}`));
const key = (path: string): string => {
  const url = new URL(`https://maps.example${path}`);
  return cacheKey(parseRequest(url)!, "v", url.searchParams);
};

describe("parseRequest", () => {
  test("leaves other addresses to the site", () => {
    expect(parse("/")).toBeUndefined();
    expect(parse("/docs/start/quick-start/")).toBeUndefined();
    expect(parse("/tiles/1/2/3.gif")).toBeUndefined();
    expect(parse("/static/")).toBeUndefined();
  });

  test("reads a static image with its defaults", () => {
    const request = parse("/static?center=-122.42,37.77&zoom=12") as StaticRequest;
    expect(request).toMatchObject({ kind: "static", longitude: -122.42, latitude: 37.77, zoom: 12, width: 640, height: 400, ratio: 1, png: false, clusterDistance: 44 });
    expect(request.look.theme).toBe("daylight");
    expect(request.look.palette.length).toBe(36);
    expect(request.markers.count).toBe(0);
  });

  test("reads markers, clusters and labels", () => {
    const request = parse("/static?center=0,0&zoom=3&markers=1,2,%244%2C950;3,4&clusters=5,6,12") as StaticRequest;
    expect(request.markers.count).toBe(3);
    expect([...request.markers.values]).toEqual([1, 2, 1, 0, 3, 4, 1, 0, 5, 6, 12, 0]);
    expect(request.markers.labels).toBe("$4,950\n\n");
  });

  test("reads a tile", () => {
    expect(parse("/tiles/12/946/1652@2x.jpg?theme=midnight") as TileRequest).toMatchObject({ kind: "tile", z: 12, x: 946, y: 1652, ratio: 2, png: false });
    expect((parse("/tiles/0/0/0.png") as TileRequest).png).toBe(true);
  });

  test("refuses what it cannot draw, with a reason", () => {
    const bad = ["/static", "/static?center=0,0", "/static?center=0&zoom=1", "/static?center=200,0&zoom=1", "/static?center=0,0&zoom=19", "/static?center=0,0&zoom=NaN", "/static?center=0,0&zoom=1&size=9000x10", "/static?center=0,0&zoom=1&size=10", "/static?center=0,0&zoom=1&format=gif", "/static?center=0,0&zoom=1&theme=neon", "/static?center=0,0&zoom=1&theme=__proto__", "/static?center=0,0&zoom=1&markers=1", "/static?center=0,0&zoom=1&clusters=1,2,1", "/tiles/16/0/0.jpg", "/tiles/2/4/0.jpg", "/tiles/2/0/4.jpg"];
    for (const path of bad) expect(() => parse(path)).toThrow(BadRequest);
  });

  test("caps the number of markers", () => {
    const many = Array.from({ length: MAX_MARKERS + 1 }, () => "1,2").join(";");
    expect(() => parse(`/static?center=0,0&zoom=1&markers=${many}`)).toThrow(BadRequest);
  });

  test("ignores colours that are not colours or not in the palette", () => {
    const request = parse("/tiles/1/0/0.jpg?colors=water:000000,nope:ffffff,land:zzzzzz") as TileRequest;
    expect(request.look.colors).toBe("water:000000");
  });
});

describe("cacheKey", () => {
  test("is one key for one picture, whatever else is in the address", () => {
    const plain = key("/tiles/12/946/1652@2x.jpg");
    expect(key("/tiles/12/946/1652@2x.jpg?v=3&utm_source=x&_=123")).toBe(plain);
    expect(key("/tiles/12/946/1652@2x.jpg?theme=daylight")).toBe(plain);
    expect(key("/tiles/12/946/1652@2x.jpg?colors=nope:ffffff")).toBe(plain);
    expect(key("/static?zoom=12&center=-122.42,37.77&junk=1")).toBe(key("/static?center=-122.42,37.77&zoom=12.0&size=640x400&r=1&format=jpg&cluster=44&theme=daylight"));
    expect(key("/tiles/1/0/0.jpg?colors=water:000000,land:FFFFFF")).toBe(key("/tiles/1/0/0.jpg?colors=land:ffffff,water:000000"));
  });

  test("differs when the picture differs", () => {
    const keys = ["/tiles/12/946/1652.jpg", "/tiles/12/946/1652@2x.jpg", "/tiles/12/946/1652.png", "/tiles/12/946/1653.jpg", "/tiles/12/946/1652.jpg?theme=midnight", "/tiles/12/946/1652.jpg?colors=water:000000", "/static?center=0,0&zoom=1", "/static?center=0,0&zoom=1&r=2", "/static?center=0,0&zoom=1&markers=1,2", "/static?center=0,0&zoom=1&markers=1,2,A", "/static?center=0,0&zoom=1&clusters=1,2,3", "/static?center=0,0&zoom=1&cluster=0", "/static?center=0,0&zoom=1&size=641x400"].map(key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(cacheKey(parse("/tiles/1/0/0.jpg")!, "v2", new URLSearchParams())).not.toBe(key("/tiles/1/0/0.jpg"));
  });
});

test("2x pictures are compressed harder than 1x", () => {
  expect(jpegQuality(2)).toBeLessThan(jpegQuality(1));
});
