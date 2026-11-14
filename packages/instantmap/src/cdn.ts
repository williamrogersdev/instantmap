// The script-tag build. It only defines <instant-map>; import the package for the helpers.
import { InstantMapElement } from "./element.ts";

const loadEngine = (): Promise<typeof import("./engine.ts")> => import("./engine.ts");

// The engine file is named by its content. If a tab outlives a release that name is gone,
// so fetch this script afresh and take the engine it points to.
InstantMapElement.loadEngine = () => loadEngine().catch(() => import(/* @vite-ignore */ `${import.meta.url.split("?")[0]}?t=${Date.now()}`).then((fresh: { loadEngine: typeof loadEngine }) => fresh.loadEngine()));

if (typeof customElements !== "undefined" && !customElements.get("instant-map")) customElements.define("instant-map", InstantMapElement);

export { loadEngine };
