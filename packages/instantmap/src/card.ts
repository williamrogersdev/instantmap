import type { CardOptions, Marker } from "./types.ts";

export const CARD_STYLE_ID = "instant-map-card-style";

// The card lives in the page's own DOM (slotted into the map), so a page can restyle it with plain CSS.
// Every value a page is likely to change is a custom property with a default.
export const CARD_CSS = `
.instant-map-popup{position:absolute;left:0;top:0;will-change:transform}
.instant-map-card{--_bg:var(--im-card-background,var(--im-card,#fff));--_ink:var(--im-card-color,var(--im-ink,#1c2530));--_muted:var(--im-card-muted,var(--im-muted,#5b6570));--_accent:var(--im-card-accent,var(--im-accent,#0f2233));--_radius:var(--im-card-radius,14px);--_pad:var(--im-card-padding,12px);position:relative;box-sizing:border-box;width:min(var(--im-card-width,264px),calc(100cqw - 24px));background:var(--_bg);color:var(--_ink);border-radius:var(--_radius);box-shadow:var(--im-card-shadow,0 0 0 1px var(--im-hairline,#0000001a),0 1px 2px var(--im-shadow,#0003),0 12px 28px -8px var(--im-shadow,#0003));font:14px/1.4 var(--im-card-font,var(--im-font,system-ui,-apple-system,"Segoe UI",sans-serif));animation:instant-map-in .22s cubic-bezier(.2,.8,.3,1.1);transform-origin:50% 100%}
.instant-map-card *{box-sizing:border-box}
.instant-map-card::after{content:"";position:absolute;left:50%;bottom:-6px;width:12px;height:12px;margin-left:-6px;background:var(--_bg);border-radius:0 0 3px 0;transform:rotate(45deg);box-shadow:1px 1px 0 var(--im-hairline,#0000001a)}
.instant-map-card .media{position:relative;margin:0;overflow:hidden;border-radius:var(--_radius) var(--_radius) 0 0;aspect-ratio:var(--im-card-image-ratio,3/2);background:var(--im-card-placeholder,var(--im-hover,#0000000f))}
.instant-map-card .media img{display:block;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .18s linear}
.instant-map-card .media img.ready{opacity:1}
.instant-map-card .badge{position:absolute;left:8px;top:8px;max-width:calc(100% - 56px);padding:2px 8px;border-radius:999px;background:var(--_bg);color:var(--_ink);font-size:12px;font-weight:600;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 2px var(--im-shadow,#0003)}
.instant-map-card .body{position:relative;z-index:1;padding:var(--_pad);padding-top:calc(var(--_pad) - 2px);border-radius:var(--_radius);background:var(--_bg)}
.instant-map-card .media+.body{border-radius:0 0 var(--_radius) var(--_radius)}
.instant-map-card:not(:has(.media)) .body{padding-right:44px}
.instant-map-card .body>.badge{position:static;display:inline-block;max-width:100%;margin:0 0 6px;padding:1px 8px;background:var(--im-hover,#0000000f);box-shadow:none}
.instant-map-card .title{margin:0;font-size:15px;font-weight:650;line-height:1.3;letter-spacing:-.01em;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.instant-map-card .subtitle{margin:2px 0 0;color:var(--_muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.instant-map-card .foot{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:8px}
.instant-map-card .price{margin:0;font-size:15px;font-weight:650;font-variant-numeric:tabular-nums}
.instant-map-card .action{margin-left:auto;color:var(--_accent);font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap}
.instant-map-card .action::before{content:"";position:absolute;inset:0;border-radius:var(--_radius)}
.instant-map-card .action::after{content:"\\2192";display:inline-block;margin-left:4px;transition:transform .15s}
.instant-map-card .action:hover::after{transform:translateX(2px)}
.instant-map-card .action:focus-visible{outline:none}
.instant-map-card:has(.action:focus-visible){outline:2px solid var(--_accent);outline-offset:2px}
.instant-map-card .close{all:unset;position:absolute;z-index:2;right:8px;top:8px;width:28px;height:28px;display:grid;place-items:center;border-radius:999px;background:color-mix(in srgb,var(--_bg) 92%,transparent);color:var(--_ink);cursor:pointer;box-shadow:0 0 0 1px var(--im-hairline,#0000001a)}
.instant-map-card .close::before{content:"";position:absolute;inset:-8px}
.instant-map-card .close:hover{background:var(--_bg)}
.instant-map-card .close:focus-visible{outline:2px solid var(--_accent);outline-offset:2px}
.instant-map-card .close svg{width:12px;height:12px}
.instant-map-card.row{display:grid;grid-template-columns:96px 1fr;width:min(var(--im-card-width,320px),calc(100cqw - 24px))}
.instant-map-card.row .media{aspect-ratio:auto;min-height:96px;border-radius:var(--_radius) 0 0 var(--_radius)}
.instant-map-card.row .media+.body{border-radius:0 var(--_radius) var(--_radius) 0;padding-right:40px;min-width:0}
.instant-map-card.row .badge{display:none}
@keyframes instant-map-in{from{opacity:0;transform:translateY(4px) scale(.96)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.instant-map-card{animation:none}.instant-map-card .media img,.instant-map-card .action::after{transition:none}}
`;

