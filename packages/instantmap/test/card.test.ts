import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { beforeAll, describe, expect, test } from "bun:test";
import { cardFromTemplate, defaultCard, safeUrl } from "../src/card.ts";

beforeAll(() => {
  if (typeof document === "undefined") GlobalRegistrator.register();
});

describe("safeUrl", () => {
  test("keeps ordinary addresses", () => {
    for (const url of ["https://example.com/a?b=1", "http://example.com", "/listings/1", "listings/1", "#listing-1", "?id=1", "mailto:a@example.com", "tel:+15551234"]) expect(safeUrl(url)).toBe(url);
  });

  test("drops scripts and data, however they are disguised", () => {
    for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\nscript:alert(1)", "java\tscript:alert(1)", "\u0001javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "blob:https://example.com/x"]) expect(safeUrl(url)).toBe("");
    expect(safeUrl(undefined)).toBe("");
  });
});

describe("defaultCard", () => {
  const marker = { id: 1, lng: 0, lat: 0, label: "$4,950", title: "Sunny <b>flat</b>", subtitle: 'Mission "2 bed"', image: "/a.jpg", href: "/listings/1", badge: "New" };

  test("shows the marker's fields as text, never as markup", () => {
    const card = defaultCard(marker)!;
    expect(card.querySelector(".title")!.textContent).toBe("Sunny <b>flat</b>");
    expect(card.querySelector("b")).toBeNull();
    expect(card.querySelector(".price")!.textContent).toBe("$4,950");
    expect(card.querySelector(".badge")!.textContent).toBe("New");
    expect(card.querySelector("img")!.getAttribute("src")).toBe("/a.jpg");
    expect(card.querySelector("a.action")!.getAttribute("href")).toBe("/listings/1");
    expect(card.getAttribute("role")).toBe("dialog");
  });

  test("follows its options", () => {
    const card = defaultCard(marker, { layout: "row", action: "See listing", target: "_blank", closeLabel: "Fermer" })!;
    expect(card.classList.contains("row")).toBe(true);
    const link = card.querySelector("a.action")!;
    expect(link.textContent).toBe("See listing");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
    expect(card.querySelector("button.close")!.getAttribute("aria-label")).toBe("Fermer");
    expect(defaultCard(marker, { action: false })!.querySelector("a.action")).toBeNull();
  });

  test("refuses a script link and an unsafe image", () => {
    const card = defaultCard({ ...marker, href: "javascript:alert(1)", image: "javascript:alert(2)" })!;
    expect(card.querySelector("a")).toBeNull();
    expect(card.querySelector("img")).toBeNull();
  });

  test("has nothing to show for a bare marker", () => {
    expect(defaultCard({ id: 1, lng: 0, lat: 0, label: "$1" })).toBeNull();
  });
});

describe("cardFromTemplate", () => {
  const template = (html: string): HTMLTemplateElement => {
    const element = document.createElement("template");
    element.innerHTML = html;
    return element;
  };
  const marker = { id: 7, lng: 0, lat: 0, title: "<img src=x onerror=alert(1)>", href: "javascript:alert(1)", image: "/a.jpg", data: { beds: 2 } };

  test("fills text and attributes without ever creating markup", () => {
    const card = cardFromTemplate(template('<article class="mine"><h3>{{title}}</h3><p>{{ data.beds }} beds, {{missing}}</p><img src="{{image}}" alt="{{title}}"><a href="{{href}}">Open</a></article>'), marker);
    expect(card.className).toBe("mine");
    expect(card.querySelector("h3")!.textContent).toBe(marker.title);
    expect(card.querySelectorAll("img").length).toBe(1);
    expect(card.querySelector("p")!.textContent).toBe("2 beds, ");
    expect(card.querySelector("img")!.getAttribute("src")).toBe("/a.jpg");
    expect(card.querySelector("a")!.hasAttribute("href")).toBe(false);
  });

  test("drops data-if blocks for empty fields and inline handlers", () => {
    const card = cardFromTemplate(template('<div><span data-if="subtitle">{{subtitle}}</span><b data-if="title" onclick="alert(1)">x</b></div>'), marker);
    expect(card.querySelector("span")).toBeNull();
    expect(card.querySelector("b")!.hasAttribute("onclick")).toBe(false);
    expect(card.querySelector("b")!.hasAttribute("data-if")).toBe(false);
  });
});
