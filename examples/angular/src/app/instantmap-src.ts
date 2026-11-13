import { isPlatformServer } from '@angular/common';
import { inject, makeStateKey, PLATFORM_ID, TransferState } from '@angular/core';

const SRC = makeStateKey<string>('instantmap-src');

export function instantMapSrc(): string {
  const state = inject(TransferState);
  if (isPlatformServer(inject(PLATFORM_ID))) {
    state.set(SRC, process.env['INSTANTMAP_SRC'] ?? 'https://instantmap.org');
  }
  return state.get(SRC, 'https://instantmap.org');
}
