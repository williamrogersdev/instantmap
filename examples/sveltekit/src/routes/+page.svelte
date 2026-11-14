<script lang="ts">
	import { onMount } from 'svelte';
	import type { InstantMapElement, Marker } from 'instantmap-js';

	let { data } = $props();

	let map: InstantMapElement | undefined = $state();
	let opened = $state('Click a price to open its card.');

	onMount(async () => {
		await import('instantmap-js');
		if (map) map.markers = data.markers;
	});

	function onmarkerclick(event: Event) {
		const { marker } = (event as CustomEvent<{ marker: Marker }>).detail;
		opened = `${marker.title}, ${marker.label}`;
	}
</script>

<main>
	<h1>Austin stays</h1>
	<instant-map
		bind:this={map}
		src={data.src}
		center={data.center.join(',')}
		zoom={data.zoom}
		{onmarkerclick}
		style="display:block;position:relative;height:520px"
	>
		<img
			src={data.poster}
			alt="Map of Austin"
			width="1200"
			height="640"
			fetchpriority="high"
			style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"
		/>
	</instant-map>
	<p>{opened}</p>
</main>

<style>
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 24px 16px;
		font-family: system-ui, sans-serif;
	}
</style>
