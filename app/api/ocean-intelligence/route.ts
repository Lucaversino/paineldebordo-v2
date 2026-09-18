import { getDb } from "../../../db";
import { catches, fishingSets, trips } from "../../../db/schema";
import { asc, eq } from "drizzle-orm";
import { requirePanelUserResponse } from "../../../lib/panelAuth";

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const SYNODIC = 29.530588853;
const oceanCache = new Map<string, { expiresAt: number; payload: any }>();

function moonPhase(date: Date) {
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const age = (((date.getTime() - knownNewMoon) / DAY_MS) % SYNODIC + SYNODIC) % SYNODIC;
  const fraction = age / SYNODIC;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  const names = ["Lua nova", "Crescente", "Quarto crescente", "Gibosa crescente", "Lua cheia", "Gibosa minguante", "Quarto minguante", "Minguante"];
  return { age, fraction, illumination, name: names[Math.round(fraction * 8) % 8] };
}

// Algoritmo astronômico compacto inspirado nas equações públicas usadas pelo SunCalc.
const J1970 = 2440588, J2000 = 2451545, E = RAD * 23.4397;
const toJulian = (d: Date) => d.getTime() / DAY_MS - 0.5 + J1970;
const toDays = (d: Date) => toJulian(d) - J2000;
const rightAscension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;
const altitude = (H: number, phi: number, dec: number) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
function astroRefraction(h: number) {
  if (h < 0) h = 0;
  return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}
function moonCoords(d: number) {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b) };
}
function moonAltitude(date: Date, lat: number, lon: number) {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date), c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  h += astroRefraction(h);
  return h;
}
function moonTimes(date: Date, lat: number, lon: number) {
  const t = new Date(date); t.setHours(0, 0, 0, 0);
  const hc = 0.133 * RAD;
  let h0 = moonAltitude(t, lat, lon) - hc, rise: Date | null = null, set: Date | null = null, ye = 0;
  for (let i = 1; i <= 24; i += 2) {
    const h1 = moonAltitude(new Date(t.getTime() + i * 3600000), lat, lon) - hc;
    const h2 = moonAltitude(new Date(t.getTime() + (i + 1) * 3600000), lat, lon) - hc;
    const a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2;
    const xe = -b / (2 * a), disc = b * b - 4 * a * h1;
    let roots = 0, x1 = 0, x2 = 0;
    if (disc >= 0 && Number.isFinite(xe)) {
      const dx = Math.sqrt(disc) / (Math.abs(a) * 2);
      x1 = xe - dx; x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots++;
      if (Math.abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
      ye = (a * xe + b) * xe + h1;
    }
    if (roots === 1) {
      const event = new Date(t.getTime() + (i + x1) * 3600000);
      if (h0 < 0) rise = event; else set = event;
    } else if (roots === 2) {
      const first = new Date(t.getTime() + (i + (ye < 0 ? x2 : x1)) * 3600000);
      const second = new Date(t.getTime() + (i + (ye < 0 ? x1 : x2)) * 3600000);
      rise = first; set = second;
    }
    if (rise && set) break;
    h0 = h2;
  }
  return { rise, set };
}

function nearestIndex(times: string[], target = Date.now()) {
  let best = 0, diff = Infinity;
  times.forEach((v, i) => { const d = Math.abs(new Date(v).getTime() - target); if (d < diff) { diff = d; best = i; } });
  return best;
}
function direction(deg: number | null | undefined) {
  if (deg == null || !Number.isFinite(deg)) return null;
  const normalized = ((deg % 360) + 360) % 360;
  const pts = [
    "Norte",
    "Nordeste",
    "Leste",
    "Sudeste",
    "Sul",
    "Sudoeste",
    "Oeste",
    "Noroeste",
  ];
  return pts[Math.round(normalized / 45) % 8];
}

async function fetchOpenMeteo(lat: number, lon: number) {
  const tz = "America/Sao_Paulo";
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.search = new URLSearchParams({ latitude: String(lat), longitude: String(lon), timezone: tz, current: "wind_speed_10m,wind_direction_10m,wind_gusts_10m", wind_speed_unit: "kmh", daily: "sunrise,sunset" }).toString();
  const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  marineUrl.search = new URLSearchParams({ latitude: String(lat), longitude: String(lon), timezone: tz, hourly: "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl", forecast_days: "3" }).toString();
  const [wRes, mRes] = await Promise.all([fetch(weatherUrl, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) }), fetch(marineUrl, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) })]);
  const weather = wRes.ok ? await wRes.json() : null;
  const marine = mRes.ok ? await mRes.json() : null;
  const idx = marine?.hourly?.time?.length ? nearestIndex(marine.hourly.time) : 0;
  const level = marine?.hourly?.sea_level_height_msl || [];
  const extrema: { type: "HIGH" | "LOW"; time: string; height: number }[] = [];
  for (let i = Math.max(1, idx); i < Math.min(level.length - 1, idx + 36); i++) {
    if (level[i] > level[i - 1] && level[i] >= level[i + 1]) extrema.push({ type: "HIGH", time: marine.hourly.time[i], height: level[i] });
    if (level[i] < level[i - 1] && level[i] <= level[i + 1]) extrema.push({ type: "LOW", time: marine.hourly.time[i], height: level[i] });
    if (extrema.length >= 4) break;
  }
  return {
    wind: weather?.current ? { speedKmh: weather.current.wind_speed_10m, directionDeg: weather.current.wind_direction_10m, direction: direction(weather.current.wind_direction_10m), gustKmh: weather.current.wind_gusts_10m, time: weather.current.time } : null,
    sun: weather?.daily ? { sunrise: weather.daily.sunrise?.[0] || null, sunset: weather.daily.sunset?.[0] || null } : null,
    sea: marine?.hourly ? {
      time: marine.hourly.time?.[idx], waveHeightM: marine.hourly.wave_height?.[idx], waveDirectionDeg: marine.hourly.wave_direction?.[idx], wavePeriodS: marine.hourly.wave_period?.[idx],
      swellHeightM: marine.hourly.swell_wave_height?.[idx], swellDirectionDeg: marine.hourly.swell_wave_direction?.[idx], swellPeriodS: marine.hourly.swell_wave_period?.[idx],
      sstC: marine.hourly.sea_surface_temperature?.[idx], currentKmh: marine.hourly.ocean_current_velocity?.[idx], currentDirectionDeg: marine.hourly.ocean_current_direction?.[idx], seaLevelMslM: marine.hourly.sea_level_height_msl?.[idx], extrema,
    } : null,
  };
}

