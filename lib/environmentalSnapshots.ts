import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { fetchNoaaHistoricalChlorophyll } from "./noaaChlorophyll";

const TZ = "America/Sao_Paulo";
const UTC_OFFSET = "-03:00";

export type EnvironmentalSnapshot = {
  id?: number;
  ownerId: string;
  tripId: number;
  fishingSetId: number;
  latitude: number | null;
  longitude: number | null;
  referenceTime: string;
  sourceMode: string;
  status: string;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  windDirection: string | null;
  gustKmh: number | null;
  waveHeightM: number | null;
  waveDirectionDeg: number | null;
  waveDirection: string | null;
  wavePeriodS: number | null;
  swellHeightM: number | null;
  swellDirectionDeg: number | null;
  swellDirection: string | null;
  swellPeriodS: number | null;
  seaTemperatureC: number | null;
  currentKmh: number | null;
  currentDirectionDeg: number | null;
  currentDirection: string | null;
  seaLevelMslM: number | null;
  chlorophyllMgM3: number | null;
  chlorophyllTime: string | null;
  lunarPhase: string | null;
  lunarIllumination: number | null;
  sunrise: string | null;
  sunset: string | null;
  payload: any;
  capturedAt?: string;
  errorText?: string | null;
};

function asNumber(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function directionName(value: unknown) {
  const n = asNumber(value);
  if (n == null) return null;
  const normalized = ((n % 360) + 360) % 360;
  const names = ["Norte", "Nordeste", "Leste", "Sudeste", "Sul", "Sudoeste", "Oeste", "Noroeste"];
  return names[Math.round(normalized / 45) % 8];
}

function toBrazilMs(value: string) {
  if (!value) return NaN;
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) return new Date(value).getTime();
  return new Date(`${value}${UTC_OFFSET}`).getTime();
}

