import { sql } from "drizzle-orm";
import { getDb } from "../db";

export const USER_AREA_RADIUS_NM = 30;
export const ADMIN_AREA_RADIUS_NM = 80;
export const NM_TO_KM = 1.852;

type RegionalVessel = {
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
  dataSource: string;
  receivedAt: number;
};

let ready = false;
let readyPromise: Promise<void> | null = null;

function rowsOf(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function cleanLatitude(value: unknown) {
  const n = num(value);
  return n != null && Math.abs(n) <= 90 ? n : null;
}

export function cleanLongitude(value: unknown) {
  const n = num(value);
  return n != null && Math.abs(n) <= 180 ? n : null;
}

export async function ensureAisRegionalAreaTables() {
  if (ready) return;
  if (!readyPromise) {
    readyPromise = (async () => {
      const db = getDb();
      await db.execute(sql`
        create table if not exists public.ais_area_searches (
          id bigserial primary key,
          owner_id text not null,
          mode text not null default 'free',
          center_latitude double precision not null,
          center_longitude double precision not null,
          radius_nm double precision not null default 30,
          credits_used integer not null default 0,
          vessel_count integer not null default 0,
          source text,
          vessels_json text not null default '[]',
          searched_at text not null default CURRENT_TIMESTAMP::text
        )
      `);
      await db.execute(sql`create index if not exists idx_ais_area_searches_owner_time on public.ais_area_searches(owner_id, id desc)`);
      await db.execute(sql`alter table public.ais_area_searches enable row level security`);
      await db.execute(sql`
        create table if not exists public.ais_admin_regional_areas (
          id bigserial primary key,
          name text not null,
          center_latitude double precision not null,
          center_longitude double precision not null,
          radius_nm double precision not null default 80,
          auto_update boolean not null default true,
          visible boolean not null default true,
          vessel_count integer not null default 0,
          source text,
          vessels_json text not null default '[]',
          created_by text not null,
          created_at text not null default CURRENT_TIMESTAMP::text,
          updated_at text not null default CURRENT_TIMESTAMP::text,
          last_refreshed_at text,
          last_attempt_at text
        )
      `);
      await db.execute(sql`create index if not exists idx_ais_admin_regional_visible on public.ais_admin_regional_areas(visible, id desc)`);
      await db.execute(sql`alter table public.ais_admin_regional_areas enable row level security`);
      await db.execute(sql`create index if not exists idx_ais_admin_regional_auto on public.ais_admin_regional_areas(auto_update, id)`);
      ready = true;
    })().catch((error) => {
      ready = false;
      readyPromise = null;
      throw error;
    });
  }
  await readyPromise;
}

function haversineNm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const lat1 = rad(aLat);
  const lat2 = rad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const km = 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return km / NM_TO_KM;
}

export async function loadLiveVesselsInRadius(latitude: number, longitude: number, radiusNm: number, limit = 600): Promise<RegionalVessel[]> {
  const db = getDb();
  const radiusKm = radiusNm * NM_TO_KM;
  const latDelta = radiusKm / 111.32;
  const cos = Math.max(0.15, Math.cos(latitude * Math.PI / 180));
  const lonDelta = radiusKm / (111.32 * cos);
  const maxAgeHours = Math.max(1, Number(process.env.AIS_REGIONAL_MAX_AGE_HOURS || 6) || 6);
  const candidateLimit = Math.min(3000, Math.max(limit * 4, 800));

  try {
    const result = await db.execute(sql`
      select
        mmsi, imo, name, lat, lon, sog, cog, heading,
        vessel_type, nav_status_text, position_received, last_seen_at
      from public.ais_live_vessels
      where lat between ${latitude - latDelta} and ${latitude + latDelta}
        and lon between ${longitude - lonDelta} and ${longitude + lonDelta}
        and last_seen_at >= now() - make_interval(hours => ${maxAgeHours})
      order by last_seen_at desc
      limit ${candidateLimit}
    `);

    const seen = new Set<string>();
    const rows = rowsOf(result);
    const vessels: RegionalVessel[] = [];
    for (const row of rows) {
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      const mmsi = text(row.mmsi).replace(/\D/g, "");
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !mmsi || seen.has(mmsi)) continue;
      if (haversineNm(latitude, longitude, lat, lon) > radiusNm) continue;
      seen.add(mmsi);
      const rawStamp = row.position_received || row.last_seen_at || new Date();
      const date = rawStamp instanceof Date ? rawStamp : new Date(rawStamp);
      const stamp = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
      vessels.push({
        mmsi,
        imo: text(row.imo).replace(/\D/g, ""),
        name: text(row.name) || `MMSI ${mmsi}`,
        lat,
        lon,
        sog: num(row.sog),
        cog: num(row.cog),
        heading: num(row.heading),
        vesselType: text(row.vessel_type),
        navStatusText: text(row.nav_status_text),
        positionReceived: stamp,
        updateTime: stamp,
        dataSource: "AISStream · regional",
        receivedAt: Number.isNaN(date.getTime()) ? Date.now() : date.getTime(),
      });
      if (vessels.length >= limit) break;
    }
    return vessels;
  } catch (error: any) {
    const message = [error?.code, error?.message, error?.cause?.code, error?.cause?.message].filter(Boolean).join(" ").toUpperCase();
    if (message.includes("42P01") || message.includes("AIS_LIVE_VESSELS")) return [];
    throw error;
  }
}

