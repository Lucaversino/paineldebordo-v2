export const reportNumber = (value: unknown) => Number(value || 0);

export const formatKg = (value: unknown, digits = 0) =>
  `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(reportNumber(value))} kg`;

export const formatReportDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "Não informada";

export const formatReportTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "—";

export function getDiscardCondition(item: any) {
  const direct = String(item?.discardCondition || "").trim().toUpperCase();
  if (direct === "VIVO" || direct === "MORTO") return direct;
  const match = String(item?.notes || "").match(/^\[DESCARTE:(VIVO|MORTO)\]/i);
  return match?.[1]?.toUpperCase() || "NÃO INFORMADO";
}

export function getTripYear(trip: any) {
  const date = new Date(trip?.departureDate || trip?.returnDate || trip?.expectedReturnDate || "");
  return Number.isFinite(date.getTime()) ? date.getFullYear() : 0;
}

export function formatCoordinate(value: unknown, latitude: boolean) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  const absolute = Math.abs(numeric);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  const minutesCompact = minutes.toFixed(2).replace(".", "").padStart(4, "0");
  const direction = latitude ? (numeric < 0 ? "S" : "N") : numeric < 0 ? "W" : "E";
  return `${String(degrees).padStart(2, "0")}°${minutesCompact} ${direction}`;
}

const COAST_BANDS = [
  { min: -34.5, max: -28.2, label: "Costa do Rio Grande do Sul" },
  { min: -28.2, max: -26.0, label: "Costa de Santa Catarina" },
  { min: -26.0, max: -24.8, label: "Costa do Paraná / Sul de São Paulo" },
  { min: -24.8, max: -22.6, label: "Costa de São Paulo" },
  { min: -22.6, max: -20.3, label: "Costa do Rio de Janeiro" },
];

// Referências costeiras intencionalmente espaçadas. O objetivo aqui não é
// "adivinhar a cidade exata", e sim transformar a rota oceânica em uma leitura
// operacional fácil para o pescador (ex.: Imbituba, SC → Cananéia, SP).
const COASTAL_REFERENCES = [
  { name: "Rio Grande, RS", lat: -32.035, lon: -52.099 },
  { name: "Mostardas, RS", lat: -31.105, lon: -50.916 },
  { name: "Torres, RS", lat: -29.335, lon: -49.726 },
  { name: "Imbituba, SC", lat: -28.240, lon: -48.670 },
  { name: "Porto Belo, SC", lat: -27.157, lon: -48.553 },
  { name: "São Francisco do Sul, SC", lat: -26.243, lon: -48.638 },
  { name: "Paranaguá, PR", lat: -25.516, lon: -48.523 },
  { name: "Cananéia, SP", lat: -25.014, lon: -47.934 },
  { name: "Santos, SP", lat: -23.960, lon: -46.333 },
  { name: "Ubatuba, SP", lat: -23.433, lon: -45.083 },
  { name: "Angra dos Reis, RJ", lat: -23.006, lon: -44.318 },
  { name: "Rio de Janeiro, RJ", lat: -22.906, lon: -43.172 },
  { name: "Cabo Frio, RJ", lat: -22.880, lon: -42.018 },
  { name: "Macaé, RJ", lat: -22.377, lon: -41.786 },
];

type GeoPoint = { lat: number; lon: number };

const validPoint = (latValue: unknown, lonValue: unknown): GeoPoint | null => {
  const lat = Number(latValue);
  const lon = Number(lonValue);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
};

const haversineKm = (a: GeoPoint, b: GeoPoint) => {
  const toRad = (value: number) => value * Math.PI / 180;
  const earth = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.asin(Math.sqrt(h));
};

export function coastalReference(point: GeoPoint | null) {
  if (!point) return "Região não determinada";
  return COASTAL_REFERENCES
    .map((ref) => ({ ...ref, distance: haversineKm(point, ref) }))
    .sort((a, b) => a.distance - b.distance)[0]?.name || "Área oceânica registrada";
}

export function formatCoordinatePair(point: GeoPoint | null) {
  if (!point) return "—";
  return `${formatCoordinate(point.lat, true)} / ${formatCoordinate(point.lon, false)}`;
}

function southAndNorthExtremePoints(sets: any[]) {
  let southPoint: GeoPoint | null = null;
  let northPoint: GeoPoint | null = null;

  for (const set of sets) {
    const candidates = [
      validPoint(set.startLatitude, set.startLongitude),
      validPoint(set.endLatitude, set.endLongitude),
    ].filter(Boolean) as GeoPoint[];

    for (const point of candidates) {
      // Latitude menor = ponto mais ao Sul; latitude maior = ponto mais ao Norte.
      if (!southPoint || point.lat < southPoint.lat) southPoint = point;
      if (!northPoint || point.lat > northPoint.lat) northPoint = point;
    }
  }

  return { southPoint, northPoint };
}