const ICON_CLOSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** A link or image address that is safe to put in a card: http(s), mailto, tel, or a relative address. Anything else becomes "". */
export function safeUrl(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  // Browsers ignore control characters and whitespace inside a scheme, so strip them before looking at it.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text.replace(/[\u0000- ]/g, ""));
  if (scheme && !/^(https?|mailto|tel)$/i.test(scheme[1]!)) return "";
  return text;
}

const closeButton = (label: string): string => `<button class="close" type="button" aria-label="${escapeHtml(label)}">${ICON_CLOSE}</button>`;

/** The built-in card. Returns null when the marker has nothing to show. */
export function defaultCard(marker: Marker, options: CardOptions = {}): HTMLElement | null {
  if (!marker.title && !marker.image && !marker.subtitle) return null;
  const image = safeUrl(marker.image);
  const href = safeUrl(marker.href);
  const action = options.action === false ? "" : (options.action ?? "View details");
  const target = options.target === "_blank" ? ' target="_blank" rel="noopener"' : "";
  const badge = marker.badge ? `<span class="badge">${escapeHtml(marker.badge)}</span>` : "";
  const card = document.createElement("div");
  card.className = `instant-map-card${options.layout === "row" ? " row" : ""}`;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", marker.title ?? marker.label ?? "Details");
  card.innerHTML = [
    image ? `<div class="media"><img src="${escapeHtml(image)}" alt="" decoding="async" fetchpriority="high">${badge}</div>` : "",
    '<div class="body">',
    image ? "" : badge,
    marker.title ? `<p class="title">${escapeHtml(marker.title)}</p>` : "",
    marker.subtitle ? `<p class="subtitle">${escapeHtml(marker.subtitle)}</p>` : "",
    marker.label || (href && action) ? '<div class="foot">' : "",
    marker.label ? `<p class="price">${escapeHtml(marker.label)}</p>` : "",
    href && action ? `<a class="action" href="${escapeHtml(href)}"${target}>${escapeHtml(action)}</a>` : "",
    marker.label || (href && action) ? "</div>" : "",
    "</div>",
    closeButton(options.closeLabel ?? "Close"),
  ].join("");
  return card;
}

const URL_ATTRIBUTES = new Set(["href", "src", "poster", "action", "formaction", "xlink:href"]);

const lookup = (marker: Marker, path: string): unknown => path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | null | undefined)?.[key], marker);

const fill = (text: string, marker: Marker): string => text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => String(lookup(marker, path) ?? ""));

/**
 * Fills a `<template data-card>` for one marker. `{{title}}`, `{{data.beds}}` and so on are replaced as text,
 * never as markup; link and image addresses go through safeUrl; an element with `data-if="field"` is dropped
 * when that field is empty.
 */
export function cardFromTemplate(template: HTMLTemplateElement, marker: Marker): HTMLElement {
  const host = document.createElement("div");
  host.append(template.content.cloneNode(true));
  for (const element of [...host.querySelectorAll<HTMLElement>("[data-if]")]) {
    const value = lookup(marker, element.dataset.if ?? "");
    if (value === undefined || value === null || value === "" || value === false) element.remove();
    else element.removeAttribute("data-if");
  }
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue?.includes("{{")) node.nodeValue = fill(node.nodeValue, marker);
      continue;
    }
    const element = node as Element;
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (!attribute.value.includes("{{")) continue;
      const value = fill(attribute.value, marker);
      if (URL_ATTRIBUTES.has(name)) {
        const safe = safeUrl(value);
        if (safe) attribute.value = safe;
        else element.removeAttribute(attribute.name);
      } else if (name === "srcset" || name === "style") element.removeAttribute(attribute.name);
      else attribute.value = value;
    }
  }
  if (host.childElementCount === 1) {
    const only = host.firstElementChild as HTMLElement;
    only.remove();
    return only;
  }
  return host;
}
