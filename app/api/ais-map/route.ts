import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

type MapVessel = {
  mmsi: string;
  imo?: string;
  name: string;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  vesselType?: string;
  navStatusText?: string;
  positionReceived: string;
  updateTime: string;
  dataSource: "AISStream" | "VesselAPI Free" | "Kpler Maritime" | "Marinesia AIS";
  receivedAt: number;
};

type CacheValue = {
  vessels: MapVessel[];
  source: "AISStream" | "VesselAPI Free" | "Kpler Maritime" | "Marinesia AIS" | "Nenhuma";
  fallbackUsed: boolean;
  updatedAt: number;
  expiresAt: number;
  staleUntil: number;
};

type AisMapGlobal = {
  cache: Map<string, CacheValue>;
  inflight: Map<string, Promise<CacheValue>>;
  marinesiaCache: Map<string, { vessels: MapVessel[]; expiresAt: number }>;
  marinesiaLastCallAt: number;
};

const globalAisMap = globalThis as typeof globalThis & { __painelAisMap?: AisMapGlobal };
const state: AisMapGlobal = globalAisMap.__painelAisMap || {
  cache: new Map(),
  inflight: new Map(),
  marinesiaCache: new Map(),
  marinesiaLastCallAt: 0,
};
globalAisMap.__painelAisMap = state;

const FRESH_TTL_MS = 45_000;
const STALE_TTL_MS = 5 * 60_000;
const MAX_VESSELS = 180;

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function shipTypeText(value: unknown) {
  const raw = cleanText(value);
  const n = Number(raw);
  if (Number.isFinite(n) && n === 30) return "Fishing vessel (30)";
  return raw;
}

