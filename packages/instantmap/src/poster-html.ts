import { staticUrl, type StaticUrlInput } from "./static-url.ts";

export interface PosterHtmlOptions extends StaticUrlInput {
  alt?: string;
  className?: string;
  load?: "intent" | "visible" | "eager" | "none";
}

const attribute = (value: string): string => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function posterHtml(options: PosterHtmlOptions): string {
  const ratio = options.ratio ?? 2;
  const src = staticUrl({ ...options, ratio });
  const attributes = [
    `center="${options.center[0]},${options.center[1]}"`,
    `zoom="${options.zoom}"`,
    options.src ? `src="${attribute(options.src)}"` : "",
    options.theme ? `theme="${options.theme}"` : "",
    options.load ? `load="${options.load}"` : "",
    options.className ? `class="${attribute(options.className)}"` : "",
    `style="display:block;position:relative;aspect-ratio:${options.width}/${options.height}"`,
  ]
    .filter(Boolean)
    .join(" ");
  return `<instant-map ${attributes}><img src="${attribute(src)}" alt="${attribute(options.alt ?? "Map")}" width="${options.width}" height="${options.height}" fetchpriority="high" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></instant-map>`;
}
