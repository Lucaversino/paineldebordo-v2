// Global Fishing Watch vessel identity helpers.
// Identity records only: never synthesize coordinates from registry information.
const text = (v: unknown): string => typeof v === "string" || typeof v === "number" ? String(v).slice(0, 200).trim() : "";

function rows(value: unknown): any[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value && typeof value === "object" ? [value] : [];
}

function normalizeSearchText(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function timestamp(value: unknown) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowScore(row: any, query: string, entry: any) {
  const q = normalizeSearchText(query);
  const qDigits = text(query).replace(/\D/g, "");
  const name = normalizeSearchText(row?.shipname);
  const normalizedName = normalizeSearchText(row?.nShipname);
  const callsign = normalizeSearchText(row?.callsign);
  const mmsi = text(row?.ssvid).replace(/\D/g, "");
  const imo = text(row?.imo).replace(/\D/g, "");
  let score = 0;

  if (qDigits) {
    if (mmsi && mmsi === qDigits) score += 1200;
    if (imo && imo === qDigits) score += 1150;
  }
  if (q) {
    if (name === q || normalizedName === q) score += 1000;
    else if (name.startsWith(q) || normalizedName.startsWith(q)) score += 820;
    else if (name.includes(q) || normalizedName.includes(q)) score += 700;
    if (callsign === q) score += 900;
  }

  for (const criterion of rows(entry?.matchCriteria)) {
    for (const match of rows(criterion?.matches)) {
      const property = text(match?.property).toLowerCase();
      const value = normalizeSearchText(match?.value);
      if (!q || !value) continue;
      if (property.includes("shipname") && value === q) score += 260;
      else if (property.includes("shipname") && value.includes(q)) score += 150;
      else if ((property.includes("ssvid") || property.includes("mmsi")) && value === q) score += 260;
      else if (property.includes("imo") && value === q) score += 260;
      else if (property.includes("callsign") && value === q) score += 220;
    }
  }

  if (row?.latestVesselInfo === true) score += 40;
  if (Number(row?.positionsCounter) > 0) score += Math.min(30, Math.log10(Number(row.positionsCounter) + 1) * 10);
  score += Math.min(20, timestamp(row?.transmissionDateTo) / 1e12);
  return score;
}

export function normalizeGfwEntry(entry: any, query = "") {
  const identityRows = [
    ...rows(entry?.selfReportedInfo),
    ...rows(entry?.registryInfo),
  ];

  identityRows.sort((a, b) => {
    const scoreDiff = rowScore(b, query, entry) - rowScore(a, query, entry);
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return Number(b?.latestVesselInfo === true) - Number(a?.latestVesselInfo === true)
      || timestamp(b?.transmissionDateTo) - timestamp(a?.transmissionDateTo);
  });

  const row = identityRows[0] || {};
  const score = rowScore(row, query, entry);
  const mmsi = text(row?.ssvid).replace(/\D/g, "");
  const imo = text(row?.imo).replace(/\D/g, "");
  const name = text(row?.shipname || row?.nShipname);

  return {
    id: text(row?.id || entry?.id || entry?.combinedSourcesInfo?.[0]?.vesselId),
    name,
    mmsi: /^\d{9}$/.test(mmsi) ? mmsi : "",
    imo,
    callsign: text(row?.callsign),
    flag: text(row?.flag),
    recordFrom: text(row?.transmissionDateFrom),
    recordTo: text(row?.transmissionDateTo),
    latestVesselInfo: row?.latestVesselInfo === true,
    positionsCounter: Number.isFinite(Number(row?.positionsCounter)) ? Number(row.positionsCounter) : 0,
    relevance: Number(score.toFixed(3)),
  };
}

export function rankGfwEntries(entries: any[], query: string) {
  const q = normalizeSearchText(query);
  const normalized = entries
    .map((entry) => normalizeGfwEntry(entry, query))
    .filter((item) => item.name || item.mmsi || item.imo || item.callsign)
    .sort((a, b) => b.relevance - a.relevance || Number(b.latestVesselInfo) - Number(a.latestVesselInfo));

  const seen = new Set<string>();
  const deduped = normalized.filter((item) => {
    const key = item.mmsi ? `mmsi:${item.mmsi}` : item.imo ? `imo:${item.imo}` : `name:${normalizeSearchText(item.name)}:${item.callsign}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // The GFW basic search is full-text across many fields. For a name query,
  // prefer actual vessel-name matches so owner/registry text does not pollute the result list.
  if (q && /[A-Z]/.test(q)) {
    const byName = deduped.filter((item) => {
      const n = normalizeSearchText(item.name);
      return n === q || n.startsWith(q) || n.includes(q) || q.includes(n);
    });
    if (byName.length) return byName;
  }

  return deduped;
}

export type GfwVessel = ReturnType<typeof normalizeGfwEntry>;
