// Identity records only: never synthesize coordinates from registry information.
const text = (v: unknown): string => typeof v === "string" || typeof v === "number" ? String(v).slice(0, 200) : "";
export function normalizeGfwEntry(entry: any) {
  const rows = [...(Array.isArray(entry?.selfReportedInfo) ? entry.selfReportedInfo : []), ...(Array.isArray(entry?.registryInfo) ? entry.registryInfo : [])].filter(Boolean);
  rows.sort((a, b) => Number(b.latestVesselInfo === true) - Number(a.latestVesselInfo === true) || (Date.parse(b.transmissionDateTo) || 0) - (Date.parse(a.transmissionDateTo) || 0));
  const row = rows[0] || {};
  return { id: text(row.id || entry?.id), name: text(row.shipname || row.nShipname), mmsi: /^\d{9}$/.test(text(row.ssvid)) ? text(row.ssvid) : "", imo: text(row.imo), callsign: text(row.callsign), flag: text(row.flag), recordFrom: text(row.transmissionDateFrom), recordTo: text(row.transmissionDateTo) };
}
export type GfwVessel = ReturnType<typeof normalizeGfwEntry>;
