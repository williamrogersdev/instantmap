import { expect, test } from "bun:test";
import { clusterAt, footprint } from "../src/cluster.ts";
import type { Marker } from "../src/types.ts";

const spot = (id: number, lng: number, lat: number, label?: string): Marker => ({ id, lng, lat, ...(label ? { label } : {}) });

function fixture(): Marker[] {
  const markers: Marker[] = [];
  const add = (lng: number, lat: number, label?: string) => markers.push(spot(markers.length, lng, lat, label));
  for (let index = 0; index < 6; index++) add(-96.8 + index * 0.01, 32.78);
  for (let index = 0; index < 4; index++) add(-96.8 + index * 0.02, 33.2, "Pallets");
  for (let index = 0; index < 5; index++) add(-97.3, 32.4 + index * 0.2);
  for (let index = 0; index < 5; index++) add(-95.9 + index * 0.5, 31.6);
  add(-100, 35);
  add(-100, 35, "Lubbock");
  add(-90, 29.9, "A very long label");
  add(-89.99, 29.9);
  add(-120, 40);
  add(-80, 25.8);
  add(-80, 25.82);
  add(-104, 33);
  add(-104.001, 33, "Roswell");
  add(-110, 45);
  return markers;
}

const shape = (markers: Marker[], zoom: number, distance = 44) =>
  clusterAt(markers, zoom, distance).map((group) => group.members.map((member) => Number(member.id)).sort((a, b) => a - b));

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, index) => from + index);

test("matches the Rust renderer's groups at zoom 4", () => {
  const groups = shape(fixture(), 4);
  expect(groups).toEqual([range(0, 16), [16, 17, 18, 19], [20, 21], [22, 23], [24], [25, 26], [27, 28], [29]]);
});

test("matches the Rust renderer's groups at zoom 8", () => {
  const groups = shape(fixture(), 8);
  expect(groups.length).toBe(18);
  expect(groups[0]).toEqual(range(0, 6));
  expect(groups[1]).toEqual(range(6, 10));
  expect(groups.map((group) => group.length)).toEqual([6, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 1]);
});

test("matches the Rust renderer's groups at zoom 12", () => {
  const groups = shape(fixture(), 12);
  expect(groups.length).toBe(28);
  expect(groups.filter((group) => group.length > 1)).toEqual([[20, 21], [27, 28]]);
});

test("distance 0 turns clustering off", () => {
  expect(clusterAt(fixture(), 4, 0).length).toBe(30);
});

test("footprints follow the shared formula", () => {
  expect(footprint(1, undefined)).toBe(6);
  expect(footprint(1, "abc")).toBe(18.5);
  expect(footprint(1, "a very long label")).toBe(43);
  expect(footprint(2, undefined)).toBe(13.5);
  expect(footprint(128, undefined)).toBe(34.5);
});

test("groups do not depend on the viewport or on panning", () => {
  const markers = fixture();
  expect(shape(markers, 8)).toEqual(shape(markers.slice(), 8));
});
