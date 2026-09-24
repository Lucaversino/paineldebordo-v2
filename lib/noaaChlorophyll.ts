/**
 * Leitura robusta de clorofila-a por satélite via NOAA CoastWatch ERDDAP.
 *
 * Estratégia:
 * 1. VIIRS S-NPP + NOAA-20 NRT gap-filled (melhor para uso operacional recente).
 * 2. NOAA-20 VIIRS NRT 4 km.
 * 3. S-NPP VIIRS NRT 4 km.
 * 4. VIIRS science-quality gap-filled (fallback mais estável, porém pode chegar com atraso).
 *
 * Todas as chamadas acontecem no servidor, evitando CORS no navegador.
 */

const ERDDAP = "https://coastwatch.pfeg.noaa.gov/erddap/griddap";

const CURRENT_DATASETS = [
  {
    id: "nesdisVHNnoaaSNPPnoaa20NRTchlaGapfilledDaily",
    label: "NOAA CoastWatch / VIIRS S-NPP + NOAA-20 · NRT gap-filled",
  },
  {
    id: "nesdisVHNnoaa20chlaDaily",
    label: "NOAA CoastWatch / NOAA-20 VIIRS · NRT 4 km",
  },
  {
    id: "nesdisVHNchlaDaily",
    label: "NOAA CoastWatch / S-NPP VIIRS · NRT 4 km",
  },
  {
    id: "nesdisVHNnoaaSNPPnoaa20chlaGapfilledDaily",
    label: "NOAA CoastWatch / VIIRS · science-quality gap-filled",
  },
] as const;

const HISTORICAL_DATASETS = [
  {
    id: "nesdisVHNSQchlaDaily",
    label: "NOAA CoastWatch / S-NPP VIIRS · science-quality 4 km",
  },
  {
    id: "nesdisVHNnoaa20chlaDaily",
    label: "NOAA CoastWatch / NOAA-20 VIIRS · 4 km",
  },
  {
    id: "nesdisVHNchlaDaily",
    label: "NOAA CoastWatch / S-NPP VIIRS · 4 km",
  },
] as const;

export type NoaaChlorophyllPoint = {
  lat: number;
  lon: number;
  mgM3: number | null;
  time: string | null;
  source: string | null;
  dataset: string | null;
};

function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function validChlorophyll(value: unknown) {
  const n = Number(value);
  // Valores <=0, fill values e absurdos não devem entrar no mapa.
  return Number.isFinite(n) && n >= 0.001 && n <= 1000 ? n : null;
}

function erddapPointUrl(dataset: string, lat: number, lon: number, timeExpression: string) {
  const la = Math.max(-89.95, Math.min(89.95, lat));
  const lo = Math.max(-179.95, Math.min(179.95, lon));
  return `${ERDDAP}/${dataset}.csv?chlor_a[(${timeExpression})][(0.0)][(${la.toFixed(5)})][(${lo.toFixed(5)})]`;
}

