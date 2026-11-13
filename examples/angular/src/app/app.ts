import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, signal, ViewChild } from '@angular/core';
import type { InstantMapElement, Marker } from 'instantmap';
import { staticUrl } from 'instantmap/server';
import { instantMapSrc } from './instantmap-src';
import { listings } from './listings';

@Component({
  selector: 'app-root',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  @ViewChild('map') map?: ElementRef<InstantMapElement>;

  readonly src = instantMapSrc();
  readonly center: [number, number] = [-97.74, 30.27];
  readonly zoom = 12;
  readonly markers: Marker[] = listings();
  readonly poster = staticUrl({
    src: this.src,
    center: this.center,
    zoom: this.zoom,
    width: 1200,
    height: 640,
    ratio: 2,
    markers: this.markers,
  });
  opened = signal('Click a price to open its card.');

  showDowntown() {
    void this.map?.nativeElement.flyTo({ center: [-97.743, 30.267], zoom: 15 });
  }

  onMarkerClick(event: Event) {
    const { marker } = (event as CustomEvent<{ marker: Marker }>).detail;
    this.opened.set(`${marker.title}, ${marker.label}`);
  }
}
