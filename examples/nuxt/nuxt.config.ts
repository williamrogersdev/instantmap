export default defineNuxtConfig({
  compatibilityDate: "2026-11-01",
  vue: { compilerOptions: { isCustomElement: (tag) => tag === "instant-map" } },
  runtimeConfig: { public: { instantmapSrc: "https://instantmap.org" } },
});