function navStatusText(value: unknown) {
  const n = Number(value);
  const labels: Record<number, string> = {
    0: "Em navegação a motor",
    1: "Fundeado",
    2: "Sem comando",
    3: "Manobra restrita",
    4: "Restrito pelo calado",
    5: "Atracado",
    6: "Encalhado",
    7: "Em pesca",
    8: "À vela",
    14: "AIS-SART",
    15: "Não definido",
  };
  return Number.isFinite(n) ? labels[n] || `Status AIS ${n}` : cleanText(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function queryBox(lat: number, lon: number, zoom = 10) {
  // Vessel Free acompanha o zoom: quanto mais aproxima, menor e mais focada
  // fica a caixa consultada. Mantém os limites aceitos pela VesselAPI.
  const z = clamp(Math.round(zoom || 10), 3, 18);
  const grid = z >= 14 ? 0.02 : z >= 12 ? 0.05 : z >= 10 ? 0.10 : 0.25;
  const centerLat = Math.round(lat / grid) * grid;
  const centerLon = Math.round(lon / grid) * grid;
  const latHalf = z >= 14 ? 0.10 : z >= 12 ? 0.22 : z >= 10 ? 0.45 : z >= 8 ? 0.75 : 1.0;
  const lonHalf = z >= 14 ? 0.14 : z >= 12 ? 0.30 : z >= 10 ? 0.60 : z >= 8 ? 1.0 : 1.0;
  return {
    centerLat,
    centerLon,
    south: clamp(centerLat - latHalf, -89.9, 89.9),
    north: clamp(centerLat + latHalf, -89.9, 89.9),
    west: clamp(centerLon - lonHalf, -179.9, 179.9),
    east: clamp(centerLon + lonHalf, -179.9, 179.9),
  };
}

function cacheKey(lat: number, lon: number, zoom = 10) {
  const box = queryBox(lat, lon, zoom);
  return `${box.centerLat.toFixed(2)}:${box.centerLon.toFixed(2)}:z${clamp(Math.round(zoom || 10), 3, 18)}`;
}

function validVessel(vessel: MapVessel | null): vessel is MapVessel {
  return Boolean(
    vessel &&
    Number.isFinite(vessel.lat) && Math.abs(vessel.lat) <= 90 &&
    Number.isFinite(vessel.lon) && Math.abs(vessel.lon) <= 180 &&
    vessel.mmsi
  );
}

function parseVesselApiItem(raw: any): MapVessel | null {
  const source = raw?.position || raw?.latest_position || raw?.ais || raw;
  const lat = numberOrNull(source?.latitude ?? source?.lat ?? source?.location?.coordinates?.[1]);
  const lon = numberOrNull(source?.longitude ?? source?.lon ?? source?.lng ?? source?.location?.coordinates?.[0]);
  const mmsi = cleanText(raw?.mmsi ?? source?.mmsi ?? raw?.MMSI ?? source?.MMSI).replace(/\D/g, "");
  if (lat == null || lon == null || !mmsi || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const name = cleanText(
    raw?.vessel_name ?? raw?.vesselName ?? raw?.name ?? source?.vessel_name ?? source?.name ?? source?.NAME,
  );
  const timeRaw = cleanText(
    source?.timestamp ?? source?.position_timestamp ?? source?.received_at ?? source?.processed_timestamp ?? raw?.timestamp,
  );
  const parsedTime = timeRaw && !Number.isNaN(new Date(timeRaw).getTime()) ? new Date(timeRaw) : new Date();
  const speed = numberOrNull(source?.speed ?? source?.sog ?? source?.SPEED);
  const course = numberOrNull(source?.course ?? source?.cog ?? source?.COURSE);
  const heading = numberOrNull(source?.heading ?? source?.HEADING);

  return {
    mmsi,
    imo: cleanText(raw?.imo ?? source?.imo ?? source?.IMO).replace(/\D/g, ""),
    name: name || `MMSI ${mmsi}`,
    lat,
    lon,
    sog: speed,
    cog: course,
    heading: heading != null && heading < 511 ? heading : null,
    vesselType: shipTypeText(raw?.ship_type ?? raw?.vessel_type ?? raw?.type ?? source?.ship_type ?? source?.vessel_type ?? source?.type),
    navStatusText: cleanText(source?.navigational_status ?? source?.nav_status ?? source?.navStatus) || navStatusText(source?.navstat ?? source?.NAVSTAT),
    positionReceived: parsedTime.toISOString(),
    updateTime: parsedTime.toISOString(),
    dataSource: "VesselAPI Free",
    receivedAt: Date.now(),
  };
}

async function fetchVesselApi(lat: number, lon: number, zoom = 10): Promise<MapVessel[]> {
  const apiKey = (
    process.env.VESSELAPI_API_KEY ||
    process.env.VESSEL_API_KEY ||
    process.env.VESSELS_API_KEY ||
    ""
  ).trim();
  if (!apiKey) throw Object.assign(new Error("VESSELAPI_API_KEY não configurada."), { code: "not_configured" });

  const box = queryBox(lat, lon, zoom);
  const params = new URLSearchParams({
    "filter.latBottom": String(box.south),
    "filter.latTop": String(box.north),
    "filter.lonLeft": String(box.west),
    "filter.lonRight": String(box.east),
    "pagination.limit": "50",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`https://api.vesselapi.com/v1/location/vessels/bounding-box?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": "Painel-de-Bordo/95",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    let body: any = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const message = cleanText(body?.message || body?.error?.message || body?.error) || `VesselAPI ${response.status}`;
      throw Object.assign(new Error(message), { status: response.status });
    }

    const candidates =
      (Array.isArray(body?.vessels) && body.vessels) ||
      (Array.isArray(body?.items) && body.items) ||
      (Array.isArray(body?.data) && body.data) ||
      (Array.isArray(body?.data?.vessels) && body.data.vessels) ||
      (Array.isArray(body?.data?.items) && body.data.items) ||
      [];

    return candidates.map(parseVesselApiItem).filter(validVessel).slice(0, 50);
  } finally {
    clearTimeout(timer);
  }
}


function parseKplerItem(raw: any): MapVessel | null {
  const staticData = raw?.staticData || {};
  const pos = raw?.lastPositionUpdate || {};
  const lat = numberOrNull(pos?.latitude);
  const lon = numberOrNull(pos?.longitude);
  const mmsi = cleanText(staticData?.mmsi).replace(/\D/g, "");
  if (lat == null || lon == null || !mmsi || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const timeRaw = cleanText(pos?.timestamp || pos?.updateTimestamp || raw?.updateTimestamp);
  const parsedTime = timeRaw && !Number.isNaN(new Date(timeRaw).getTime()) ? new Date(timeRaw) : new Date();
  const heading = numberOrNull(pos?.heading);
  const nav = pos?.navigationalStatus;

  return {
    mmsi,
    imo: cleanText(staticData?.imo).replace(/\D/g, ""),
    name: cleanText(staticData?.name) || `MMSI ${mmsi}`,
    lat,
    lon,
    sog: numberOrNull(pos?.speed),
    cog: numberOrNull(pos?.course),
    heading: heading != null && heading < 511 ? heading : null,
    vesselType: shipTypeText(staticData?.vesselType ?? staticData?.type ?? staticData?.shipType),
    navStatusText: cleanText(nav) || navStatusText(nav),
    positionReceived: parsedTime.toISOString(),
    updateTime: parsedTime.toISOString(),
    dataSource: "Kpler Maritime",
    receivedAt: Date.now(),
  };
}

async function fetchKpler(lat: number, lon: number, zoom = 10): Promise<MapVessel[]> {
  const apiKey = (
    process.env.KPLER_API_KEY ||
    process.env.KPLER_MARITIME_TOKEN ||
    process.env.KPLER_TOKEN ||
    ""
  ).trim();
  if (!apiKey) throw Object.assign(new Error("KPLER_API_KEY não configurada."), { code: "not_configured" });

  const box = queryBox(lat, lon, zoom);
  const endpoint = (process.env.KPLER_GRAPHQL_URL || "https://api.sml.kpler.com/graphql").trim();
  const coords = [
    [box.west, box.south],
    [box.east, box.south],
    [box.east, box.north],
    [box.west, box.north],
    [box.west, box.south],
  ];

  const query = `
    query PainelKplerMap {
      vessels(
        first: 100
        areaOfInterest: {
          polygon: {
            type: "Polygon"
            coordinates: [[${coords.map(([x, y]) => `[${x},${y}]`).join(",")}]]
          }
        }
      ) {
        nodes {
          updateTimestamp
          staticData { name mmsi imo }
          lastPositionUpdate {
            timestamp
            updateTimestamp
            latitude
            longitude
            heading
            speed
            course
            navigationalStatus
            collectionType
          }
        }
      }
    }
  `;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "User-Agent": "Painel-de-Bordo/95",
      },
      body: JSON.stringify({ operationName: "PainelKplerMap", query }),
      cache: "no-store",
      signal: controller.signal,
    });

    let body: any = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || body?.errors?.length) {
      const message = cleanText(
        body?.errors?.[0]?.message ||
        body?.message ||
        body?.error?.message ||
        body?.error
      ) || `Kpler ${response.status}`;
      const code = cleanText(body?.errors?.[0]?.extensions?.code);
      throw Object.assign(new Error(message), { status: response.status, code });
    }

    const nodes = Array.isArray(body?.data?.vessels?.nodes) ? body.data.vessels.nodes : [];
    return nodes.map(parseKplerItem).filter(validVessel).slice(0, 100);
  } finally {
    clearTimeout(timer);
  }
}

function parseMarinesiaMapItem(raw: any): MapVessel | null {
  const lat = numberOrNull(raw?.lat ?? raw?.latitude);
  const lon = numberOrNull(raw?.lng ?? raw?.lon ?? raw?.longitude);
  const mmsi = cleanText(raw?.mmsi).replace(/\D/g, "");
  if (lat == null || lon == null || !mmsi || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const stamp = cleanText(raw?.ts || raw?.timestamp);
  const iso = stamp && !Number.isNaN(new Date(stamp).getTime()) ? new Date(stamp).toISOString() : new Date().toISOString();
  const heading = numberOrNull(raw?.hdt ?? raw?.heading);
  return {
    mmsi,
    imo: cleanText(raw?.imo).replace(/\D/g, ""),
    name: cleanText(raw?.name) || `MMSI ${mmsi}`,
    lat,
    lon,
    sog: numberOrNull(raw?.sog),
    cog: numberOrNull(raw?.cog),
    heading: heading != null && heading < 511 ? heading : null,
    vesselType: cleanText(raw?.type ?? raw?.ship_type) || "Embarcação AIS",
    navStatusText: navStatusText(raw?.status),
    positionReceived: iso,
    updateTime: iso,
    dataSource: "Marinesia AIS",
    receivedAt: Date.now(),
  };
}

async function fetchMarinesiaMap(lat: number, lon: number): Promise<MapVessel[]> {
  const apiKey = (process.env.MARINESIA_API_KEY || "").trim();
  if (!apiKey) throw Object.assign(new Error("MARINESIA_API_KEY não configurada."), { code: "not_configured" });

  const box = queryBox(lat, lon);
  const key = `${box.centerLat.toFixed(2)}:${box.centerLon.toFixed(2)}`;
  const cached = state.marinesiaCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.vessels;

  const minInterval = Math.max(0, Number(process.env.MARINESIA_MIN_INTERVAL_SECONDS || 1800) * 1000);
  if (minInterval && state.marinesiaLastCallAt && now - state.marinesiaLastCallAt < minInterval) {
    throw Object.assign(new Error("Marinesia em intervalo de proteção do plano grátis."), { code: "rate_protected" });
  }

  const params = new URLSearchParams({
    key: apiKey,
    lat_min: box.south.toFixed(5),
    lat_max: box.north.toFixed(5),
    long_min: box.west.toFixed(5),
    long_max: box.east.toFixed(5),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    state.marinesiaLastCallAt = now;
    const response = await fetch(`https://api.marinesia.com/api/v2/vessel/area?${params.toString()}`, {
      headers: { accept: "application/json", "user-agent": "Painel-de-Bordo/119" },
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.error === true) throw Object.assign(new Error(cleanText(body?.message) || `Marinesia ${response.status}`), { status: response.status });
    const rows = (Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [])
      .map(parseMarinesiaMapItem)
      .filter(validVessel)
      .slice(0, 20);
    state.marinesiaCache.set(key, { vessels: rows, expiresAt: Date.now() + 30 * 60_000 });
    if (state.marinesiaCache.size > 25) {
      const first = state.marinesiaCache.keys().next().value;
      if (first) state.marinesiaCache.delete(first);
    }
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAisStreamCache(lat: number, lon: number, zoom = 10): Promise<MapVessel[]> {
  const box = queryBox(lat, lon, zoom);
  const maxAgeMinutes = Math.max(5, Number(process.env.AIS_LIVE_MAX_AGE_MINUTES || 45) || 45);

  try {
    const db = getDb();
    const result = await db.execute(sql`
      select
        mmsi, imo, name, lat, lon, sog, cog, heading,
        vessel_type, nav_status_text, position_received, last_seen_at
      from public.ais_live_vessels
      where lat between ${box.south} and ${box.north}
        and lon between ${box.west} and ${box.east}
        and last_seen_at >= now() - make_interval(mins => ${maxAgeMinutes})
      order by last_seen_at desc
      limit ${MAX_VESSELS}
    `);

    const rows = Array.isArray(result) ? result as any[] : [];
    return rows.map((row) => {
      const rawStamp = row.position_received || row.last_seen_at || new Date();
      const stampDate = rawStamp instanceof Date ? rawStamp : new Date(rawStamp);
      const stamp = Number.isNaN(stampDate.getTime()) ? new Date().toISOString() : stampDate.toISOString();
      return {
        mmsi: cleanText(row.mmsi).replace(/\D/g, ""),
        imo: cleanText(row.imo).replace(/\D/g, ""),
        name: cleanText(row.name) || `MMSI ${cleanText(row.mmsi)}`,
        lat: Number(row.lat),
        lon: Number(row.lon),
        sog: numberOrNull(row.sog),
        cog: numberOrNull(row.cog),
        heading: numberOrNull(row.heading),
        vesselType: cleanText(row.vessel_type),
        navStatusText: cleanText(row.nav_status_text),
        positionReceived: stamp,
        updateTime: stamp,
        dataSource: "AISStream" as const,
        receivedAt: stampDate.getTime(),
      };
    }).filter(validVessel);
  } catch (error) {
    console.warn("[AISStream cache] indisponível:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

async function loadSnapshot(lat: number, lon: number, zoom = 10): Promise<CacheValue> {
  let vessels: MapVessel[] = [];
  let source: CacheValue["source"] = "Nenhuma";
  let fallbackUsed = true;

  // Fonte principal: cache persistente abastecido por um único worker AISStream.
  // A Vercel não abre WebSocket com o provedor; apenas lê a última posição por MMSI.
  vessels = await fetchAisStreamCache(lat, lon, zoom);
  if (vessels.length) {
    const now = Date.now();
    return {
      vessels,
      source: "AISStream",
      fallbackUsed: false,
      updatedAt: now,
      expiresAt: now + FRESH_TTL_MS,
      staleUntil: now + STALE_TTL_MS,
    };
  }

  // Fallbacks gratuitos antigos permanecem intactos para não deixar o mapa vazio
  // durante deploy/reconexão do worker.
  let vesselApiAvailable = false;
  try {
    vessels = await fetchVesselApi(lat, lon, zoom);
    vesselApiAvailable = true;
    source = "VesselAPI Free";
  } catch {
    vessels = [];
  }

  if (!vesselApiAvailable || vessels.length === 0) {
    try {
      const kpler = await fetchKpler(lat, lon, zoom);
      if (kpler.length) {
        vessels = kpler;
        source = "Kpler Maritime";
      }
    } catch {
      if (!vesselApiAvailable) vessels = [];
    }
  }

  const now = Date.now();
  return {
    vessels,
    source,
    fallbackUsed,
    updatedAt: now,
    expiresAt: now + FRESH_TTL_MS,
    staleUntil: now + STALE_TTL_MS,
  };
}

export async function GET(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lat = numberOrNull(searchParams.get("lat"));
  const lon = numberOrNull(searchParams.get("lon"));
  const zoom = clamp(numberOrNull(searchParams.get("zoom")) ?? 10, 3, 18);
  const forceRefresh = searchParams.get("refresh") === "1";
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Centro do mapa inválido." }, { status: 400 });
  }

  const key = cacheKey(lat, lon, zoom);
  const now = Date.now();
  const cached = state.cache.get(key);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return NextResponse.json({
      vessels: cached.vessels,
      total: cached.vessels.length,
      source: cached.source,
      fallbackUsed: cached.fallbackUsed,
      cached: true,
      updatedAt: new Date(cached.updatedAt).toISOString(),
      creditsUsed: 0,
      zoom,
      forceRefresh,
    });
  }

  let task = forceRefresh ? undefined : state.inflight.get(key);
  if (!task) {
    task = loadSnapshot(lat, lon, zoom)
      .then((result) => {
        state.cache.set(key, result);
        // Limita memória em instâncias quentes.
        if (state.cache.size > 80) {
          const oldest = [...state.cache.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt).slice(0, 20);
          oldest.forEach(([oldKey]) => state.cache.delete(oldKey));
        }
        return result;
      })
      .finally(() => state.inflight.delete(key));
    state.inflight.set(key, task);
  }

  try {
    const result = await task;
    console.info("[Vessel Free] mapa atualizado", {
      source: result.source,
      total: result.vessels.length,
      zoom,
      forceRefresh,
      key,
    });
    return NextResponse.json({
      vessels: result.vessels,
      total: result.vessels.length,
      source: result.source,
      fallbackUsed: result.fallbackUsed,
      cached: false,
      updatedAt: new Date(result.updatedAt).toISOString(),
      creditsUsed: 0,
      zoom,
      forceRefresh,
    });
  } catch {
    if (cached && cached.staleUntil > now) {
      return NextResponse.json({
        vessels: cached.vessels,
        total: cached.vessels.length,
        source: cached.source,
        fallbackUsed: cached.fallbackUsed,
        cached: true,
        stale: true,
        updatedAt: new Date(cached.updatedAt).toISOString(),
        creditsUsed: 0,
      });
    }
    return NextResponse.json({
      vessels: [],
      total: 0,
      source: "Nenhuma",
      fallbackUsed: true,
      cached: false,
      updatedAt: new Date().toISOString(),
      creditsUsed: 0,
      zoom,
      forceRefresh,
    });
  }
}