export function geographicSummary(sets: any[], mode: "trip" | "area" = "trip") {
  const points: GeoPoint[] = [];
  sets.forEach((set) => {
    const start = validPoint(set.startLatitude, set.startLongitude);
    const end = validPoint(set.endLatitude, set.endLongitude);
    if (start) points.push(start);
    if (end) points.push(end);
  });
  if (!points.length) {
    return {
      label: "Região não determinada",
      detail: "Esta viagem não possui posições suficientes para calcular a área trabalhada.",
      minLat: null,
      maxLat: null,
      minLon: null,
      maxLon: null,
      pointCount: 0,
      southPoint: null,
      northPoint: null,
      southReference: "Região não determinada",
      northReference: "Região não determinada",
      startPoint: null,
      endPoint: null,
      startReference: "Região não determinada",
      endReference: "Região não determinada",
      routeLabel: "Área não determinada",
    };
  }

  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const { southPoint, northPoint } = southAndNorthExtremePoints(sets);
  const southReference = coastalReference(southPoint);
  const northReference = coastalReference(northPoint);
  const routeLabel = southPoint && northPoint ? `${southReference} → ${northReference}` : "Área não determinada";

  if (mode === "trip") {
    return {
      label: routeLabel,
      detail: southPoint && northPoint
        ? `A viagem trabalhou de ${southReference} até ${northReference}. O sistema analisou todas as posições iniciais e finais de todas as largadas e selecionou o ponto mais ao Sul e o ponto mais ao Norte.`
        : "Não foi possível determinar os extremos Sul e Norte pelas posições registradas.",
      minLat,
      maxLat,
      minLon,
      maxLon,
      pointCount: points.length,
      southPoint,
      northPoint,
      southReference,
      northReference,
      // Compatibilidade com relatórios já existentes: start/end agora representam Sul/Norte.
      startPoint: southPoint,
      endPoint: northPoint,
      startReference: southReference,
      endReference: northReference,
      routeLabel,
    };
  }

  const regions = [...new Set(points.map((point) => COAST_BANDS.find((band) => point.lat >= band.min && point.lat < band.max)?.label).filter(Boolean))];
  const label = regions.length ? `${regions.join(" / ")} (aprox.)` : "Área oceânica registrada";
  const detail = `Área anual calculada pelas posições registradas: ${formatCoordinate(minLat, true)} a ${formatCoordinate(maxLat, true)} · ${formatCoordinate(minLon, false)} a ${formatCoordinate(maxLon, false)}.`;
  return {
    label, detail, minLat, maxLat, minLon, maxLon, pointCount: points.length,
    southPoint, northPoint, southReference, northReference,
    startPoint: southPoint, endPoint: northPoint,
    startReference: southReference, endReference: northReference, routeLabel,
  };
}

export function tripReportData(trip: any, sets: any[], catches: any[]) {
  const tripSets = sets
    .filter((item) => Number(item.tripId) === Number(trip.id))
    .sort((a, b) => reportNumber(a.setNumber) - reportNumber(b.setNumber));
  const tripCatches = catches.filter((item) => Number(item.tripId) === Number(trip.id));
  const sumType = (type: string) =>
    tripCatches
      .filter((item) => (item.catchType || "PRIMARY") === type)
      .reduce((sum, item) => sum + reportNumber(item.weightKg), 0);
  const primary = sumType("PRIMARY");
  const mixture = sumType("MIXTURE");
  const discard = sumType("DISCARD");
  const discardAlive = tripCatches
    .filter((item) => item.catchType === "DISCARD" && getDiscardCondition(item) === "VIVO")
    .reduce((sum, item) => sum + reportNumber(item.weightKg), 0);
  const discardDead = tripCatches
    .filter((item) => item.catchType === "DISCARD" && getDiscardCondition(item) === "MORTO")
    .reduce((sum, item) => sum + reportNumber(item.weightKg), 0);
  const discardUnknown = Math.max(0, discard - discardAlive - discardDead);
  const landed = primary + mixture;
  const target = reportNumber(trip.targetKg);
  const attainment = target > 0 ? (landed / target) * 100 : 0;
  const departure = new Date(trip.departureDate || "");
  const arrival = new Date(trip.returnDate || trip.expectedReturnDate || trip.departureDate || "");
  const duration = Number.isFinite(departure.getTime()) && Number.isFinite(arrival.getTime())
    ? Math.max(1, Math.ceil((arrival.getTime() - departure.getTime()) / 86400000))
    : 0;
  const species = new Map<string, { species: string; category: string; condition: string; total: number }>();
  tripCatches.forEach((item) => {
    const type = item.catchType || "PRIMARY";
    const category = type === "MIXTURE" ? "MISTURA" : type === "DISCARD" ? "DESCARTE" : "PRINCIPAL";
    const condition = type === "DISCARD" ? getDiscardCondition(item) : "—";
    const speciesName = item.species || (type === "PRIMARY" ? "Corvina" : "Não informada");
    const key = `${type}:${speciesName.toLocaleLowerCase("pt-BR")}:${condition}`;
    const current = species.get(key) || { species: speciesName, category, condition, total: 0 };
    current.total += reportNumber(item.weightKg);
    species.set(key, current);
  });
  return {
    tripSets,
    tripCatches,
    primary,
    mixture,
    discard,
    discardAlive,
    discardDead,
    discardUnknown,
    landed,
    target,
    attainment,
    duration,
    averageDay: duration ? landed / duration : 0,
    averageSet: tripSets.length ? landed / tripSets.length : 0,
    species: [...species.values()].sort((a, b) => b.total - a.total),
    geography: geographicSummary(tripSets),
  };
}

