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
  { min: -26.0, max: -24.8, label: "Costa do Paraná" },
  { min: -24.8, max: -22.6, label: "Costa de São Paulo" },
  { min: -22.6, max: -20.3, label: "Costa do Rio de Janeiro" },
];

// Referências operacionais usadas apenas para deixar o relatório fácil de compreender.
// Não são geocodificação: representam grandes faixas costeiras de trabalho da pesca.
const COASTAL_ROUTE_BANDS = [
  { min: -34.5, max: -32.2, label: "Chuí, RS" },
  { min: -32.2, max: -30.8, label: "Rio Grande, RS" },
  { min: -30.8, max: -29.2, label: "Tramandaí, RS" },
  { min: -29.2, max: -27.4, label: "Imbituba, SC" },
  { min: -27.4, max: -26.45, label: "Itajaí, SC" },
  { min: -26.45, max: -25.65, label: "São Francisco do Sul, SC" },
  { min: -25.65, max: -24.75, label: "Cananéia, SP" },
  { min: -24.75, max: -23.35, label: "Santos, SP" },
  { min: -23.35, max: -22.65, label: "Ubatuba, SP" },
  { min: -22.65, max: -21.7, label: "Cabo Frio, RJ" },
  { min: -21.7, max: -20.3, label: "Campos dos Goytacazes, RJ" },
];

type GeographicPoint = {
  lat: number;
  lon: number;
  setNumber?: number | string | null;
  endpoint: "INICIAL" | "FINAL";
};

export function approximateFishingRegion(latValue: unknown) {
  const lat = Number(latValue);
  if (!Number.isFinite(lat)) return "Região não determinada";
  return COASTAL_ROUTE_BANDS.find((band) => lat >= band.min && lat < band.max)?.label
    || COAST_BANDS.find((band) => lat >= band.min && lat < band.max)?.label
    || "Área oceânica registrada";
}

export function formatGeographicPoint(point?: { lat: number; lon: number } | null) {
  if (!point) return "—";
  return `${formatCoordinate(point.lat, true)} / ${formatCoordinate(point.lon, false)}`;
}

export function geographicSummary(sets: any[]) {
  const points: GeographicPoint[] = [];
  sets.forEach((set) => {
    const candidates: Array<[unknown, unknown, "INICIAL" | "FINAL"]> = [
      [set.startLatitude, set.startLongitude, "INICIAL"],
      [set.endLatitude, set.endLongitude, "FINAL"],
    ];
    candidates.forEach(([latValue, lonValue, endpoint]) => {
      const lat = Number(latValue);
      const lon = Number(lonValue);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        points.push({ lat, lon, setNumber: set.setNumber, endpoint });
      }
    });
  });

  if (!points.length) {
    return {
      label: "Região não determinada",
      routeLabel: "A viagem não possui posições suficientes para calcular os extremos.",
      detail: "Esta viagem não possui posições suficientes para calcular a área trabalhada.",
      minLat: null,
      maxLat: null,
      minLon: null,
      maxLon: null,
      southPoint: null,
      northPoint: null,
      southRegion: "Região não determinada",
      northRegion: "Região não determinada",
      pointCount: 0,
    };
  }

  // REGRA V192 FIX4 / V193 FIX:
  // analisa TODAS as posições inicial e final de TODAS as largadas.
  // O ponto mais ao Sul mantém a longitude do MESMO ponto encontrado.
  // O ponto mais ao Norte mantém a longitude do MESMO ponto encontrado.
  const southPoint = points.reduce((south, point) => (point.lat < south.lat ? point : south), points[0]);
  const northPoint = points.reduce((north, point) => (point.lat > north.lat ? point : north), points[0]);

  // Mantidos para compatibilidade com relatórios/rotinas antigas, mas não são mais usados
  // para formar o trajeto da viagem, evitando misturar latitude de um ponto com longitude de outro.
  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const southRegion = approximateFishingRegion(southPoint.lat);
  const northRegion = approximateFishingRegion(northPoint.lat);
  const label = `${southRegion} → ${northRegion}`;
  const routeLabel = `A VIAGEM FOI DE: ${southRegion} ATÉ ${northRegion}`;
  const detail = `Extremos calculados analisando as posições iniciais e finais de todas as largadas. Mais ao Sul: ${formatGeographicPoint(southPoint)}. Mais ao Norte: ${formatGeographicPoint(northPoint)}.`;

  return {
    label,
    routeLabel,
    detail,
    minLat,
    maxLat,
    minLon,
    maxLon,
    southPoint,
    northPoint,
    southRegion,
    northRegion,
    pointCount: points.length,
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
    geography: geographicSummary(annualSets),
    environment: environmentalSummary(annualSnapshots),
  };
}
