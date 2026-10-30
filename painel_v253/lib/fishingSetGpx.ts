/** GPX 1.1 export for TIMEZERO: independent routes per fishing set and standalone marks. */
export type FishingSetGpx = {
  setNumber?: number | string | null;
  startLatitude?: number | string | null;
  startLongitude?: number | string | null;
  endLatitude?: number | string | null;
  endLongitude?: number | string | null;
  startedAt?: string | null;
  depthMeters?: number | null;
};

const xml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function position(latitude: unknown, longitude: unknown) {
  if (latitude === null || latitude === undefined || latitude === "" || longitude === null || longitude === undefined || longitude === "") return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function createFishingSetsGpx(sets: FishingSetGpx[], tripName: string) {
  const marks: string[] = [];
  const routes: string[] = [];
  let skipped = 0;
  let incomplete = 0;

  for (const [index, set] of sets.entries()) {
    const number = String(set.setNumber ?? index + 1).padStart(2, "0");
    const start = position(set.startLatitude, set.startLongitude);
    const end = position(set.endLatitude, set.endLongitude);
    if (!start && !end) { skipped++; continue; }
    const prefix = `Largada ${number}`;
    const info = [tripName, set.startedAt ? new Date(set.startedAt).toLocaleDateString("pt-BR") : "", set.depthMeters != null ? `${set.depthMeters} m` : ""].filter(Boolean).join(" | ");
    const pointXml = (tag: "wpt" | "rtept", p: {lat: number; lon: number}, name: string) => `<${tag} lat="${p.lat.toFixed(8)}" lon="${p.lon.toFixed(8)}"><name>${xml(name)}</name><desc>${xml(info)}</desc></${tag}>`;
    if (start) marks.push(pointXml("wpt", start, `${prefix} - Inicial`));
    if (end) marks.push(pointXml("wpt", end, `${prefix} - Final`));
    if (start && end) {
      routes.push(`<rte><name>${xml(prefix)}</name><desc>${xml(info)}</desc>${pointXml("rtept", start, `${prefix} - Inicial`)}${pointXml("rtept", end, `${prefix} - Final`)}</rte>`);
    } else incomplete++;
  }

  if (!marks.length) throw new Error("Nenhuma largada possui coordenadas válidas para exportar.");
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Painel de Bordo"><metadata><name>${xml(tripName)}</name></metadata>\n${marks.join("\n")}\n${routes.join("\n")}\n</gpx>`;
  return { content, marks: marks.length, routes: routes.length, skipped, incomplete };
}

export function downloadFishingSetsGpx(sets: FishingSetGpx[], tripName: string) {
  const result = createFishingSetsGpx(sets, tripName);
  const safeName = tripName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 65) || "viagem";
  const blob = new Blob([result.content], { type: "application/gpx+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}-TimeZero.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return result;
}
