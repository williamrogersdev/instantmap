import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { staticUrl } from "instantmap-js/server";
import { sanFranciscoListings } from "./listings.ts";

export const SITE = "https://instantmap.org";
export const REPO = "https://github.com/williamrogersdev/instantmap";
export const VERSION = (JSON.parse(readFileSync(resolve(process.cwd(), "../packages/instantmap/package.json"), "utf8")) as { version: string }).version;

interface Sizes {
  entry: number;
  element: number;
  engine: number;
  upfront: number;
}

/** Gzipped sizes of the script-tag build, written by the package build. */
export const sizes = JSON.parse(readFileSync(resolve(process.cwd(), "../packages/instantmap/dist/cdn/sizes.json"), "utf8")) as Sizes;
export const kb = (bytes: number): string => (bytes / 1024).toFixed(1);

export const NAV = [
  { href: "/speed/", label: "Speed" },
  { href: "/styling/", label: "Styling" },
  { href: "/cards/", label: "Cards" },
  { href: "/frameworks/", label: "Frameworks" },
  { href: "/ai/", label: "AI agents" },
  { href: "/docs/start/quick-start/", label: "Docs" },
] as const;

/** The picture shown when a page is shared: a real map from the service. */
export const SHARE_IMAGE = staticUrl({ src: SITE, center: [-122.4295, 37.7668], zoom: 12.6, width: 1200, height: 630, markers: sanFranciscoListings(60) });

export const FRAMEWORKS = [
  ["Next.js", "nextjs", "App Router, first image rendered on the server"],
  ["React", "react", "Vite and the React component"],
  ["React Router", "react-router", "Framework mode with a loader"],
  ["Astro", "astro", "Image in the HTML, no island needed"],
  ["Vue", "vue", "Vite and the custom element"],
  ["Nuxt", "nuxt", "Server-rendered image, client map"],
  ["SvelteKit", "sveltekit", "Load function and the element"],
  ["Angular", "angular", "Standalone component"],
  ["Solid", "solid", "SolidStart or Vite"],
  ["HTML, Rails, Django, PHP", "html", "One script tag in any page"],
] as const;

export const AGENT_PROMPT = `Add an Instant Map to this project.

1. Read https://instantmap.org/llms.txt, then the framework guide for this project's stack from https://instantmap.org/docs/frameworks/ (append .md to any docs URL for Markdown).
2. Install the package: npm install instantmap-js
3. Render the map where I ask, with an explicit height, centred on my data, and pass my records as markers: { id, lng, lat, label, title, subtitle, image, href }.
4. If the framework renders on the server, render the first image on the server as the guide shows, so the map appears before any JavaScript runs.
5. If the project has brand colours or design tokens, build the map colours from them with brandTheme() and use the same result for the first image and the live map.
6. Run the app and check: the image appears, the map moves when dragged, and clicking a marker opens its card. Fix any console errors.`;

export const FAQ: readonly (readonly [question: string, answer: string])[] = [
  ["What is Instant Map?", "Instant Map is an open-source map for websites. The first view is one finished image drawn on a server, so it shows with the page's HTML. A small web component turns that image into a map you can drag, zoom and click as soon as someone reaches for it."],
  ["How much JavaScript does it load?", `None before the map is visible. The loader is about ${kb(sizes.upfront)} KB gzipped and loads after the image is on screen. The interactive engine, about ${kb(sizes.engine)} KB gzipped, loads the first time someone points at, touches or focuses the map.`],
  ["Which frameworks does it work with?", "Any of them. Instant Map is a standard custom element, <instant-map>, so it works in plain HTML and in every framework. There is a React component, a server helper for building the first image, and step-by-step guides for Next.js, React Router, Astro, Vue, Nuxt, SvelteKit, Angular and Solid."],
  ["Can the map match my brand?", "Yes. Give brandTheme() the colours from your style guide (a primary colour is enough) and it returns a full map palette with readable labels and markers. You can also set any of the 36 map colours yourself, or start from one of four built-in themes."],
  ["Can I change the card that opens on a marker?", "Yes. The built-in card takes a title, subtitle, price, image, badge and link, and is restyled with CSS custom properties. For your own markup, put a <template data-card> inside the element or pass a function that returns the card."],
  ["Where does the map data come from?", "Map data is from OpenStreetMap contributors, in the Protomaps tile schema. Maps must show the OpenStreetMap attribution, which the element adds for you."],
  ["Can I host it myself?", "Yes. The renderer is a Cloudflare Worker in the repository. Deploy it to your own account, point it at a vector tile source, and set the src attribute to your address."],
  ["What does it not do?", "Instant Map draws flat, north-up maps with markers, clusters and cards. It does not do 3D, rotation, tilt, or drawing and editing shapes."],
  ["What does it cost?", "The code is free under the MIT licence. You can also run the renderer on your own Cloudflare account, where you pay Cloudflare for what you use."],
];
