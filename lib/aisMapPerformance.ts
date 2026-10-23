/** Limita o canvas, sem alterar coordenadas, zoom ou quantidade de embarcações. */
export function aisMapPixelRatio(deviceRatio: number, coarsePointer: boolean): number {
  const ratio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  return Math.min(ratio, coarsePointer ? 1.5 : 2);
}

/** Os símbolos oficiais só mudam nestes limiares de zoom. */
export function officialWaypointStyleBucket(zoom: number): number {
  return zoom < 8 ? 0 : zoom < 9 ? 1 : zoom < 11 ? 2 : 3;
}

/** Respostas JSON idênticas não precisam reconstruir camadas vetoriais. */
export function reuseUnchangedMapItems<T>(previous: T[], incoming: T[]): T[] {
  return JSON.stringify(previous) === JSON.stringify(incoming) ? previous : incoming;
}
