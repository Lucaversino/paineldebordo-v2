import { requirePanelUserResponse } from "../../../lib/panelAuth";

const TZ = "America/Sao_Paulo";

function directionName(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const normalized = ((Number(value) % 360) + 360) % 360;
  const names = ["Norte", "Nordeste", "Leste", "Sudeste", "Sul", "Sudoeste", "Oeste", "Noroeste"];
  return names[Math.round(normalized / 45) % 8];
}

function nearestIndex(times: string[], now = Date.now()) {
  if (!times?.length) return 0;
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(new Date(times[i]).getTime() - now);
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return best;
}

async function fetchJson(url: URL, timeoutMs = 9000) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Falha na fonte externa (${response.status})`);
  return response.json();
}

async function fetchCentralWeather(lat: number, lon: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: TZ,
    wind_speed_unit: "kmh",
    forecast_days: "4",
    current: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
  }).toString();
  return fetchJson(url);
}

async function fetchMarine(lat: number, lon: number) {
  const url = new URL("https://marine-api.open-meteo.com/v1/marine");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: TZ,
    forecast_days: "4",
    hourly: [
      "wave_height",
      "wave_direction",
      "wave_period",
      "swell_wave_height",
      "swell_wave_direction",
      "swell_wave_period",
      "sea_surface_temperature",
      "ocean_current_velocity",
      "ocean_current_direction",
      "sea_level_height_msl",
    ].join(","),
  }).toString();
  return fetchJson(url);
}

async function fetchWindGrid(points: { lat: number; lon: number }[]) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(5)).join(","),
    longitude: points.map((p) => p.lon.toFixed(5)).join(","),
    timezone: TZ,
    wind_speed_unit: "kmh",
    current: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
  }).toString();
  const raw = await fetchJson(url);
  const rows = Array.isArray(raw) ? raw : [raw];
  return points.map((point, index) => {
    const current = rows[index]?.current || null;
    return {
      ...point,
      speedKmh: current?.wind_speed_10m ?? null,
      directionDeg: current?.wind_direction_10m ?? null,
      direction: directionName(current?.wind_direction_10m),
      gustKmh: current?.wind_gusts_10m ?? null,
    };
  });
}

async function fetchChlorophyllPoint(lat: number, lon: number) {
  // Produto diário gap-filled do NOAA CoastWatch. Útil para visualização espacial,
  // mas continua sendo observação satelital/modelada e não um sensor local em tempo real.
  const endpoint = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNnoaaSNPPnoaa20chlaGapfilledDaily.csv?chlor_a[(last)][(0.0)][(${lat.toFixed(5)})][(${lon.toFixed(5)})]`;
  try {
    const response = await fetch(endpoint, {
      headers: { accept: "text/csv" },
      signal: AbortSignal.timeout(6500),
      cache: "no-store",
    });
    if (!response.ok) return { lat, lon, mgM3: null, time: null };
    const text = await response.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 3) return { lat, lon, mgM3: null, time: null };
    const cells = lines[2].split(",");
    const value = Number(cells.at(-1));
    const time = cells[0]?.replace(/"/g, "") || null;
    return { lat, lon, mgM3: Number.isFinite(value) ? value : null, time };
  } catch {
    return { lat, lon, mgM3: null, time: null };
  }
}

function buildGrid(lat: number, lon: number) {
  const step = 0.18; // ~20 km de latitude; visualização simples da área ao redor.
  const points: { lat: number; lon: number; row: number; col: number }[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      points.push({
        lat: lat + (1 - row) * step,
        lon: lon + (col - 1) * step,
        row,
        col,
      });
    }
  }
  return points;
}

function tideExtrema(times: string[], levels: Array<number | null>, startIndex: number) {
  const result: Array<{ type: "HIGH" | "LOW"; time: string; height: number }> = [];
  for (let i = Math.max(1, startIndex); i < Math.min(levels.length - 1, startIndex + 60); i++) {
    const prev = Number(levels[i - 1]);
    const value = Number(levels[i]);
    const next = Number(levels[i + 1]);
    if (![prev, value, next].every(Number.isFinite)) continue;
    if (value > prev && value >= next) result.push({ type: "HIGH", time: times[i], height: value });
    if (value < prev && value <= next) result.push({ type: "LOW", time: times[i], height: value });
    if (result.length >= 5) break;
  }
  return result;
}

function conditionLabel(wind: number | null, wave: number | null) {
  const w = Number(wind);
  const h = Number(wave);
  if ((Number.isFinite(w) && w >= 35) || (Number.isFinite(h) && h >= 2.5)) return "Atenção";
  if ((Number.isFinite(w) && w >= 20) || (Number.isFinite(h) && h >= 1.5)) return "Moderado";
  return "Mais calmo";
}

