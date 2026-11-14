<script setup lang="ts">
import { defineInstantMap, type InstantMapElement, type Marker } from "instantmap-js";
import { ref } from "vue";
import { center, listings, zoom } from "./listings";

defineInstantMap();

const src = import.meta.env.VITE_INSTANTMAP_SRC ?? "https://instantmap.org";
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
  <main style="max-width: 1100px; margin: 0 auto; padding: 24px">
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
      style="display: block; height: 520px"
      @markerclick="onMarkerClick"
    ></instant-map>
  </main>
</template>
