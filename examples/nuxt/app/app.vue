<script setup lang="ts">
import type { InstantMapElement, Marker } from "instantmap-js";
import { staticUrl } from "instantmap-js/server";
import { center, listings, zoom } from "./listings";

const src = useRuntimeConfig().public.instantmapSrc;
const poster = staticUrl({ src, center, zoom, width: 1280, height: 720, ratio: 2, markers: listings });
const map = ref<InstantMapElement | null>(null);
const clicked = ref<Marker | null>(null);

function onMarkerClick(event: Event) {
  clicked.value = (event as CustomEvent<{ marker: Marker }>).detail.marker;
}

function showAll() {
  map.value?.fitBounds(listings, { padding: 40 });
}
</script>

<template>
  <main style="max-width: 1100px; margin: 0 auto; padding: 24px; font-family: system-ui">
    <h1>Austin stays</h1>
    <p>
      <button type="button" @click="showAll">Show all</button>
      <span v-if="clicked"> Selected: {{ clicked.title }}, {{ clicked.subtitle }}</span>
    </p>
    <instant-map
      ref="map"
      :center="center.join(',')"
      :zoom="zoom"
      :src="src"
      :markers.prop="listings"
      style="display: block; position: relative; height: 520px"
      @markerclick="onMarkerClick"
    >
      <img
        :src="poster"
        alt="Map of Austin with 200 stays"
        width="1280"
        height="720"
        fetchpriority="high"
        style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover"
      />
    </instant-map>
  </main>
</template>