export async function GET(request: Request) {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return Response.json({ error: "Latitude ou longitude inválida." }, { status: 400 });
  }

  try {
    const grid = buildGrid(lat, lon);
    const [weather, marine, windGrid, chlorophyllGrid] = await Promise.all([
      fetchCentralWeather(lat, lon),
      fetchMarine(lat, lon),
      fetchWindGrid(grid),
      Promise.all(grid.map((point) => fetchChlorophyllPoint(point.lat, point.lon))),
    ]);

    const marineTimes: string[] = marine?.hourly?.time || [];
    const weatherTimes: string[] = weather?.hourly?.time || [];
    const marineIndex = nearestIndex(marineTimes);
    const weatherIndex = nearestIndex(weatherTimes);
    const levels: Array<number | null> = marine?.hourly?.sea_level_height_msl || [];
    const extrema = tideExtrema(marineTimes, levels, marineIndex);

    const current = {
      time: weather?.current?.time || weatherTimes[weatherIndex] || null,
      windSpeedKmh: weather?.current?.wind_speed_10m ?? weather?.hourly?.wind_speed_10m?.[weatherIndex] ?? null,
      windDirectionDeg: weather?.current?.wind_direction_10m ?? weather?.hourly?.wind_direction_10m?.[weatherIndex] ?? null,
      windDirection: directionName(weather?.current?.wind_direction_10m ?? weather?.hourly?.wind_direction_10m?.[weatherIndex]),
      gustKmh: weather?.current?.wind_gusts_10m ?? weather?.hourly?.wind_gusts_10m?.[weatherIndex] ?? null,
      waveHeightM: marine?.hourly?.wave_height?.[marineIndex] ?? null,
      waveDirectionDeg: marine?.hourly?.wave_direction?.[marineIndex] ?? null,
      waveDirection: directionName(marine?.hourly?.wave_direction?.[marineIndex]),
      wavePeriodS: marine?.hourly?.wave_period?.[marineIndex] ?? null,
      swellHeightM: marine?.hourly?.swell_wave_height?.[marineIndex] ?? null,
      swellDirectionDeg: marine?.hourly?.swell_wave_direction?.[marineIndex] ?? null,
      swellDirection: directionName(marine?.hourly?.swell_wave_direction?.[marineIndex]),
      swellPeriodS: marine?.hourly?.swell_wave_period?.[marineIndex] ?? null,
      seaTemperatureC: marine?.hourly?.sea_surface_temperature?.[marineIndex] ?? null,
      currentKmh: marine?.hourly?.ocean_current_velocity?.[marineIndex] ?? null,
      currentDirectionDeg: marine?.hourly?.ocean_current_direction?.[marineIndex] ?? null,
      currentDirection: directionName(marine?.hourly?.ocean_current_direction?.[marineIndex]),
      seaLevelMslM: levels[marineIndex] ?? null,
    };

    const centralChl = chlorophyllGrid.find((p, i) => grid[i]?.row === 1 && grid[i]?.col === 1) || null;

    const forecast: any[] = [];
    const max = Math.min(weatherTimes.length, 96);
    for (let i = Math.max(0, weatherIndex); i < max; i += 3) {
      const time = weatherTimes[i];
      const mi = marineTimes.length ? nearestIndex(marineTimes, new Date(time).getTime()) : 0;
      forecast.push({
        time,
        windSpeedKmh: weather?.hourly?.wind_speed_10m?.[i] ?? null,
        windDirectionDeg: weather?.hourly?.wind_direction_10m?.[i] ?? null,
        windDirection: directionName(weather?.hourly?.wind_direction_10m?.[i]),
        gustKmh: weather?.hourly?.wind_gusts_10m?.[i] ?? null,
        waveHeightM: marine?.hourly?.wave_height?.[mi] ?? null,
        wavePeriodS: marine?.hourly?.wave_period?.[mi] ?? null,
        seaTemperatureC: marine?.hourly?.sea_surface_temperature?.[mi] ?? null,
        seaLevelMslM: marine?.hourly?.sea_level_height_msl?.[mi] ?? null,
      });
      if (forecast.length >= 24) break;
    }

    return Response.json({
      position: { lat, lon },
      current: {
        ...current,
        chlorophyllMgM3: centralChl?.mgM3 ?? null,
        chlorophyllTime: centralChl?.time ?? null,
        condition: conditionLabel(current.windSpeedKmh, current.waveHeightM),
      },
      tide: { extrema },
      forecast,
      maps: {
        wind: windGrid.map((value, index) => ({ ...grid[index], ...value })),
        chlorophyll: chlorophyllGrid.map((value, index) => ({ ...grid[index], ...value })),
      },
      sources: {
        weather: "Open-Meteo Forecast",
        marine: "Open-Meteo Marine",
        chlorophyll: "NOAA CoastWatch / VIIRS gap-filled daily",
      },
      disclaimer: "Previsão e dados modelados para apoio operacional. Maré/nível do mar não é referência de navegação costeira. Confirme condições de segurança em fontes marítimas oficiais.",
    });
  } catch (error) {
    console.error("position forecast error", error);
    return Response.json({ error: "Não foi possível consultar esta posição agora." }, { status: 502 });
  }
}
