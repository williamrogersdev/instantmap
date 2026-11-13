import { staticUrl } from 'instantmap/server';
import { listings } from '#lib/server/listings.ts';
import type { PageServerLoad } from './$types';

const CENTER: [number, number] = [-97.74, 30.27];
const ZOOM = 12;

export const load: PageServerLoad = () => {
	const markers = listings();
	const src = process.env.INSTANTMAP_SRC || 'https://instantmap.org';
	return {
		markers,
		src,
		center: CENTER,
		zoom: ZOOM,
		poster: staticUrl({ src, center: CENTER, zoom: ZOOM, width: 1200, height: 640, ratio: 2, markers })
	};
};
