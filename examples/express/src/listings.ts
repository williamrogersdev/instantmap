import type { Marker } from 'instantmap-js';

const NEIGHBOURHOODS = ['Downtown', 'East Austin', 'Zilker', 'Hyde Park', 'Clarksville', 'South Congress', 'Bouldin Creek'];

function seeded(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function listings(count = 200): Marker[] {
	const random = seeded(75001);
	return Array.from({ length: count }, (_, index) => {
		const price = 60 + Math.floor(random() * 240);
		const beds = 1 + Math.floor(random() * 3);
		return {
			id: index + 1,
			lng: -97.80 + random() * 0.12,
			lat: 30.23 + random() * 0.08,
			label: `$${price}`,
			title: `Apartment ${index + 1}`,
			subtitle: `${NEIGHBOURHOODS[index % NEIGHBOURHOODS.length]} · ${beds} bed${beds > 1 ? 's' : ''}`,
			href: `/listings/${index + 1}`
		};
	});
}
