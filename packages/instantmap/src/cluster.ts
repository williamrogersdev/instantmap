import type { Bounds, Marker } from "./types.ts";

export const TILE_SIZE = 512;
export const DEFAULT_CLUSTER_DISTANCE = 44;
export const MAX_LABEL_LENGTH = 10;

export const mercatorX = (lng: number): number => (lng + 180) / 360;

export const mercatorY = (lat: number): number => {
  const sin = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
};

export const longitudeOf = (x: number): number => x * 360 - 180;

export const latitudeOf = (y: number): number => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

export interface Group<Data = unknown> {
  x: number;
  y: number;
  members: Marker<Data>[];
  radius: number;
}

export function footprint(count: number, label: string | undefined): number {
  if (count > 1) return 10 + 3.5 * Math.min(7, Math.log2(count));
  if (label) return 8 + 3.5 * Math.min(MAX_LABEL_LENGTH, label.length);
  return 6;
}

const cellKey = (column: number, row: number): string => `${column}:${row}`;

export function clusterAt<Data>(markers: readonly Marker<Data>[], zoom: number, distance = DEFAULT_CLUSTER_DISTANCE): Group<Data>[] {
  const world = TILE_SIZE * 2 ** zoom;
  const groups: (Group<Data> & { seedX: number; seedY: number; sumX: number; sumY: number })[] = [];
  if (distance <= 0) {
    return markers.map((marker) => {
      const x = mercatorX(marker.lng) * world;
      const y = mercatorY(marker.lat) * world;
      return { x, y, members: [marker], radius: footprint(1, marker.label) };
    });
  }
  const seeds = new Map<string, number[]>();
  for (const marker of markers) {
    const x = mercatorX(marker.lng) * world;
    const y = mercatorY(marker.lat) * world;
    const column = Math.floor(x / distance);
    const row = Math.floor(y / distance);
    let joined = -1;
    search: for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const index of seeds.get(cellKey(column + dx, row + dy)) ?? []) {
          const group = groups[index]!;
          if (Math.hypot(group.seedX - x, group.seedY - y) < distance) {
            joined = index;
            break search;
          }
        }
      }
    }
    if (joined >= 0) {
      const group = groups[joined]!;
      group.members.push(marker);
      group.sumX += x;
      group.sumY += y;
    } else {
      const key = cellKey(column, row);
      const list = seeds.get(key);
      if (list) list.push(groups.length);
      else seeds.set(key, [groups.length]);
      groups.push({ x, y, seedX: x, seedY: y, sumX: x, sumY: y, members: [marker], radius: 0 });
    }
  }
  for (const group of groups) {
    group.x = group.sumX / group.members.length;
    group.y = group.sumY / group.members.length;
    group.radius = footprint(group.members.length, group.members[0]!.label);
  }
  return separate(groups).map(({ x, y, members, radius }) => ({ x, y, members, radius }));
}

function separate<G extends Group & { sumX: number; sumY: number }>(groups: G[]): G[] {
  const alive = groups.slice();
  const cell = 2 * footprint(2 ** 7, undefined) + 2;
  for (;;) {
    let merged = false;
    const grid = new Map<string, number[]>();
    alive.forEach((group, index) => {
      const key = cellKey(Math.floor(group.x / cell), Math.floor(group.y / cell));
      const list = grid.get(key);
      if (list) list.push(index);
      else grid.set(key, [index]);
    });
    const removed = new Set<number>();
    for (let index = 0; index < alive.length; index++) {
      if (removed.has(index)) continue;
      const group = alive[index]!;
      const column = Math.floor(group.x / cell);
      const row = Math.floor(group.y / cell);
      const neighbours: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (const other of grid.get(cellKey(column + dx, row + dy)) ?? []) {
            if (other > index && !removed.has(other)) neighbours.push(other);
          }
        }
      }
      neighbours.sort((a, b) => a - b);
      for (const other of neighbours) {
        const candidate = alive[other]!;
        if (Math.hypot(group.x - candidate.x, group.y - candidate.y) >= group.radius + candidate.radius + 2) continue;
        group.members.push(...candidate.members);
        group.sumX += candidate.sumX;
        group.sumY += candidate.sumY;
        group.x = group.sumX / group.members.length;
        group.y = group.sumY / group.members.length;
        group.radius = footprint(group.members.length, group.members[0]!.label);
        removed.add(other);
        merged = true;
      }
    }
    if (!merged) return alive;
    for (let index = alive.length - 1; index >= 0; index--) if (removed.has(index)) alive.splice(index, 1);
  }
}

export function boundsOf(markers: readonly Pick<Marker, "lng" | "lat">[]): Bounds {
  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  for (const { lng, lat } of markers) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [west, south, east, north];
}
