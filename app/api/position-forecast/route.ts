import { createHash } from "node:crypto";
import { requirePanelUserResponse } from "../../../lib/panelAuth";
import { fetchNoaaChlorophyllGrid, fetchNoaaChlorophyllPoint } from "../../../lib/noaaChlorophyll";

export const maxDuration = 60;

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

async function fetchJson(url: URL, timeoutMs = 6500) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Falha na fonte externa (${response.status})`);
  return response.json();
}


function dateKeyInTimeZone(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const earthKm = 6371.0088;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchGeographicContext(lat: number, lon: number) {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lon),
      zoom: "10",
      addressdetails: "1",
      layer: "address",
      "accept-language": "pt-BR",
    }).toString();
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PainelDeBordoPescaIndustrial/1.0 (https://paineldebordo.vercel.app)",
      },
      signal: AbortSignal.timeout(4500),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const json = await response.json();
    const address = json?.address || {};
    const city = address.city || address.town || address.village || address.municipality || address.county || null;
    const state = address.state || address.region || address.state_district || null;
    const country = address.country || null;
    const matchedLat = Number(json?.lat);
    const matchedLon = Number(json?.lon);
    const distanceKm = Number.isFinite(matchedLat) && Number.isFinite(matchedLon)
      ? haversineKm(lat, lon, matchedLat, matchedLon)
      : null;
    if (!city && !state && !country) return null;
    return {
      city,
      state,
      country,
      label: [city, state].filter(Boolean).join(" — ") || state || country,
      distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
      source: "OpenStreetMap / Nominatim",
    };
  } catch {
    return null;
  }
}

async function fetchBathymetry(lat: number, lon: number) {
  try {
    const url = new URL("https://api.odb.ntu.edu.tw/gebco");
    url.search = new URLSearchParams({
      lon: String(lon),
      lat: String(lat),
      mode: "row,point",
    }).toString();
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const json = await response.json();
    const first = Array.isArray(json) ? json[0] : json;
    const rawZ = Array.isArray(first?.z) ? Number(first.z[0]) : Number(first?.z);
    if (!Number.isFinite(rawZ)) return null;
    return {
      elevationM: rawZ,
      depthM: rawZ < 0 ? Math.abs(rawZ) : 0,
      isWater: rawZ < 0,
      source: "GEBCO_2026 / Ocean Data Bank",
      resolution: "15 arc-second",
    };
  } catch {
    return null;
  }
}

async function fetchCentralWeather(lat: number, lon: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: TZ,
    wind_speed_unit: "kmh",
    forecast_days: "7",
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
    forecast_days: "7",
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


async function fetchCurrentSatelliteChlorophyll(lat: number, lon: number, requestUrl: string) {
  const username = String(process.env.COPERNICUSMARINE_SERVICE_USERNAME || "").trim();
  const password = String(process.env.COPERNICUSMARINE_SERVICE_PASSWORD || "").trim();
  if (!username || !password) return null;

  try {
    const endpoint = new URL("/api/copernicus-satellite-chlorophyll", requestUrl);
    endpoint.search = new URLSearchParams({ lat: String(lat), lon: String(lon) }).toString();
    const internalToken = createHash("sha256")
      .update(`${username}:${password}:painel-de-bordo-copernicus`)
      .digest("hex");
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "x-panel-copernicus": internalToken,
      },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Copernicus Satellite ${response.status}`);
    return response.json();
  } catch (error) {
    console.warn("Copernicus Marine satellite chlorophyll unavailable", error);
    return null;
  }
}

