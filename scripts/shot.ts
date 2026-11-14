// Screenshot a page once its maps are idle.
// Usage: bun run scripts/shot.ts <url> <out.png> [width] [height] [light|dark]   (FULL=1 for the whole page)
import { chromium } from "playwright";

const [url, out = "shot.png", width = "1280", height = "900", scheme = "light"] = process.argv.slice(2);
if (!url) {
  console.error("usage: bun run scripts/shot.ts <url> <out.png> [width] [height] [light|dark]");
  process.exit(2);
}
const cached = Bun.spawnSync(["sh", "-c", "ls -d $HOME/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell 2>/dev/null | tail -1"]).stdout.toString().trim();
const browser = await chromium.launch(process.env.CHROMIUM_PATH || cached ? { executablePath: process.env.CHROMIUM_PATH || cached } : {});
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 2, colorScheme: scheme === "dark" ? "dark" : "light" });
const errors: string[] = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => Promise.all([...document.querySelectorAll("instant-map")].map((map) => (map as unknown as { whenIdle(): Promise<void> }).whenIdle())));
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: process.env.FULL === "1" });
await browser.close();
if (errors.length) console.log(JSON.stringify(errors, null, 2));