export function environmentalSummary(snapshots: any[]) {
  const complete = snapshots.filter((item) => item && (item.status === "COMPLETE" || item.status === "PARTIAL"));
  const average = (field: string) => {
    const values = complete.map((item) => Number(item?.[field])).filter((value) => Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const directions = (field: string) => {
    const counts = new Map<string, number>();
    complete.forEach((item) => {
      const value = String(item?.[field] || "").trim();
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  };
  return {
    count: complete.length,
    windSpeedKmh: average("windSpeedKmh"),
    gustKmh: average("gustKmh"),
    waveHeightM: average("waveHeightM"),
    swellHeightM: average("swellHeightM"),
    seaTemperatureC: average("seaTemperatureC"),
    currentKmh: average("currentKmh"),
    chlorophyllMgM3: average("chlorophyllMgM3"),
    seaLevelMslM: average("seaLevelMslM"),
    windDirection: directions("windDirection"),
    currentDirection: directions("currentDirection"),
  };
}

export function annualReportData(year: number, trips: any[], sets: any[], catches: any[], snapshots: any[] = []) {
  const yearTrips = trips.filter((trip) => trip.status === "FINISHED" && getTripYear(trip) === year);
  const tripIds = new Set(yearTrips.map((trip) => Number(trip.id)));
  const annualSets = sets.filter((item) => tripIds.has(Number(item.tripId)));
  const annualCatches = catches.filter((item) => tripIds.has(Number(item.tripId)));
  const annualSnapshots = snapshots.filter((item) => tripIds.has(Number(item.tripId)));
  const rows = yearTrips.map((trip) => ({ trip, report: tripReportData(trip, sets, catches) }));
  const landed = rows.reduce((sum, row) => sum + row.report.landed, 0);
  const primary = rows.reduce((sum, row) => sum + row.report.primary, 0);
  const mixture = rows.reduce((sum, row) => sum + row.report.mixture, 0);
  const discard = rows.reduce((sum, row) => sum + row.report.discard, 0);
  const discardAlive = rows.reduce((sum, row) => sum + row.report.discardAlive, 0);
  const discardDead = rows.reduce((sum, row) => sum + row.report.discardDead, 0);
  const discardUnknown = rows.reduce((sum, row) => sum + row.report.discardUnknown, 0);
  const days = rows.reduce((sum, row) => sum + row.report.duration, 0);
  const speciesMap = new Map<string, { species: string; category: string; condition: string; total: number }>();
  rows.forEach((row) => row.report.species.forEach((item) => {
    const key = `${item.category}:${item.species.toLocaleLowerCase("pt-BR")}:${item.condition}`;
    const current = speciesMap.get(key) || { ...item, total: 0 };
    current.total += item.total;
    speciesMap.set(key, current);
  }));
  return {
    year,
    trips: yearTrips,
    rows,
    sets: annualSets,
    catches: annualCatches,
    snapshots: annualSnapshots,
    tripCount: yearTrips.length,
    setCount: annualSets.length,
    days,
    landed,
    primary,
    mixture,
    discard,
    discardAlive,
    discardDead,
    discardUnknown,
    averageTrip: yearTrips.length ? landed / yearTrips.length : 0,
    averageSet: annualSets.length ? landed / annualSets.length : 0,
    averageDay: days ? landed / days : 0,
    species: [...speciesMap.values()].sort((a, b) => b.total - a.total),
    geography: geographicSummary(annualSets, "area"),
    environment: environmentalSummary(annualSnapshots),
  };
}
