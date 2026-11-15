import { describe, expect, test } from "bun:test";
import { fitView } from "../src/fit.ts";
import { mercatorX, mercatorY, TILE_SIZE } from "../src/cluster.ts";

const points = [
  { lng: -122.5, lat: 37.7 },
  { lng: -122.3, lat: 37.85 },
];

describe("fitView", () => {
  test("keeps every point inside the padded frame", () => {
    const size = { width: 800, height: 600 };
    const padding = { top: 120, right: 40, bottom: 40, left: 40 };
    const view = fitView(points, size, { padding });
    const world = TILE_SIZE * 2 ** view.zoom;
    for (const point of points) {
      const x = size.width / 2 + (mercatorX(point.lng) - mercatorX(view.center[0])) * world;
      const y = size.height / 2 + (mercatorY(point.lat) - mercatorY(view.center[1])) * world;
      expect(x).toBeGreaterThanOrEqual(padding.left - 1e-6);
      expect(x).toBeLessThanOrEqual(size.width - padding.right + 1e-6);
      expect(y).toBeGreaterThanOrEqual(padding.top - 1e-6);
      expect(y).toBeLessThanOrEqual(size.height - padding.bottom + 1e-6);
    }
  });

  test("wholeZoom rounds down and the zoom limits hold", () => {
    const free = fitView(points, { width: 800, height: 600 });
    const whole = fitView(points, { width: 800, height: 600 }, { wholeZoom: true });
    expect(whole.zoom).toBe(Math.floor(free.zoom));
    expect(fitView([{ lng: 1, lat: 1 }], { width: 800, height: 600 }, { maxZoom: 11 }).zoom).toBe(11);
    expect(fitView([-170, -60, 170, 70], { width: 200, height: 200 }, { minZoom: 2 }).zoom).toBe(2);
  });

  test("takes bounds as well as points", () => {
    expect(fitView([-122.5, 37.7, -122.3, 37.85], { width: 800, height: 600 })).toEqual(fitView(points, { width: 800, height: 600 }));
  });
});
