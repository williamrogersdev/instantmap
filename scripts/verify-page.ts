import { chromium } from "playwright";

const [url, outDir = "verify-out", markerSelector = "instant-map"] = process.argv.slice(2);
if (!url) {
  console.error("usage: bun run scripts/verify-page.ts <url> [out-dir] [map-selector]");
  process.exit(2);
}

await Bun.$`mkdir -p ${outDir}`;
const cached = Bun.spawnSync(["sh", "-c", "ls -d $HOME/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell 2>/dev/null | tail -1"]).stdout.toString().trim();
const browser = await chromium.launch(process.env.CHROMIUM_PATH || cached ? { executablePath: process.env.CHROMIUM_PATH || cached } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
const errors: string[] = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));
const failed: string[] = [];
page.on("requestfailed", (request) => failed.push(`${request.url()} ${request.failure()?.errorText}`));

const started = Date.now();
await page.goto(url, { waitUntil: "load" });
const map = page.locator(markerSelector).first();
await map.waitFor({ state: "attached", timeout: 15000 });
const poster = await map.evaluate(async (element) => {
  const img = element.querySelector("img");
  if (!img) return { present: false };
  if (!img.complete) await new Promise((resolve) => img.addEventListener("load", resolve, { once: true }));
  return { present: true, src: img.currentSrc, width: img.naturalWidth, height: img.naturalHeight };
});
const firstImageMs = Date.now() - started;
await map.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${outDir}/1-still.png` });
const box = (await map.boundingBox())!;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
const interactive = await map.evaluate(
  (element) =>
    new Promise<boolean>((resolve) => {
      const done = () => resolve(element.hasAttribute("interactive"));
      if (element.hasAttribute("interactive")) return done();
      element.addEventListener("interactive", done, { once: true });
      setTimeout(done, 8000);
    }),
);
await map.evaluate((element) => (element as unknown as { whenIdle(): Promise<void> }).whenIdle());
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/2-interactive.png` });
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2 - 60, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(700);
await map.evaluate((element) => (element as unknown as { whenIdle(): Promise<void> }).whenIdle());
await page.screenshot({ path: `${outDir}/3-panned.png` });
const markerCount = await map.evaluate((element) => (element as unknown as { markers: unknown[] }).markers.length);
const target = await map.evaluate((element) => {
  const map = element as unknown as { markers: { id: string | number; lng: number; lat: number; label?: string }[]; project(lng: number, lat: number): [number, number]; clientWidth: number; clientHeight: number };
  for (const marker of map.markers) {
    const [x, y] = map.project(marker.lng, marker.lat);
    if (x > 40 && y > 40 && x < map.clientWidth - 40 && y < map.clientHeight - 40) return { x, y, id: marker.id };
  }
  return null;
});
let clickResult = "no marker in view";
if (target) {
  const zoomBefore = await map.evaluate((element) => (element as unknown as { camera: { zoom: number } }).camera.zoom);
  await page.mouse.click(box.x + target.x, box.y + target.y);
  await page.waitForTimeout(1200);
  const after = await map.evaluate((element) => ({
    popup: !!element.querySelector("[slot=popup]"),
    selected: !!(element as unknown as { selected: unknown }).selected,
    zoom: (element as unknown as { camera: { zoom: number } }).camera.zoom,
  }));
  clickResult = after.popup ? "opened popup" : after.selected ? "selected marker" : after.zoom > zoomBefore + 0.3 ? "zoomed into cluster" : "nothing happened";
  await page.screenshot({ path: `${outDir}/4-clicked.png` });
}
console.log(JSON.stringify({ url, firstImageMs, poster, interactive, markerCount, clickedMarker: target, clickResult, errors, failed }, null, 2));
await browser.close();
if (errors.length || !interactive || !poster.present || clickResult === "nothing happened") process.exit(1);