async function fetchWeeklyChlorophyllForecast(lat: number, lon: number, requestUrl: string) {
  const username = String(process.env.COPERNICUSMARINE_SERVICE_USERNAME || "").trim();
  const password = String(process.env.COPERNICUSMARINE_SERVICE_PASSWORD || "").trim();
  const days = Array.from({ length: 7 }, (_, index) => ({ date: dateKeyInTimeZone(index) }));

  if (!username || !password) {
    return {
      configured: false,
      source: "Copernicus Marine (configure usuário e senha gratuitos)",
      values: days.map((day) => ({ date: day.date, mgM3: null, model: null })),
    };
  }

  try {
    const endpoint = new URL("/api/copernicus-chlorophyll", requestUrl);
    endpoint.search = new URLSearchParams({ lat: String(lat), lon: String(lon), days: "7" }).toString();
    const internalToken = createHash("sha256")
      .update(`${username}:${password}:painel-de-bordo-copernicus`)
      .digest("hex");
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "x-panel-copernicus": internalToken,
      },
      signal: AbortSignal.timeout(5500),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Copernicus Marine ${response.status}`);
    const json = await response.json();
    const received = Array.isArray(json?.values) ? json.values : [];
    return {
      configured: true,
      source: json?.source || "Copernicus Marine / NEMO-PISCES",
      values: days.map((day) => {
        const item = received.find((row: any) => row?.date === day.date);
        const value = Number(item?.mgM3);
        return {
          date: day.date,
          mgM3: Number.isFinite(value) ? value : null,
          model: Number.isFinite(value) ? "Copernicus Marine / NEMO" : null,
        };
      }),
    };
  } catch (error) {
    console.warn("Copernicus Marine weekly chlorophyll unavailable", error);
    return {
      configured: true,
      source: "Copernicus Marine / NEMO-PISCES (temporariamente indisponível)",
      values: days.map((day) => ({ date: day.date, mgM3: null, model: null })),
    };
  }
}

function average(values: Array<number | null | undefined>) {
  const rows = values.map(Number).filter(Number.isFinite);
  if (!rows.length) return null;
  return rows.reduce((sum, value) => sum + value, 0) / rows.length;
}

function maximum(values: Array<number | null | undefined>) {
  const rows = values.map(Number).filter(Number.isFinite);
  return rows.length ? Math.max(...rows) : null;
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
    // Fontes externas podem ficar lentas no mar. Nenhuma fonte opcional deve
    // travar a página inteira: retornamos os dados disponíveis e marcamos
    // valores ausentes como null.
    const [weatherResult, marineResult, windResult, chlorophyllResult, currentChlorophyllResult, satelliteChlorophyllResult, weeklyChlorophyllResult, geographyResult, bathymetryResult] = await Promise.allSettled([
      fetchCentralWeather(lat, lon),
      fetchMarine(lat, lon),
      fetchWindGrid(grid),
      fetchNoaaChlorophyllGrid(grid, { timeoutMs: 4500 }),
      // NOAA/VIIRS fica como fallback do sistema atual por satélite.
      fetchNoaaChlorophyllPoint(lat, lon, { timeoutMs: 6500 }),
      // V223: fonte principal da clorofila ATUAL. É observação Ocean Colour
      // NRT por satélite e NÃO interfere na previsão Copernicus NEMO abaixo.
      fetchCurrentSatelliteChlorophyll(lat, lon, request.url),
      fetchWeeklyChlorophyllForecast(lat, lon, request.url),
      fetchGeographicContext(lat, lon),
      fetchBathymetry(lat, lon),
    ]);

    const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
    const marine = marineResult.status === "fulfilled" ? marineResult.value : null;
    const windGrid = windResult.status === "fulfilled"
      ? windResult.value
      : grid.map((point) => ({ ...point, speedKmh: null, directionDeg: null, direction: "—", gustKmh: null }));
    const noaaChlorophyllGrid = chlorophyllResult.status === "fulfilled"
      ? chlorophyllResult.value
      : grid.map((point) => ({ ...point, mgM3: null, time: null, source: null, dataset: null }));
    const currentChlorophyll = currentChlorophyllResult.status === "fulfilled"
      ? currentChlorophyllResult.value
      : null;
    const satelliteChlorophyll = satelliteChlorophyllResult.status === "fulfilled"
      ? satelliteChlorophyllResult.value
      : null;
    const satelliteGrid = Array.isArray(satelliteChlorophyll?.grid) ? satelliteChlorophyll.grid : [];
    const chlorophyllGrid = grid.map((point, index) => {
      const satellite = satelliteGrid.find((item: any) => item?.row === point.row && item?.col === point.col);
      if (Number.isFinite(Number(satellite?.mgM3))) {
        return {
          ...point,
          mgM3: Number(satellite.mgM3),
          time: satellite?.time || null,
          source: satellite?.source || satelliteChlorophyll?.source || "Copernicus Marine Ocean Colour · SATÉLITE NRT",
          dataset: satellite?.dataset || satelliteChlorophyll?.dataset || null,
        };
      }
      return noaaChlorophyllGrid[index] || { ...point, mgM3: null, time: null, source: null, dataset: null };
    });
    const weeklyChlorophyll = weeklyChlorophyllResult.status === "fulfilled"
      ? weeklyChlorophyllResult.value
      : { configured: false, source: "Copernicus Marine (temporariamente indisponível)", values: [] };
    const geography = geographyResult.status === "fulfilled" ? geographyResult.value : null;
    const bathymetry = bathymetryResult.status === "fulfilled" ? bathymetryResult.value : null;

    if (!weather && !marine) {
      return Response.json({ error: "As fontes de vento e mar estão demorando para responder. Tente novamente em alguns segundos." }, { status: 503 });
    }

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
    // V223: leitura ATUAL continua 100% por satélite, mas usa primeiro o
    // Copernicus Marine Ocean Colour NRT (observação multissensor). NOAA/VIIRS
    // permanece como fallback. A previsão NEMO/PISCES não foi alterada.
    const copernicusCurrent = satelliteChlorophyll?.current;
    const currentSatellite = copernicusCurrent?.mgM3 != null
      ? copernicusCurrent
      : (currentChlorophyll?.mgM3 != null ? currentChlorophyll : centralChl);
    const currentChlorophyllMgM3 = currentSatellite?.mgM3 ?? null;
    const currentChlorophyllSource = currentSatellite?.mgM3 != null
      ? (currentSatellite?.source || "NOAA CoastWatch / VIIRS · satélite")
      : null;
    const currentChlorophyllTime = currentSatellite?.time ?? null;

    const weeklyForecast = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = dateKeyInTimeZone(dayIndex);
      const weatherIndexes = weatherTimes.map((time, index) => String(time).slice(0, 10) === date ? index : -1).filter((index) => index >= 0);
      const marineIndexes = marineTimes.map((time, index) => String(time).slice(0, 10) === date ? index : -1).filter((index) => index >= 0);
      const middayTarget = new Date(`${date}T12:00:00-03:00`).getTime();
      const wi = weatherTimes.length ? nearestIndex(weatherTimes, middayTarget) : 0;
      const mi = marineTimes.length ? nearestIndex(marineTimes, middayTarget) : 0;
      const chl = Array.isArray(weeklyChlorophyll?.values)
        ? weeklyChlorophyll.values.find((item: any) => item?.date === date)
        : null;
      return {
        date,
        time: weatherTimes[wi] || marineTimes[mi] || `${date}T12:00:00`,
        windSpeedKmh: average(weatherIndexes.map((index) => weather?.hourly?.wind_speed_10m?.[index])) ?? weather?.hourly?.wind_speed_10m?.[wi] ?? null,
        windDirectionDeg: weather?.hourly?.wind_direction_10m?.[wi] ?? null,
        windDirection: directionName(weather?.hourly?.wind_direction_10m?.[wi]),
        gustKmh: maximum(weatherIndexes.map((index) => weather?.hourly?.wind_gusts_10m?.[index])) ?? weather?.hourly?.wind_gusts_10m?.[wi] ?? null,
        waveHeightM: maximum(marineIndexes.map((index) => marine?.hourly?.wave_height?.[index])) ?? marine?.hourly?.wave_height?.[mi] ?? null,
        waveDirection: directionName(marine?.hourly?.wave_direction?.[mi]),
        seaTemperatureC: average(marineIndexes.map((index) => marine?.hourly?.sea_surface_temperature?.[index])) ?? marine?.hourly?.sea_surface_temperature?.[mi] ?? null,
        currentKmh: average(marineIndexes.map((index) => marine?.hourly?.ocean_current_velocity?.[index])) ?? marine?.hourly?.ocean_current_velocity?.[mi] ?? null,
        currentDirection: directionName(marine?.hourly?.ocean_current_direction?.[mi]),
        chlorophyllMgM3: Number.isFinite(Number(chl?.mgM3)) ? Number(chl.mgM3) : null,
        chlorophyllModel: chl?.model || null,
      };
    });

    const forecast: any[] = [];
    const baseTimes = weatherTimes.length ? weatherTimes : marineTimes;
    const startIndex = baseTimes.length ? nearestIndex(baseTimes) : 0;
    const max = Math.min(baseTimes.length, 96);
    for (let i = Math.max(0, startIndex); i < max; i += 3) {
      const time = baseTimes[i];
      const wi = weatherTimes.length ? nearestIndex(weatherTimes, new Date(time).getTime()) : 0;
      const mi = marineTimes.length ? nearestIndex(marineTimes, new Date(time).getTime()) : 0;
      forecast.push({
        time,
        windSpeedKmh: weather?.hourly?.wind_speed_10m?.[wi] ?? null,
        windDirectionDeg: weather?.hourly?.wind_direction_10m?.[wi] ?? null,
        windDirection: directionName(weather?.hourly?.wind_direction_10m?.[wi]),
        gustKmh: weather?.hourly?.wind_gusts_10m?.[wi] ?? null,
        waveHeightM: marine?.hourly?.wave_height?.[mi] ?? null,
        waveDirectionDeg: marine?.hourly?.wave_direction?.[mi] ?? null,
        waveDirection: directionName(marine?.hourly?.wave_direction?.[mi]),
        wavePeriodS: marine?.hourly?.wave_period?.[mi] ?? null,
        swellHeightM: marine?.hourly?.swell_wave_height?.[mi] ?? null,
        swellDirectionDeg: marine?.hourly?.swell_wave_direction?.[mi] ?? null,
        swellDirection: directionName(marine?.hourly?.swell_wave_direction?.[mi]),
        swellPeriodS: marine?.hourly?.swell_wave_period?.[mi] ?? null,
        seaTemperatureC: marine?.hourly?.sea_surface_temperature?.[mi] ?? null,
        currentKmh: marine?.hourly?.ocean_current_velocity?.[mi] ?? null,
        currentDirectionDeg: marine?.hourly?.ocean_current_direction?.[mi] ?? null,
        currentDirection: directionName(marine?.hourly?.ocean_current_direction?.[mi]),
        seaLevelMslM: marine?.hourly?.sea_level_height_msl?.[mi] ?? null,
      });
      if (forecast.length >= 24) break;
    }

    return Response.json({
      queriedAt: new Date().toISOString(),
      position: {
        lat,
        lon,
        geography,
        depthM: bathymetry?.isWater ? bathymetry.depthM : null,
        bathymetry,
      },
      current: {
        ...current,
        chlorophyllMgM3: currentChlorophyllMgM3,
        chlorophyllTime: currentChlorophyllTime,
        chlorophyllSource: currentChlorophyllSource,
        condition: conditionLabel(current.windSpeedKmh, current.waveHeightM),
      },
      tide: { extrema },
      weeklyForecast,
      forecast,
      maps: {
        wind: windGrid.map((value, index) => ({ ...grid[index], ...value })),
        chlorophyll: chlorophyllGrid.map((value, index) => ({ ...grid[index], ...value })),
      },
      sources: {
        weather: weather ? "Open-Meteo Forecast" : "Open-Meteo Forecast (temporariamente indisponível)",
        marine: marine ? "Open-Meteo Marine" : "Open-Meteo Marine (temporariamente indisponível)",
        chlorophyll: currentChlorophyllSource
          || chlorophyllGrid.find((item: any) => item?.source)?.source
          || "NOAA CoastWatch / VIIRS (temporariamente indisponível)",
        chlorophyllForecast: weeklyChlorophyll?.source || "Copernicus Marine (temporariamente indisponível)",
        geography: geography ? "OpenStreetMap / Nominatim" : "Referência geográfica indisponível",
        bathymetry: bathymetry ? "GEBCO_2026 / Ocean Data Bank" : "Batimetria temporariamente indisponível",
      },
      disclaimer: "Previsão e dados modelados para apoio operacional. Maré/nível do mar não é referência de navegação costeira. Confirme condições de segurança em fontes marítimas oficiais.",
    });
  } catch (error) {
    console.error("position forecast error", error);
    return Response.json({ error: "Não foi possível consultar esta posição agora." }, { status: 502 });
  }
}