async function fetchDatasetPoint(
  dataset: { id: string; label: string },
  lat: number,
  lon: number,
  timeExpression: string,
  timeoutMs: number,
): Promise<NoaaChlorophyllPoint | null> {
  try {
    const response = await fetch(erddapPointUrl(dataset.id, lat, lon, timeExpression), {
      headers: {
        accept: "text/csv",
        "user-agent": "PainelDeBordoPescaIndustrial/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;

    const text = await response.text();
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    // ERDDAP .csv normalmente retorna: cabeçalho, unidades e dados.
    if (lines.length < 3) return null;
    const headers = parseCsvLine(lines[0]).map((item) => item.replace(/^"|"$/g, ""));
    const cells = parseCsvLine(lines[2]);
    const valueIndex = headers.findIndex((item) => item === "chlor_a");
    const timeIndex = headers.findIndex((item) => item === "time");
    const value = validChlorophyll(cells[valueIndex >= 0 ? valueIndex : cells.length - 1]);
    if (value == null) return null;

    return {
      lat,
      lon,
      mgM3: value,
      time: (cells[timeIndex >= 0 ? timeIndex : 0] || "").replace(/^"|"$/g, "") || null,
      source: dataset.label,
      dataset: dataset.id,
    };
  } catch {
    return null;
  }
}

export async function fetchNoaaChlorophyllPoint(
  lat: number,
  lon: number,
  options: { timeoutMs?: number } = {},
): Promise<NoaaChlorophyllPoint> {
  const timeoutMs = options.timeoutMs ?? 6500;
  for (const dataset of CURRENT_DATASETS) {
    const row = await fetchDatasetPoint(dataset, lat, lon, "last", timeoutMs);
    if (row) return row;
  }
  return { lat, lon, mgM3: null, time: null, source: null, dataset: null };
}

type DatasetGridRow = {
  lat: number;
  lon: number;
  mgM3: number;
  time: string | null;
  source: string;
  dataset: string;
};

function erddapGridUrl(dataset: string, points: Array<{ lat: number; lon: number }>) {
  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  // Pequena margem garante que a grade nativa do satélite contenha amostras
  // suficientes mesmo quando os pontos solicitados ficam entre células.
  const minLat = Math.max(-89.95, Math.min(...lats) - 0.05);
  const maxLat = Math.min(89.95, Math.max(...lats) + 0.05);
  const minLon = Math.max(-179.95, Math.min(...lons) - 0.05);
  const maxLon = Math.min(179.95, Math.max(...lons) + 0.05);
  return `${ERDDAP}/${dataset}.csv?chlor_a[(last)][(0.0)][(${minLat.toFixed(5)}):1:(${maxLat.toFixed(5)})][(${minLon.toFixed(5)}):1:(${maxLon.toFixed(5)})]`;
}

async function fetchDatasetGrid(
  dataset: { id: string; label: string },
  points: Array<{ lat: number; lon: number }>,
  timeoutMs: number,
): Promise<DatasetGridRow[]> {
  try {
    const response = await fetch(erddapGridUrl(dataset.id, points), {
      headers: {
        accept: "text/csv",
        "user-agent": "PainelDeBordoPescaIndustrial/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return [];
    const text = await response.text();
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 3) return [];

    const headers = parseCsvLine(lines[0]).map((item) => item.replace(/^"|"$/g, ""));
    const timeIndex = headers.findIndex((item) => item === "time");
    const latIndex = headers.findIndex((item) => item === "latitude");
    const lonIndex = headers.findIndex((item) => item === "longitude");
    const valueIndex = headers.findIndex((item) => item === "chlor_a");
    if (latIndex < 0 || lonIndex < 0 || valueIndex < 0) return [];

    const rows: DatasetGridRow[] = [];
    for (const line of lines.slice(2)) {
      const cells = parseCsvLine(line);
      const sampleLat = Number(cells[latIndex]);
      const sampleLon = Number(cells[lonIndex]);
      const value = validChlorophyll(cells[valueIndex]);
      if (!Number.isFinite(sampleLat) || !Number.isFinite(sampleLon) || value == null) continue;
      rows.push({
        lat: sampleLat,
        lon: sampleLon,
        mgM3: value,
        time: timeIndex >= 0 ? (cells[timeIndex] || "").replace(/^"|"$/g, "") || null : null,
        source: dataset.label,
        dataset: dataset.id,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

function nearestGridSample(point: { lat: number; lon: number }, rows: DatasetGridRow[]) {
  let best: DatasetGridRow | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const latScale = 111.32;
    const lonScale = 111.32 * Math.cos((point.lat * Math.PI) / 180);
    const dy = (row.lat - point.lat) * latScale;
    const dx = (row.lon - point.lon) * lonScale;
    const distanceKm = Math.hypot(dx, dy);
    if (distanceKm < bestDistance) {
      bestDistance = distanceKm;
      best = row;
    }
  }
  // A grade pedida cobre cerca de 40 km. Não atribuímos uma amostra distante
  // caso a fonte tenha devolvido apenas uma célula isolada.
  return best && bestDistance <= 18 ? best : null;
}

export async function fetchNoaaChlorophyllGrid<T extends { lat: number; lon: number }>(
  points: T[],
  options: { timeoutMs?: number } = {},
): Promise<Array<T & NoaaChlorophyllPoint>> {
  const timeoutMs = options.timeoutMs ?? 7500;
  if (!points.length) return [];

  const resolved: Array<(T & NoaaChlorophyllPoint) | null> = points.map(() => null);

  // Uma única consulta por dataset cobre a área toda. Se houver buracos (nuvem,
  // atraso ou manutenção), somente os pontos faltantes seguem para a próxima fonte.
  for (const dataset of CURRENT_DATASETS) {
    const rows = await fetchDatasetGrid(dataset, points, timeoutMs);
    if (!rows.length) continue;
    for (let i = 0; i < points.length; i++) {
      if (resolved[i]?.mgM3 != null) continue;
      const sample = nearestGridSample(points[i], rows);
      if (!sample) continue;
      resolved[i] = {
        ...points[i],
        lat: points[i].lat,
        lon: points[i].lon,
        mgM3: sample.mgM3,
        time: sample.time,
        source: sample.source,
        dataset: sample.dataset,
      };
    }
    if (resolved.every((row) => row?.mgM3 != null)) break;
  }

  return resolved.map((row, index) => row || {
    ...points[index],
    lat: points[index].lat,
    lon: points[index].lon,
    mgM3: null,
    time: null,
    source: null,
    dataset: null,
  });
}

export async function fetchNoaaHistoricalChlorophyll(
  lat: number,
  lon: number,
  isoDate: string,
  options: { timeoutMs?: number } = {},
): Promise<NoaaChlorophyllPoint> {
  const timeoutMs = options.timeoutMs ?? 6500;
  const date = String(isoDate).slice(0, 10);
  const timeExpression = `${date}T12:00:00Z`;
  for (const dataset of HISTORICAL_DATASETS) {
    const row = await fetchDatasetPoint(dataset, lat, lon, timeExpression, timeoutMs);
    if (row) return row;
  }
  return { lat, lon, mgM3: null, time: null, source: null, dataset: null };
}