function nearestIndex(times: string[], referenceTime: string) {
  if (!times.length) return 0;
  const target = toBrazilMs(referenceTime);
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const distance = Math.abs(toBrazilMs(times[i]) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

function dayOf(referenceTime: string) {
  return String(referenceTime || "").slice(0, 10);
}

function lunarInfo(referenceTime: string) {
  const ms = toBrazilMs(referenceTime);
  if (!Number.isFinite(ms)) return { phase: null, illumination: null, ageDays: null };
  const synodic = 29.530588853;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  let age = ((ms - knownNewMoon) / 86400000) % synodic;
  if (age < 0) age += synodic;
  const illumination = (1 - Math.cos((2 * Math.PI * age) / synodic)) / 2;
  const phase = age < 1.85 || age >= 27.68
    ? "Lua nova"
    : age < 7.38
      ? "Crescente"
      : age < 9.23
        ? "Quarto crescente"
        : age < 14.77
          ? "Gibosa crescente"
          : age < 16.61
            ? "Lua cheia"
            : age < 22.15
              ? "Gibosa minguante"
              : age < 24.00
                ? "Quarto minguante"
                : "Minguante";
  return { phase, illumination, ageDays: age };
}

async function fetchJson(url: URL, timeoutMs = 5500) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Fonte externa respondeu ${response.status}`);
  return response.json();
}

async function fetchWeather(lat: number, lon: number, referenceTime: string, historical: boolean) {
  const date = dayOf(referenceTime);
  const base = historical
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";
  const url = new URL(base);
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: TZ,
    wind_speed_unit: "kmh",
    start_date: date,
    end_date: date,
    hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    daily: "sunrise,sunset",
  }).toString();
  return fetchJson(url, 5500);
}

async function fetchMarine(lat: number, lon: number, referenceTime: string) {
  const date = dayOf(referenceTime);
  const url = new URL("https://marine-api.open-meteo.com/v1/marine");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: TZ,
    start_date: date,
    end_date: date,
    cell_selection: "sea",
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
  return fetchJson(url, 6000);
}

async function fetchHistoricalChlorophyll(lat: number, lon: number, referenceTime: string) {
  const row = await fetchNoaaHistoricalChlorophyll(lat, lon, referenceTime, { timeoutMs: 4000 });
  return { mgM3: row.mgM3, time: row.time, source: row.source };
}

function compactDayForecast(weather: any, marine: any) {
  const weatherTimes: string[] = weather?.hourly?.time || [];
  const marineTimes: string[] = marine?.hourly?.time || [];
  const baseTimes = weatherTimes.length ? weatherTimes : marineTimes;
  const rows: any[] = [];
  for (let i = 0; i < baseTimes.length; i += 3) {
    const time = baseTimes[i];
    const wi = weatherTimes.length ? nearestIndex(weatherTimes, time) : 0;
    const mi = marineTimes.length ? nearestIndex(marineTimes, time) : 0;
    rows.push({
      time,
      windSpeedKmh: weather?.hourly?.wind_speed_10m?.[wi] ?? null,
      windDirectionDeg: weather?.hourly?.wind_direction_10m?.[wi] ?? null,
      gustKmh: weather?.hourly?.wind_gusts_10m?.[wi] ?? null,
      waveHeightM: marine?.hourly?.wave_height?.[mi] ?? null,
      waveDirectionDeg: marine?.hourly?.wave_direction?.[mi] ?? null,
      wavePeriodS: marine?.hourly?.wave_period?.[mi] ?? null,
      swellHeightM: marine?.hourly?.swell_wave_height?.[mi] ?? null,
      swellPeriodS: marine?.hourly?.swell_wave_period?.[mi] ?? null,
      seaTemperatureC: marine?.hourly?.sea_surface_temperature?.[mi] ?? null,
      currentKmh: marine?.hourly?.ocean_current_velocity?.[mi] ?? null,
      currentDirectionDeg: marine?.hourly?.ocean_current_direction?.[mi] ?? null,
      seaLevelMslM: marine?.hourly?.sea_level_height_msl?.[mi] ?? null,
    });
  }
  return rows;
}

let environmentalSchemaReady = false;
let environmentalSchemaPromise: Promise<void> | null = null;

function environmentalTableMissing(error: unknown) {
  const anyError = error as any;
  const text = [anyError?.code, anyError?.message, anyError?.cause?.code, anyError?.cause?.message].filter(Boolean).join(" ").toUpperCase();
  return text.includes("42P01") || (text.includes("ENVIRONMENTAL_SNAPSHOTS") && text.includes("DOES NOT EXIST"));
}

export async function ensureEnvironmentalSnapshotsTable(db: ReturnType<typeof getDb>) {
  if (environmentalSchemaReady) return;
  if (!environmentalSchemaPromise) {
    environmentalSchemaPromise = (async () => {
      try {
        await db.execute(sql`select 1 from public.environmental_snapshots limit 1`);
      } catch (error) {
        if (!environmentalTableMissing(error)) throw error;
        await db.execute(sql`
            create table if not exists public.environmental_snapshots (
              id serial primary key,
              owner_id text not null,
              trip_id integer not null,
              fishing_set_id integer not null,
              latitude double precision,
              longitude double precision,
              reference_time text not null,
              source_mode text not null,
              status text not null default 'PENDING',
              wind_speed_kmh double precision,
              wind_direction_deg double precision,
              wind_direction text,
              gust_kmh double precision,
              wave_height_m double precision,
              wave_direction_deg double precision,
              wave_direction text,
              wave_period_s double precision,
              swell_height_m double precision,
              swell_direction_deg double precision,
              swell_direction text,
              swell_period_s double precision,
              sea_temperature_c double precision,
              current_kmh double precision,
              current_direction_deg double precision,
              current_direction text,
              sea_level_msl_m double precision,
              chlorophyll_mg_m3 double precision,
              chlorophyll_time text,
              lunar_phase text,
              lunar_illumination double precision,
              sunrise text,
              sunset text,
              payload_json text,
              error_text text,
              captured_at text not null default CURRENT_TIMESTAMP::text
            )
          `);
          await db.execute(sql`create unique index if not exists idx_env_snapshot_set on public.environmental_snapshots(fishing_set_id)`);
          await db.execute(sql`create index if not exists idx_env_snapshot_owner_trip on public.environmental_snapshots(owner_id, trip_id)`);
          await db.execute(sql`create index if not exists idx_env_snapshot_owner_status on public.environmental_snapshots(owner_id, status)`);
      }
      environmentalSchemaReady = true;
    })().catch((error) => {
      environmentalSchemaPromise = null;
      environmentalSchemaReady = false;
      throw error;
    });
  }
  await environmentalSchemaPromise;
}

function normalizeRow(row: any): EnvironmentalSnapshot {
  let payload = null;
  try { payload = row?.payloadJson ? JSON.parse(row.payloadJson) : null; } catch { payload = null; }
  return { ...row, payload } as EnvironmentalSnapshot;
}

export async function captureEnvironmentalSnapshot(
  db: ReturnType<typeof getDb>,
  input: { ownerId: string; tripId: number; fishingSetId: number; latitude: number | null; longitude: number | null; referenceTime: string; force?: boolean },
) {
  await ensureEnvironmentalSnapshotsTable(db);
  if (input.latitude == null || input.longitude == null) {
    await db.execute(sql`
      insert into public.environmental_snapshots(owner_id, trip_id, fishing_set_id, latitude, longitude, reference_time, source_mode, status, error_text, captured_at)
      values (${input.ownerId}, ${input.tripId}, ${input.fishingSetId}, ${input.latitude}, ${input.longitude}, ${input.referenceTime}, 'UNAVAILABLE', 'ERROR', 'Largada sem coordenadas válidas.', ${new Date().toISOString()})
      on conflict (fishing_set_id) do update set
        latitude=excluded.latitude, longitude=excluded.longitude, reference_time=excluded.reference_time,
        source_mode=excluded.source_mode, status=excluded.status, error_text=excluded.error_text, captured_at=excluded.captured_at
    `);
    return null;
  }

  if (!input.force) {
    const existing = await db.execute(sql`
      select id, status from public.environmental_snapshots
      where owner_id=${input.ownerId} and fishing_set_id=${input.fishingSetId}
      limit 1
    `) as unknown as any[];
    if (existing?.[0]?.status === "COMPLETE" || existing?.[0]?.status === "PARTIAL") return existing[0];
  }

  const referenceMs = toBrazilMs(input.referenceTime);
  const historical = Number.isFinite(referenceMs) && referenceMs < Date.now() - 36 * 3600_000;
  const sourceMode = historical ? "HISTORICAL_BACKFILL" : "DAY_FORECAST_SNAPSHOT";

  await db.execute(sql`
    insert into public.environmental_snapshots(owner_id, trip_id, fishing_set_id, latitude, longitude, reference_time, source_mode, status, captured_at)
    values (${input.ownerId}, ${input.tripId}, ${input.fishingSetId}, ${input.latitude}, ${input.longitude}, ${input.referenceTime}, ${sourceMode}, 'PENDING', ${new Date().toISOString()})
    on conflict (fishing_set_id) do update set
      owner_id=excluded.owner_id, trip_id=excluded.trip_id, latitude=excluded.latitude, longitude=excluded.longitude,
      reference_time=excluded.reference_time, source_mode=excluded.source_mode, status='PENDING', error_text=null, captured_at=excluded.captured_at
  `);

  const [weatherResult, marineResult, chlResult] = await Promise.allSettled([
    fetchWeather(input.latitude, input.longitude, input.referenceTime, historical),
    fetchMarine(input.latitude, input.longitude, input.referenceTime),
    fetchHistoricalChlorophyll(input.latitude, input.longitude, input.referenceTime),
  ]);
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
  const marine = marineResult.status === "fulfilled" ? marineResult.value : null;
  const chlorophyll = chlResult.status === "fulfilled" ? chlResult.value : { mgM3: null, time: null };
  const weatherTimes: string[] = weather?.hourly?.time || [];
  const marineTimes: string[] = marine?.hourly?.time || [];
  const wi = nearestIndex(weatherTimes, input.referenceTime);
  const mi = nearestIndex(marineTimes, input.referenceTime);
  const lunar = lunarInfo(input.referenceTime);

  const values = {
    windSpeedKmh: asNumber(weather?.hourly?.wind_speed_10m?.[wi]),
    windDirectionDeg: asNumber(weather?.hourly?.wind_direction_10m?.[wi]),
    gustKmh: asNumber(weather?.hourly?.wind_gusts_10m?.[wi]),
    waveHeightM: asNumber(marine?.hourly?.wave_height?.[mi]),
    waveDirectionDeg: asNumber(marine?.hourly?.wave_direction?.[mi]),
    wavePeriodS: asNumber(marine?.hourly?.wave_period?.[mi]),
    swellHeightM: asNumber(marine?.hourly?.swell_wave_height?.[mi]),
    swellDirectionDeg: asNumber(marine?.hourly?.swell_wave_direction?.[mi]),
    swellPeriodS: asNumber(marine?.hourly?.swell_wave_period?.[mi]),
    seaTemperatureC: asNumber(marine?.hourly?.sea_surface_temperature?.[mi]),
    currentKmh: asNumber(marine?.hourly?.ocean_current_velocity?.[mi]),
    currentDirectionDeg: asNumber(marine?.hourly?.ocean_current_direction?.[mi]),
    seaLevelMslM: asNumber(marine?.hourly?.sea_level_height_msl?.[mi]),
    chlorophyllMgM3: asNumber(chlorophyll?.mgM3),
    chlorophyllTime: chlorophyll?.time || null,
    sunrise: weather?.daily?.sunrise?.[0] || null,
    sunset: weather?.daily?.sunset?.[0] || null,
  };

  const atLeastOne = [
    values.windSpeedKmh,
    values.waveHeightM,
    values.seaTemperatureC,
    values.seaLevelMslM,
    values.chlorophyllMgM3,
  ].some((value) => value != null);
  const completeCore = values.windSpeedKmh != null && values.waveHeightM != null;
  const status = completeCore ? "COMPLETE" : atLeastOne ? "PARTIAL" : "ERROR";
  const errors = [
    weatherResult.status === "rejected" ? `vento: ${String(weatherResult.reason)}` : "",
    marineResult.status === "rejected" ? `mar: ${String(marineResult.reason)}` : "",
  ].filter(Boolean).join(" | ");

  const payload = {
    position: { lat: input.latitude, lon: input.longitude },
    referenceTime: input.referenceTime,
    sourceMode,
    atSetTime: {
      ...values,
      windDirection: directionName(values.windDirectionDeg),
      waveDirection: directionName(values.waveDirectionDeg),
      swellDirection: directionName(values.swellDirectionDeg),
      currentDirection: directionName(values.currentDirectionDeg),
    },
    lunar,
    dayForecast: compactDayForecast(weather, marine),
    sources: {
      weather: historical ? "Open-Meteo Historical Weather" : "Open-Meteo Forecast",
      marine: "Open-Meteo Marine",
      chlorophyll: "NOAA CoastWatch VIIRS Daily",
    },
  };
  const now = new Date().toISOString();

  await db.execute(sql`
    update public.environmental_snapshots set
      status=${status},
      wind_speed_kmh=${values.windSpeedKmh},
      wind_direction_deg=${values.windDirectionDeg},
      wind_direction=${directionName(values.windDirectionDeg)},
      gust_kmh=${values.gustKmh},
      wave_height_m=${values.waveHeightM},
      wave_direction_deg=${values.waveDirectionDeg},
      wave_direction=${directionName(values.waveDirectionDeg)},
      wave_period_s=${values.wavePeriodS},
      swell_height_m=${values.swellHeightM},
      swell_direction_deg=${values.swellDirectionDeg},
      swell_direction=${directionName(values.swellDirectionDeg)},
      swell_period_s=${values.swellPeriodS},
      sea_temperature_c=${values.seaTemperatureC},
      current_kmh=${values.currentKmh},
      current_direction_deg=${values.currentDirectionDeg},
      current_direction=${directionName(values.currentDirectionDeg)},
      sea_level_msl_m=${values.seaLevelMslM},
      chlorophyll_mg_m3=${values.chlorophyllMgM3},
      chlorophyll_time=${values.chlorophyllTime},
      lunar_phase=${lunar.phase},
      lunar_illumination=${lunar.illumination},
      sunrise=${values.sunrise},
      sunset=${values.sunset},
      payload_json=${JSON.stringify(payload)},
      error_text=${errors || null},
      captured_at=${now}
    where owner_id=${input.ownerId} and fishing_set_id=${input.fishingSetId}
  `);

  const rows = await db.execute(sql`
    select
      id, owner_id as "ownerId", trip_id as "tripId", fishing_set_id as "fishingSetId",
      latitude, longitude, reference_time as "referenceTime", source_mode as "sourceMode", status,
      wind_speed_kmh as "windSpeedKmh", wind_direction_deg as "windDirectionDeg", wind_direction as "windDirection", gust_kmh as "gustKmh",
      wave_height_m as "waveHeightM", wave_direction_deg as "waveDirectionDeg", wave_direction as "waveDirection", wave_period_s as "wavePeriodS",
      swell_height_m as "swellHeightM", swell_direction_deg as "swellDirectionDeg", swell_direction as "swellDirection", swell_period_s as "swellPeriodS",
      sea_temperature_c as "seaTemperatureC", current_kmh as "currentKmh", current_direction_deg as "currentDirectionDeg", current_direction as "currentDirection",
      sea_level_msl_m as "seaLevelMslM", chlorophyll_mg_m3 as "chlorophyllMgM3", chlorophyll_time as "chlorophyllTime",
      lunar_phase as "lunarPhase", lunar_illumination as "lunarIllumination", sunrise, sunset,
      payload_json as "payloadJson", error_text as "errorText", captured_at as "capturedAt"
    from public.environmental_snapshots where owner_id=${input.ownerId} and fishing_set_id=${input.fishingSetId} limit 1
  `) as unknown as any[];
  return rows?.[0] ? normalizeRow(rows[0]) : null;
}

export async function getEnvironmentalSnapshots(db: ReturnType<typeof getDb>, ownerId: string, tripId?: number) {
  await ensureEnvironmentalSnapshotsTable(db);
  const rows = tripId
    ? await db.execute(sql`
        select id, owner_id as "ownerId", trip_id as "tripId", fishing_set_id as "fishingSetId", latitude, longitude,
          reference_time as "referenceTime", source_mode as "sourceMode", status,
          wind_speed_kmh as "windSpeedKmh", wind_direction_deg as "windDirectionDeg", wind_direction as "windDirection", gust_kmh as "gustKmh",
          wave_height_m as "waveHeightM", wave_direction_deg as "waveDirectionDeg", wave_direction as "waveDirection", wave_period_s as "wavePeriodS",
          swell_height_m as "swellHeightM", swell_direction_deg as "swellDirectionDeg", swell_direction as "swellDirection", swell_period_s as "swellPeriodS",
          sea_temperature_c as "seaTemperatureC", current_kmh as "currentKmh", current_direction_deg as "currentDirectionDeg", current_direction as "currentDirection",
          sea_level_msl_m as "seaLevelMslM", chlorophyll_mg_m3 as "chlorophyllMgM3", chlorophyll_time as "chlorophyllTime",
          lunar_phase as "lunarPhase", lunar_illumination as "lunarIllumination", sunrise, sunset,
          payload_json as "payloadJson", error_text as "errorText", captured_at as "capturedAt"
        from public.environmental_snapshots where owner_id=${ownerId} and trip_id=${tripId} order by fishing_set_id asc
      `)
    : await db.execute(sql`
        select id, owner_id as "ownerId", trip_id as "tripId", fishing_set_id as "fishingSetId", latitude, longitude,
          reference_time as "referenceTime", source_mode as "sourceMode", status,
          wind_speed_kmh as "windSpeedKmh", wind_direction_deg as "windDirectionDeg", wind_direction as "windDirection", gust_kmh as "gustKmh",
          wave_height_m as "waveHeightM", wave_direction_deg as "waveDirectionDeg", wave_direction as "waveDirection", wave_period_s as "wavePeriodS",
          swell_height_m as "swellHeightM", swell_direction_deg as "swellDirectionDeg", swell_direction as "swellDirection", swell_period_s as "swellPeriodS",
          sea_temperature_c as "seaTemperatureC", current_kmh as "currentKmh", current_direction_deg as "currentDirectionDeg", current_direction as "currentDirection",
          sea_level_msl_m as "seaLevelMslM", chlorophyll_mg_m3 as "chlorophyllMgM3", chlorophyll_time as "chlorophyllTime",
          lunar_phase as "lunarPhase", lunar_illumination as "lunarIllumination", sunrise, sunset,
          payload_json as "payloadJson", error_text as "errorText", captured_at as "capturedAt"
        from public.environmental_snapshots where owner_id=${ownerId} order by fishing_set_id asc
      `);
  return (rows as unknown as any[]).map(normalizeRow);
}

export async function getEnvironmentalBackfillCandidates(db: ReturnType<typeof getDb>, ownerId: string, limit = 3, tripId?: number) {
  await ensureEnvironmentalSnapshotsTable(db);
  const bounded = Math.max(1, Math.min(6, Math.floor(limit)));
  const query = tripId
    ? sql`
      select fs.id as "fishingSetId", fs.trip_id as "tripId", fs.started_at as "referenceTime",
        fs.start_latitude as latitude, fs.start_longitude as longitude
      from fishing_sets fs
      inner join trips t on t.id=fs.trip_id
      left join environmental_snapshots es on es.fishing_set_id=fs.id and es.owner_id=${ownerId}
      where t.owner_id=${ownerId} and fs.trip_id=${tripId} and (es.id is null or es.status in ('PENDING','ERROR'))
      order by fs.started_at asc limit ${bounded}
    `
    : sql`
      select fs.id as "fishingSetId", fs.trip_id as "tripId", fs.started_at as "referenceTime",
        fs.start_latitude as latitude, fs.start_longitude as longitude
      from fishing_sets fs
      inner join trips t on t.id=fs.trip_id
      left join environmental_snapshots es on es.fishing_set_id=fs.id and es.owner_id=${ownerId}
      where t.owner_id=${ownerId} and (es.id is null or es.status in ('PENDING','ERROR'))
      order by fs.started_at asc limit ${bounded}
    `;
  return await db.execute(query) as unknown as any[];
}

export async function countEnvironmentalBackfillRemaining(db: ReturnType<typeof getDb>, ownerId: string, tripId?: number) {
  await ensureEnvironmentalSnapshotsTable(db);
  const rows = tripId
    ? await db.execute(sql`
      select count(*)::int as count from fishing_sets fs
      inner join trips t on t.id=fs.trip_id
      left join environmental_snapshots es on es.fishing_set_id=fs.id and es.owner_id=${ownerId}
      where t.owner_id=${ownerId} and fs.trip_id=${tripId} and (es.id is null or es.status in ('PENDING','ERROR'))
    `) as unknown as any[]
    : await db.execute(sql`
      select count(*)::int as count from fishing_sets fs
      inner join trips t on t.id=fs.trip_id
      left join environmental_snapshots es on es.fishing_set_id=fs.id and es.owner_id=${ownerId}
      where t.owner_id=${ownerId} and (es.id is null or es.status in ('PENDING','ERROR'))
    `) as unknown as any[];
  return Number(rows?.[0]?.count || 0);
}
