// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLlmsTxt from "starlight-llms-txt";

// The picture shown when a docs page is shared: a map drawn by the service itself.
const shareImage = "https://instantmap.org/static?center=-122.4295,37.7668&zoom=12.6&size=1200x630";

export default defineConfig({
  site: "https://instantmap.org",
  trailingSlash: "ignore",
  integrations: [
    starlight({
      title: "Instant Map",
      description: "The map that is already there. One cached image first, a small interactive map on touch. Works in any framework.",
      logo: { src: "./src/assets/logo.svg" },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/williamrogersdev/instantmap" }],
      editLink: { baseUrl: "https://github.com/williamrogersdev/instantmap/edit/master/site/" },
      customCss: ["./src/styles/docs.css"],
      lastUpdated: true,
      components: { PageTitle: "./src/components/PageTitle.astro" },
      head: [
        { tag: "meta", attrs: { property: "og:image", content: shareImage } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { name: "twitter:image", content: shareImage } },
        { tag: "meta", attrs: { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" } },
        { tag: "link", attrs: { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "Instant Map documentation for language models" } },
        { tag: "script", attrs: { type: "module", src: "/instant-map.js" } },
        { tag: "link", attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: true } },
        { tag: "link", attrs: { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" } },
      ],
      plugins: [
        starlightLlmsTxt({
          projectName: "Instant Map",
          description:
            "Instant Map is an open-source map for the web. The first view is a single server-rendered image that needs no JavaScript; a small custom element, <instant-map>, loads after it (about 7 KB gzipped) and fetches the interactive engine (about 11 KB gzipped) the first time someone touches the map. It works in any framework because it is a standard web component, with a React adapter and a server helper for building image URLs.",
          details:
            "To add Instant Map to a project: install the `instantmap-js` package (or load https://instantmap.org/instant-map.js as a module script), render an <instant-map> element with center and zoom, give it an explicit height, and pass markers as an array of { id, lng, lat, label, title, subtitle, image, badge, href }. To match a brand, build the colours with brandTheme({ primary, background, foreground }) and pass the result as theme and colors. In server-rendered frameworks render the poster <img> on the server with staticUrl() from `instantmap-js/server` so the map paints before any JavaScript runs. Every docs page is also available as Markdown by adding .md to its URL.",
          customSets: [
            { label: "Frameworks", description: "Step-by-step integration for each framework", paths: ["docs/frameworks/**"] },
            { label: "Reference", description: "Complete API reference", paths: ["docs/reference/**"] },
          ],
          promote: ["docs/start/**", "docs/reference/**"],
        }),
      ],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Introduction", slug: "docs/start/introduction" },
            { label: "Quick start", slug: "docs/start/quick-start" },
            { label: "Build it with an AI agent", slug: "docs/start/ai-agents" },
            { label: "How it works", slug: "docs/start/how-it-works" },
            { label: "Questions and answers", slug: "docs/start/faq" },
          ],
        },
        { label: "Frameworks", items: [{ autogenerate: { directory: "docs/frameworks" } }] },
        { label: "Guides", items: [{ autogenerate: { directory: "docs/guides" } }] },
        { label: "Reference", items: [{ autogenerate: { directory: "docs/reference" } }] },
      ],
    }),
  ],
});