export async function saveUserAreaSearch(input: {
  ownerId: string;
  mode: "free" | "premium";
  latitude: number;
  longitude: number;
  radiusNm?: number;
  creditsUsed?: number;
  source?: string;
  vessels: unknown[];
}) {
  await ensureAisRegionalAreaTables();
  const db = getDb();
  const radiusNm = Number(input.radiusNm || USER_AREA_RADIUS_NM);
  const vessels = Array.isArray(input.vessels) ? input.vessels.slice(0, 600) : [];
  const searchedAt = new Date().toISOString();
  const result = await db.execute(sql`
    insert into public.ais_area_searches
      (owner_id, mode, center_latitude, center_longitude, radius_nm, credits_used, vessel_count, source, vessels_json, searched_at)
    values
      (${input.ownerId}, ${input.mode}, ${input.latitude}, ${input.longitude}, ${radiusNm}, ${Math.max(0, Math.round(input.creditsUsed || 0))}, ${vessels.length}, ${input.source || null}, ${JSON.stringify(vessels)}, ${searchedAt})
    returning id, owner_id, mode, center_latitude, center_longitude, radius_nm, credits_used, vessel_count, source, vessels_json, searched_at
  `);
  await db.execute(sql`
    delete from public.ais_area_searches
    where owner_id = ${input.ownerId}
      and id not in (
        select id from public.ais_area_searches where owner_id = ${input.ownerId} order by id desc limit 30
      )
  `).catch(() => null);
  return regionalSearchRow(rowsOf(result)[0]);
}

function parseVesselsJson(value: unknown) {
  try {
    const parsed = JSON.parse(text(value) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function regionalSearchRow(row: any) {
  return {
    id: Number(row?.id),
    mode: text(row?.mode) === "premium" ? "premium" : "free",
    centerLatitude: Number(row?.center_latitude),
    centerLongitude: Number(row?.center_longitude),
    radiusNm: Number(row?.radius_nm || USER_AREA_RADIUS_NM),
    creditsUsed: Number(row?.credits_used || 0),
    vesselCount: Number(row?.vessel_count || 0),
    source: text(row?.source),
    vessels: parseVesselsJson(row?.vessels_json),
    searchedAt: text(row?.searched_at),
  };
}

export function adminAreaRow(row: any) {
  return {
    id: Number(row?.id),
    name: text(row?.name),
    centerLatitude: Number(row?.center_latitude),
    centerLongitude: Number(row?.center_longitude),
    radiusNm: Number(row?.radius_nm || ADMIN_AREA_RADIUS_NM),
    autoUpdate: row?.auto_update !== false,
    visible: row?.visible !== false,
    vesselCount: Number(row?.vessel_count || 0),
    source: text(row?.source),
    vessels: parseVesselsJson(row?.vessels_json),
    createdBy: text(row?.created_by),
    createdAt: text(row?.created_at),
    updatedAt: text(row?.updated_at),
    lastRefreshedAt: text(row?.last_refreshed_at),
    lastAttemptAt: text(row?.last_attempt_at),
  };
}

export async function refreshAdminRegionalArea(row: any) {
  await ensureAisRegionalAreaTables();
  const db = getDb();
  const id = Number(row?.id);
  const latitude = Number(row?.center_latitude ?? row?.centerLatitude);
  const longitude = Number(row?.center_longitude ?? row?.centerLongitude);
  const radiusNm = Number(row?.radius_nm ?? row?.radiusNm ?? ADMIN_AREA_RADIUS_NM);
  const now = new Date().toISOString();
  const vessels = await loadLiveVesselsInRadius(latitude, longitude, radiusNm, 900);

  if (!vessels.length) {
    const result = await db.execute(sql`
      update public.ais_admin_regional_areas
      set last_attempt_at = ${now}, updated_at = ${now}
      where id = ${id}
      returning *
    `);
    return { area: adminAreaRow(rowsOf(result)[0]), preserved: true };
  }

  const result = await db.execute(sql`
    update public.ais_admin_regional_areas
    set vessel_count = ${vessels.length}, source = ${"AISStream · regional"}, vessels_json = ${JSON.stringify(vessels)},
        last_refreshed_at = ${now}, last_attempt_at = ${now}, updated_at = ${now}
    where id = ${id}
    returning *
  `);
  return { area: adminAreaRow(rowsOf(result)[0]), preserved: false };
}

export async function createAdminRegionalArea(input: { name: string; latitude: number; longitude: number; createdBy: string }) {
  await ensureAisRegionalAreaTables();
  const db = getDb();
  const now = new Date().toISOString();
  const vessels = await loadLiveVesselsInRadius(input.latitude, input.longitude, ADMIN_AREA_RADIUS_NM, 900);
  const result = await db.execute(sql`
    insert into public.ais_admin_regional_areas
      (name, center_latitude, center_longitude, radius_nm, auto_update, visible, vessel_count, source, vessels_json, created_by, created_at, updated_at, last_refreshed_at, last_attempt_at)
    values
      (${input.name}, ${input.latitude}, ${input.longitude}, ${ADMIN_AREA_RADIUS_NM}, true, true, ${vessels.length}, ${"AISStream · regional"}, ${JSON.stringify(vessels)}, ${input.createdBy}, ${now}, ${now}, ${vessels.length ? now : null}, ${now})
    returning *
  `);
  return adminAreaRow(rowsOf(result)[0]);
}
