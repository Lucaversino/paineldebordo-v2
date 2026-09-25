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

function erddapTimeConstraint(timeExpression: string) {
  // Para a leitura atual usamos índices relativos do ERDDAP (last-6:last),
  // que permitem recuperar a observação válida mais recente mesmo se a célula
  // do último dia estiver vazia por nuvem ou atraso do processamento.
  if (/^last(?:-\d+)?(?::\d+:last)?$/.test(timeExpression)) return `[${timeExpression}]`;
  return `[(${timeExpression})]`;
}

function erddapPointUrl(dataset: string, lat: number, lon: number, timeExpression: string) {
  const la = Math.max(-89.95, Math.min(89.95, lat));
  const lo = Math.max(-179.95, Math.min(179.95, lon));
  return `${ERDDAP}/${dataset}.csv?chlor_a${erddapTimeConstraint(timeExpression)}[(0.0)][(${la.toFixed(5)})][(${lo.toFixed(5)})]`;
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
    const valueIndex = headers.findIndex((item) => item === "chlor_a");
    const timeIndex = headers.findIndex((item) => item === "time");

    let latest: NoaaChlorophyllPoint | null = null;
    let latestTime = Number.NEGATIVE_INFINITY;
    for (const line of lines.slice(2)) {
      const cells = parseCsvLine(line);
      const value = validChlorophyll(cells[valueIndex >= 0 ? valueIndex : cells.length - 1]);
      if (value == null) continue;
      const rawTime = (cells[timeIndex >= 0 ? timeIndex : 0] || "").replace(/^"|"$/g, "") || null;
      const parsedTime = rawTime ? Date.parse(rawTime) : Number.NaN;
      const rank = Number.isFinite(parsedTime) ? parsedTime : latestTime + 1;
      if (latest && rank < latestTime) continue;
      latestTime = rank;
      latest = {
        lat,
        lon,
        mgM3: value,
        time: rawTime,
        source: dataset.label,
        dataset: dataset.id,
      };
    }
    return latest;
  } catch {
    return null;
  }
}

export async function fetchNoaaChlorophyllPoint(
  lat: number,
  lon: number,
  options: { timeoutMs?: number } = {},
): Promise<NoaaChlorophyllPoint> {
  // V223: consulta uma janela curta das 7 observações mais recentes. Em dados
  // ópticos de satélite, a célula do último dia pode estar vazia por nuvens;
  // usar somente "last" fazia o card atual ficar sem leitura mesmo havendo uma
  // observação válida de poucos dias atrás.
  const timeoutMs = options.timeoutMs ?? 5500;
  const attempts = await Promise.all(
    CURRENT_DATASETS.map((dataset) => fetchDatasetPoint(dataset, lat, lon, "last-6:1:last", timeoutMs)),
  );
  const valid = attempts.filter((row): row is NoaaChlorophyllPoint => row?.mgM3 != null);
  valid.sort((a, b) => {
    const taParsed = a.time ? Date.parse(a.time) : Number.NaN;
    const tbParsed = b.time ? Date.parse(b.time) : Number.NaN;
    const ta = Number.isFinite(taParsed) ? taParsed : Number.NEGATIVE_INFINITY;
    const tb = Number.isFinite(tbParsed) ? tbParsed : Number.NEGATIVE_INFINITY;
    return tb - ta;
  });
  return valid[0] || { lat, lon, mgM3: null, time: null, source: null, dataset: null };
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
  // Nos datasets VIIRS do CoastWatch o eixo de latitude é decrescente (N -> S).
  // Em consultas griddap por faixa, portanto, latitude precisa ir de maxLat para minLat.
  // V223: inclui as 3 observações mais recentes. Isso mantém o mapa atual
  // disponível quando o último mosaico ainda tem células vazias por nuvens.
  return `${ERDDAP}/${dataset}.csv?chlor_a[last-2:1:last][(0.0)][(${maxLat.toFixed(5)}):1:(${minLat.toFixed(5)})][(${minLon.toFixed(5)}):1:(${maxLon.toFixed(5)})]`;
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
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const latScale = 111.32;
    const lonScale = 111.32 * Math.cos((point.lat * Math.PI) / 180);
    const dy = (row.lat - point.lat) * latScale;
    const dx = (row.lon - point.lon) * lonScale;
    const distanceKm = Math.hypot(dx, dy);
    if (distanceKm > 18) continue;
    const parsedTime = row.time ? Date.parse(row.time) : Number.NaN;
    const rowTime = Number.isFinite(parsedTime) ? parsedTime : Number.NEGATIVE_INFINITY;
    if (rowTime > bestTime || (rowTime === bestTime && distanceKm < bestDistance)) {
      bestTime = rowTime;
      bestDistance = distanceKm;
      best = row;
    }
  }
  // Só usamos amostras próximas da célula solicitada; dentro desse raio,
  // a observação mais recente tem prioridade e a distância desempata.
  return best;
}

export async function fetchNoaaChlorophyllGrid<T extends { lat: number; lon: number }>(
  points: T[],
  options: { timeoutMs?: number } = {},
): Promise<Array<T & NoaaChlorophyllPoint>> {
  const timeoutMs = options.timeoutMs ?? 4500;
  if (!points.length) return [];

  // Importante: não fazer fallback sequencial aqui. A tela de previsão tem prazo
  // próprio e a clorofila é uma fonte opcional; vento/mar nunca podem parar por ela.
  const datasetRows = await Promise.all(
    CURRENT_DATASETS.map((dataset) => fetchDatasetGrid(dataset, points, timeoutMs)),
  );

  const resolved: Array<(T & NoaaChlorophyllPoint) | null> = points.map(() => null);
  for (let i = 0; i < points.length; i++) {
    const candidates = datasetRows
      .map((rows, priority) => ({ sample: nearestGridSample(points[i], rows), priority }))
      .filter((item): item is { sample: DatasetGridRow; priority: number } => item.sample != null);
    candidates.sort((a, b) => {
      const taParsed = a.sample.time ? Date.parse(a.sample.time) : Number.NaN;
      const tbParsed = b.sample.time ? Date.parse(b.sample.time) : Number.NaN;
      const ta = Number.isFinite(taParsed) ? taParsed : Number.NEGATIVE_INFINITY;
      const tb = Number.isFinite(tbParsed) ? tbParsed : Number.NEGATIVE_INFINITY;
      if (ta !== tb) return tb - ta;
      return a.priority - b.priority;
    });
    const sample = candidates[0]?.sample;
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
  const timeoutMs = options.timeoutMs ?? 4000;
  const date = String(isoDate).slice(0, 10);
  const timeExpression = `${date}T12:00:00Z`;
  const attempts = await Promise.all(
    HISTORICAL_DATASETS.map((dataset) => fetchDatasetPoint(dataset, lat, lon, timeExpression, timeoutMs)),
  );
  for (const row of attempts) {
    if (row?.mgM3 != null) return row;
  }
  return { lat, lon, mgM3: null, time: null, source: null, dataset: null };
}
