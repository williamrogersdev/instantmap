import { encodeColors } from "./colors.ts";
import { placesHtml } from "./places.ts";
import { posterSources, type StaticUrlInput } from "./static-url.ts";
import type { Detail, Marker } from "./types.ts";

export interface PosterHtmlOptions extends StaticUrlInput {
  alt?: string;
  className?: string;
  load?: "intent" | "visible" | "eager" | "none";
  detail?: Detail;
  /**
   * A hidden list of the places in the picture, inside the element, so crawlers, screen readers and AI agents can read
   * them before any script runs. On by default when there are markers; `false` leaves it out.
   */
  places?: boolean | { label?: string; limit?: number };
  /** Offer the map's tools to the browser's AI agent (WebMCP). A string is the tool-name prefix. */
  agentTools?: string | boolean;
}

const attribute = (value: string): string => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function posterHtml(options: PosterHtmlOptions): string {
  const { src, srcset } = posterSources(options, options.detail);
  const markers = options.markers ?? [];
  const list =
    options.places === false || !markers.length
      ? ""
      : placesHtml({ center: options.center, zoom: options.zoom, width: options.width, height: options.height, markers: markers as Marker[], cluster: options.cluster }, typeof options.places === "object" ? options.places : {});
  const colors = options.colors ? encodeColors(options.colors) : "";
  const attributes = [
    `center="${Number(options.center[0])},${Number(options.center[1])}"`,
    `zoom="${Number(options.zoom)}"`,
    options.src ? `src="${attribute(options.src)}"` : "",
    options.theme ? `theme="${attribute(options.theme)}"` : "",
    colors ? `colors="${attribute(colors)}"` : "",
    options.load ? `load="${attribute(options.load)}"` : "",
    options.detail ? `detail="${attribute(options.detail)}"` : "",
    options.className ? `class="${attribute(options.className)}"` : "",
    options.agentTools ? `agent-tools="${options.agentTools === true ? "" : attribute(options.agentTools)}"` : "",
    `style="display:block;position:relative;aspect-ratio:${Number(options.width)}/${Number(options.height)}"`,
  ]
    .filter(Boolean)
    .join(" ");
  return `<instant-map ${attributes}><img src="${attribute(src)}"${srcset ? ` srcset="${attribute(srcset)}"` : ""} alt="${attribute(options.alt ?? "Map")}" width="${Number(options.width)}" height="${Number(options.height)}" fetchpriority="high" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">${list}</instant-map>`;
}
