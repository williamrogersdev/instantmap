import { describe, expect, test } from "bun:test";
import { staticUrl } from "../../packages/instantmap/src/static-url.ts";
import { describeStatic } from "../src/describe.ts";
import { parseRequest, type StaticRequest } from "../src/params.ts";

const markers = [
  { lng: -122.42, lat: 37.77, label: "$40" },
  { lng: -122.4201, lat: 37.7701, label: "$35" },
  { lng: -122.39, lat: 37.79, label: "$900" },
];

describe("describeStatic", () => {
  test("reads the picture's markers and clusters back as JSON", () => {
    const address = new URL(staticUrl({ src: "https://maps.example", center: [-122.42, 37.77], zoom: 12, width: 640, height: 400, markers }).replace("/static", "/describe"));
    const image = new URL(address);
    image.pathname = "/static";
    const described = describeStatic(parseRequest(image) as StaticRequest, address);
    expect(described.count).toBe(3);
    expect(described.clusters).toEqual([expect.objectContaining({ count: 2 })]);
    expect(described.markers).toEqual([expect.objectContaining({ label: "$900" })]);
    expect(described.markers[0]!.x).toBeGreaterThan(320);
    expect(described.image).toStartWith("https://maps.example/static?");
    expect(described.summary).toStartWith("3 markers in view: 1 on its own and 1 cluster. Labels include $900.");
  });
});