async function fetchChlorophyll(lat: number, lon: number) {
  const endpoint = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNnoaaSNPPnoaa20chlaGapfilledDaily.csv?chlor_a[(last)][(0.0)][(${lat})][(${lon})]`;
  try {
    const r = await fetch(endpoint, { headers: { accept: "text/csv" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const text = await r.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 3) return null;
    const cells = lines[2].split(",");
    const value = Number(cells.at(-1));
    const time = cells[0]?.replace(/"/g, "");
    return Number.isFinite(value) ? { mgM3: value, time, source: "NOAA/NESDIS VIIRS (gap-filled daily)" } : null;
  } catch { return null; }
}

function bucketAnalysis(rows: any[]) {
  const aggregate = (keyFn: (r:any)=>string) => {
    const map = new Map<string, { kg:number; n:number }>();
    rows.forEach(r => { const k = keyFn(r); const x = map.get(k) || {kg:0,n:0}; x.kg += r.kg; x.n++; map.set(k,x); });
    return Array.from(map, ([label,v]) => ({ label, samples:v.n, totalKg:v.kg, avgKg:v.kg/v.n })).sort((a,b)=>b.avgKg-a.avgKg);
  };
  return {
    hours: aggregate(r => { const h=Math.floor(r.hour/3)*3; return `${String(h).padStart(2,"0")}:00–${String((h+3)%24).padStart(2,"0")}:00`; }),
    depth: aggregate(r => r.depth == null ? "Sem profundidade" : r.depth < 15 ? "0–15 m" : r.depth < 25 ? "15–25 m" : r.depth < 35 ? "25–35 m" : "35+ m"),
    moon: aggregate(r => moonPhase(new Date(r.startedAt)).name),
  };
}

export async function GET(request: Request) {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const user = auth.user!;
  const url = new URL(request.url);
  const manualLatRaw = url.searchParams.get("lat");
  const manualLonRaw = url.searchParams.get("lon");
  const manualLat = manualLatRaw == null ? NaN : Number(manualLatRaw);
  const manualLon = manualLonRaw == null ? NaN : Number(manualLonRaw);
  const hasManualPosition = manualLatRaw != null && manualLonRaw != null && Number.isFinite(manualLat) && Number.isFinite(manualLon) && Math.abs(manualLat) <= 90 && Math.abs(manualLon) <= 180;
  const cacheKey = hasManualPosition ? `${user.id}|manual:${manualLat.toFixed(5)},${manualLon.toFixed(5)}` : `${user.id}|auto`;
  const cached = oceanCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return Response.json(cached.payload);
  const db = getDb();
  const [allSets, allCatches] = await Promise.all([
    db.select({ id:fishingSets.id, tripId:fishingSets.tripId, setNumber:fishingSets.setNumber, startedAt:fishingSets.startedAt, depth:fishingSets.depthMeters, lat:fishingSets.startLatitude, lon:fishingSets.startLongitude })
      .from(fishingSets).innerJoin(trips, eq(fishingSets.tripId, trips.id)).where(eq(trips.ownerId, user.id)).orderBy(asc(fishingSets.startedAt)),
    db.select({ fishingSetId:catches.fishingSetId, weightKg:catches.weightKg, catchType:catches.catchType })
      .from(catches).innerJoin(trips, eq(catches.tripId, trips.id)).where(eq(trips.ownerId, user.id)),
  ]);
  const kgBySet = new Map<number, number>();
  allCatches.filter(c=>c.catchType !== "DISCARD").forEach(c=>kgBySet.set(c.fishingSetId,(kgBySet.get(c.fishingSetId)||0)+Number(c.weightKg||0)));
  const rows = allSets.map(s=>({ ...s, kg:kgBySet.get(s.id)||0, hour:new Date(s.startedAt).getHours() })).filter(r=>r.kg>0);
  const patterns = bucketAnalysis(rows);
  const validSets = allSets.filter(s => s.lat != null && s.lon != null);
  const localDayKey = (value: string | Date) => {
    try {
      // startedAt vem do input datetime-local e é salvo como texto; preserve a data digitada a bordo.
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
      const pick = (type: string) => parts.find(p => p.type === type)?.value || "";
      return `${pick("year")}-${pick("month")}-${pick("day")}`;
    } catch {
      return "";
    }
  };
  const todayKey = localDayKey(new Date());
  let automaticSet = validSets.find(s => localDayKey(s.startedAt) === todayKey) || null;
  let positionSource: "FIRST_SET_TODAY" | "FIRST_SET_LATEST_DAY" | "MANUAL" = "FIRST_SET_TODAY";

  // Se ainda não houver largada hoje, usa a primeira posição do último dia com largada.
  // Isso mantém o painel útil sem trocar silenciosamente para a última posição do dia.
  if (!automaticSet && validSets.length) {
    const latestDay = localDayKey(validSets[validSets.length - 1].startedAt);
    automaticSet = validSets.find(s => localDayKey(s.startedAt) === latestDay) || validSets[0];
    positionSource = "FIRST_SET_LATEST_DAY";
  }

  const position = hasManualPosition
    ? { lat: manualLat, lon: manualLon, setNumber: null, startedAt: null, source: "MANUAL" as const }
    : automaticSet
      ? { lat: Number(automaticSet.lat), lon: Number(automaticSet.lon), setNumber: automaticSet.setNumber, startedAt: automaticSet.startedAt, source: positionSource }
      : null;

  let environment:any = null;
  if (position) {
    const now = new Date();
    const [ocean, chlorophyll] = await Promise.all([fetchOpenMeteo(position.lat, position.lon).catch(()=>null), fetchChlorophyll(position.lat, position.lon)]);
    const phase = moonPhase(now), mt = moonTimes(now, position.lat, position.lon);
    environment = { position, lunar:{ ...phase, moonrise:mt.rise?.toISOString()||null, moonset:mt.set?.toISOString()||null }, ...ocean, chlorophyll };
  }
  const bestHour = patterns.hours.find(x=>x.samples>=2) || patterns.hours[0] || null;
  const bestDepth = patterns.depth.find(x=>x.samples>=2 && x.label!=="Sem profundidade") || patterns.depth.find(x=>x.label!=="Sem profundidade") || null;
  const bestMoon = patterns.moon.find(x=>x.samples>=2) || patterns.moon[0] || null;
  const sampleCount = rows.length;
  const confidence = sampleCount >= 30 ? "alta" : sampleCount >= 12 ? "média" : sampleCount >= 5 ? "baixa" : "insuficiente";
  const payload = { environment, analysis:{ sampleCount, confidence, bestHour, bestDepth, bestMoon, patterns, notes:[
    sampleCount < 5 ? "Ainda há poucas largadas com captura para detectar padrões confiáveis." : "A análise aprende com as largadas registradas neste painel e compara produtividade média por faixa.",
    "Correlação não prova causa: lua, vento, maré e clorofila devem ser comparados com histórico antes de orientar uma decisão operacional.",
  ] }, sources:{ marine:"Open-Meteo Marine", weather:"Open-Meteo Forecast", chlorophyll:"NOAA CoastWatch ERDDAP / VIIRS" } };
  oceanCache.set(cacheKey, { expiresAt: Date.now() + 120_000, payload });
  return Response.json(payload);
}
