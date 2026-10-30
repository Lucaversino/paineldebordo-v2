import { desc, eq, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { adminFreeVessels } from "../db/schema";
import { rankGfwEntries } from "./gfw";

const APRSFI_BASE_URL = "https://api.aprs.fi/api/get";
const SHIPFINDER_BASE_URL = "https://api.elaneglobal.com/v1/AIS";
const GFW_SEARCH_URL = "https://gateway.api.globalfishingwatch.org/v3/vessels/search";

let ready = false;
let readyPromise: Promise<void> | null = null;

type Db = ReturnType<typeof getDb>;
export type AdminFreeVesselDbRow = typeof adminFreeVessels.$inferSelect;

type VesselIdentity = {
  name?: string | null;
  mmsi?: string | null;
  imo?: string | null;
  callsign?: string | null;
  flag?: string | null;
};

export type FreePosition = {
  name: string;
  mmsi: string;
  imo: string;
  callsign: string;
  vesselType: string;
  latitude: number;
  longitude: number;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  navStatus: string;
  dataSource: string;
  positionReceived: string;
};

function text(value: unknown, max = 200) {
  return value == null ? "" : String(value).trim().slice(0, max);
}

function digits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function unixToIso(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function navStatusText(value: unknown) {
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
  const n = Number(value);
  return Number.isFinite(n) ? labels[n] || `Status AIS ${n}` : text(value);
}

export function vesselKey(identity: VesselIdentity) {
  const mmsi = digits(identity.mmsi);
  const imo = digits(identity.imo);
  const name = text(identity.name, 120).toLowerCase().replace(/\s+/g, " ");
  if (mmsi) return `mmsi:${mmsi}`;
  if (imo) return `imo:${imo}`;
  return name ? `name:${name}` : "";
}

export async function ensureAdminFreeVesselsTable(db: Db) {
  if (ready) return;
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.execute(sql`
        create table if not exists public.admin_free_vessels (
          id serial primary key,
          vessel_key text not null unique,
          name text not null,
          mmsi text,
          imo text,
          callsign text,
          flag text,
          automatic boolean not null default true,
          last_latitude double precision,
          last_longitude double precision,
          last_sog double precision,
          last_cog double precision,
          last_heading double precision,
          vessel_type text,
          nav_status text,
          last_data_source text,
          last_position_received text,
          last_checked_at text,
          last_error text,
          created_by text not null,
          created_at text not null default CURRENT_TIMESTAMP::text,
          updated_at text not null default CURRENT_TIMESTAMP::text
        )
      `);
      await db.execute(sql`create index if not exists idx_admin_free_vessels_auto on public.admin_free_vessels(automatic, id)`);
      await db.execute(sql`alter table public.admin_free_vessels enable row level security`);
      ready = true;
    })().catch((error) => {
      ready = false;
      readyPromise = null;
      throw error;
    });
  }
  await readyPromise;
}

export function rowToAdminFreeVessel(row: AdminFreeVesselDbRow) {
  return {
    id: row.id,
    vesselKey: row.vesselKey,
    name: row.name,
    mmsi: row.mmsi || "",
    imo: row.imo || "",
    callsign: row.callsign || "",
    flag: row.flag || "",
    automatic: row.automatic !== false,
    latitude: row.lastLatitude,
    longitude: row.lastLongitude,
    sog: row.lastSog,
    cog: row.lastCog,
    heading: row.lastHeading,
    vesselType: row.vesselType || "",
    navStatus: row.navStatus || "",
    dataSource: row.lastDataSource || "AIS FREE · ADMIN",
    positionReceived: row.lastPositionReceived || "",
    lastCheckedAt: row.lastCheckedAt || "",
    lastError: row.lastError || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listAdminFreeVessels(db: Db) {
  await ensureAdminFreeVesselsTable(db);
  return db.select().from(adminFreeVessels).orderBy(desc(adminFreeVessels.id)).limit(250);
}

export type AdminFreeSearchVessel = {
  id: string;
  name: string;
  mmsi: string;
  imo: string;
  callsign: string;
  flag: string;
  source?: string;
};

async function searchGfwForAdmin(query: string, token: string): Promise<AdminFreeSearchVessel[]> {
  const params = new URLSearchParams({
    query,
    "datasets[0]": "public-global-vessel-identity:latest",
    "includes[0]": "MATCH_CRITERIA",
    limit: "50",
  });
  const response = await fetch(`${GFW_SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 429
      ? "Limite temporário do Global Fishing Watch atingido."
      : response.status === 401 || response.status === 403
        ? "Token do Global Fishing Watch inválido ou sem permissão."
        : "Global Fishing Watch indisponível no momento.";
    throw Object.assign(new Error(message), { status: response.status || 502 });
  }
  if (!Array.isArray(body?.entries)) return [];
  return rankGfwEntries(body.entries, query).slice(0, 30).map((row) => ({
    id: row.id || row.mmsi || row.imo || row.name,
    name: row.name,
    mmsi: row.mmsi,
    imo: row.imo,
    callsign: row.callsign,
    flag: row.flag,
    source: "Global Fishing Watch",
  }));
}

export async function searchFreeForAdmin(query: string): Promise<{ vessels: AdminFreeSearchVessel[]; total: number; source?: string }> {
  const q = text(query, 100);
  if (q.length < 2) throw Object.assign(new Error("Digite nome, MMSI ou IMO."), { status: 400 });

  const gfwToken = process.env.GFW_API_TOKEN?.trim();
  const aprsKey = process.env.APRSFI_API_KEY?.trim();
  const shipFinderKey = process.env.SHIPFINDER_API_KEY?.trim();

  const onlyDigits = digits(q);
  if (onlyDigits.length === 7 || onlyDigits.length === 9) {
    const vessel = {
      id: onlyDigits,
      name: onlyDigits.length === 9 ? `MMSI ${onlyDigits}` : `IMO ${onlyDigits}`,
      mmsi: onlyDigits.length === 9 ? onlyDigits : "",
      imo: onlyDigits.length === 7 ? onlyDigits : "",
      callsign: "",
      flag: "",
      source: "Identificador direto",
    };
    return { vessels: [vessel], total: 1, source: "identifier" };
  }

  // V206: nome/indicativo primeiro no GFW, que é a fonte de identidade.
  // APRS.fi/ShipFinder ficam para a posição atual após o barco ser escolhido.
  if (gfwToken) {
    try {
      const vessels = await searchGfwForAdmin(q, gfwToken);
      if (vessels.length) return { vessels, total: vessels.length, source: "gfw" };
    } catch (error) {
      // Se GFW estiver temporariamente indisponível, ainda tentamos a fonte de identidade alternativa.
      if (!shipFinderKey && !aprsKey) throw error;
    }
  }

  // Fallback de identidade: ShipFinder é melhor que APRS.fi para pesquisa textual por nome.
  if (shipFinderKey) {
    try {
      const data = await callShipFinder("/VesselSearch", new URLSearchParams({ keywords: q, max: "20" }), shipFinderKey);
      const vessels = (Array.isArray(data?.data) ? data.data : []).map((raw: any) => ({
        id: digits(raw?.mmsi) || digits(raw?.imo) || text(raw?.ship_name || raw?.name, 120),
        name: text(raw?.ship_name || raw?.name, 120),
        mmsi: digits(raw?.mmsi),
        imo: digits(raw?.imo),
        callsign: text(raw?.call_sign, 80),
        flag: text(raw?.country || raw?.flag, 24),
        source: "ShipFinder",
      })).filter((item: AdminFreeSearchVessel) => item.name || item.mmsi || item.imo);
      if (vessels.length) return { vessels, total: vessels.length, source: "shipfinder" };
    } catch {}
  }

  // APRS.fi fica como último fallback; ele é mais útil para posição/identificador do que busca textual.
  if (aprsKey) {
    try {
      const raw = await callAprsFi(q, aprsKey);
      if (raw) {
        const vessel: AdminFreeSearchVessel = {
          id: digits(raw?.mmsi) || text(raw?.name || raw?.showname, 120),
          name: text(raw?.showname || raw?.name, 120) || q,
          mmsi: digits(raw?.mmsi),
          imo: digits(raw?.imo),
          callsign: text(raw?.srccall, 80),
          flag: "",
          source: "APRS.fi",
        };
        return { vessels: [vessel], total: 1, source: "aprsfi" };
      }
    } catch {}
  }

  if (!gfwToken && !shipFinderKey && !aprsKey) {
    throw Object.assign(new Error("Nenhuma fonte de busca FREE está configurada. Configure GFW_API_TOKEN e pelo menos uma API de posição FREE."), { status: 503 });
  }
  return { vessels: [], total: 0, source: gfwToken ? "gfw" : shipFinderKey ? "shipfinder" : "aprsfi" };
}

async function callAprsFi(target: string, apiKey: string) {
  const params = new URLSearchParams({ name: target, what: "loc", apikey: apiKey, format: "json" });
  const response = await fetch(`${APRSFI_BASE_URL}?${params.toString()}`, {
    headers: { accept: "application/json", "user-agent": "Painel-de-Bordo/Admin-Free-V202" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.result === "fail") {
    throw Object.assign(new Error(text(body?.description || body?.message || body?.error) || "Falha no APRS.fi."), { status: response.status || 502 });
  }
  const rows = (Array.isArray(body?.entries) ? body.entries : []).filter((raw: any) => {
    const type = text(raw?.type).toLowerCase();
    const entryClass = text(raw?.class).toLowerCase();
    return type === "a" || entryClass === "i" || Boolean(digits(raw?.mmsi));
  });
  return rows[0] || null;
}

function aprsPosition(raw: any, identity: VesselIdentity): FreePosition | null {
  const latitude = numberOrNull(raw?.lat);
  const longitude = numberOrNull(raw?.lng ?? raw?.lon);
  if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const speedKph = numberOrNull(raw?.speed);
  const stamp = unixToIso(raw?.lasttime || raw?.time);
  const vesselClass = text(raw?.vesselclass);
  return {
    name: text(raw?.showname || raw?.name) || text(identity.name, 120),
    mmsi: digits(raw?.mmsi) || digits(identity.mmsi),
    imo: digits(raw?.imo) || digits(identity.imo),
    callsign: text(raw?.srccall) || text(identity.callsign, 80),
    vesselType: vesselClass ? `AIS ${vesselClass}` : "Embarcação AIS",
    latitude,
    longitude,
    sog: speedKph == null ? null : Number((speedKph / 1.852).toFixed(2)),
    cog: numberOrNull(raw?.course),
    heading: numberOrNull(raw?.heading),
    navStatus: navStatusText(raw?.navstat),
    dataSource: "AIS Free · APRS.fi · ADMIN",
    positionReceived: stamp,
  };
}

async function callShipFinder(path: string, params: URLSearchParams, apiKey: string) {
  const query = new URLSearchParams(params);
  query.set("key", apiKey);
  const response = await fetch(`${SHIPFINDER_BASE_URL}${path}?${query.toString()}`, {
    headers: { accept: "application/json", "user-agent": "Painel-de-Bordo/Admin-Free-V202" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || Number(body?.status) !== 0) {
    throw Object.assign(new Error(text(body?.msg || body?.message || body?.error) || "Falha na ShipFinder."), { status: response.status >= 400 ? response.status : 502 });
  }
  return body;
}

function shipFinderPosition(raw: any, identity: VesselIdentity): FreePosition | null {
  const latitude = numberOrNull(raw?.lat ?? raw?.latitude);
  const longitude = numberOrNull(raw?.lng ?? raw?.lon ?? raw?.longitude);
  if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const stamp = unixToIso(raw?.last_time);
  return {
    name: text(raw?.ship_name || raw?.name) || text(identity.name, 120),
    mmsi: digits(raw?.mmsi) || digits(identity.mmsi),
    imo: digits(raw?.imo) || digits(identity.imo),
    callsign: text(raw?.call_sign) || text(identity.callsign, 80),
    vesselType: text(raw?.ship_type) || "Embarcação AIS",
    latitude,
    longitude,
    sog: numberOrNull(raw?.sog),
    cog: numberOrNull(raw?.cog),
    heading: numberOrNull(raw?.hdg ?? raw?.heading),
    navStatus: navStatusText(raw?.navistat),
    dataSource: "AIS Free · ShipFinder · ADMIN",
    positionReceived: stamp,
  };
}

async function lookupWithShipFinder(identity: VesselIdentity, apiKey: string) {
  let mmsi = digits(identity.mmsi);
  if (!mmsi) {
    const query = text(identity.name || identity.imo, 120);
    if (!query) return null;
    const search = await callShipFinder("/VesselSearch", new URLSearchParams({ keywords: query, max: "8" }), apiKey);
    const candidates = Array.isArray(search?.data) ? search.data : [];
    const wantedImo = digits(identity.imo);
    const named = text(identity.name, 120).toLowerCase();
    const match = candidates.find((row: any) => wantedImo && digits(row?.imo) === wantedImo)
      || candidates.find((row: any) => named && text(row?.ship_name || row?.name, 120).toLowerCase() === named)
      || candidates[0];
    mmsi = digits(match?.mmsi);
  }
  if (!mmsi) return null;
  const position = await callShipFinder("/VesselPositionSingle", new URLSearchParams({ mmsi }), apiKey);
  return shipFinderPosition(position?.data, identity);
}

export async function lookupFreePosition(identity: VesselIdentity): Promise<FreePosition> {
  const aprsKey = process.env.APRSFI_API_KEY?.trim();
  const shipFinderKey = process.env.SHIPFINDER_API_KEY?.trim();
  if (!aprsKey && !shipFinderKey) throw Object.assign(new Error("Nenhuma API AIS Free está configurada."), { status: 503 });

  const target = digits(identity.mmsi) || digits(identity.imo) || text(identity.name, 120);
  let lastError: unknown = null;

  if (aprsKey && target) {
    try {
      const raw = await callAprsFi(target, aprsKey);
      const vessel = raw ? aprsPosition(raw, identity) : null;
      if (vessel) return vessel;
      lastError = new Error("Posição não encontrada no APRS.fi.");
    } catch (error) { lastError = error; }
  }

  if (shipFinderKey) {
    try {
      const vessel = await lookupWithShipFinder(identity, shipFinderKey);
      if (vessel) return vessel;
      lastError = new Error("Posição não encontrada na ShipFinder.");
    } catch (error) { lastError = error; }
  }

  throw Object.assign(new Error(lastError instanceof Error ? lastError.message : "Posição gratuita não encontrada."), { status: 404 });
}

export async function refreshAdminFreeVessel(db: Db, row: AdminFreeVesselDbRow) {
  const checkedAt = new Date().toISOString();
  try {
    const position = await lookupFreePosition(row);
    const [updated] = await db.update(adminFreeVessels).set({
      name: position.name || row.name,
      mmsi: position.mmsi || row.mmsi,
      imo: position.imo || row.imo,
      callsign: position.callsign || row.callsign,
      lastLatitude: position.latitude,
      lastLongitude: position.longitude,
      lastSog: position.sog,
      lastCog: position.cog,
      lastHeading: position.heading,
      vesselType: position.vesselType || row.vesselType,
      navStatus: position.navStatus || row.navStatus,
      lastDataSource: position.dataSource,
      lastPositionReceived: position.positionReceived,
      lastCheckedAt: checkedAt,
      lastError: "",
      updatedAt: checkedAt,
    }).where(eq(adminFreeVessels.id, row.id)).returning();
    return updated || row;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posição gratuita não encontrada.";
    const [updated] = await db.update(adminFreeVessels).set({
      lastCheckedAt: checkedAt,
      lastError: message.slice(0, 400),
      updatedAt: checkedAt,
    }).where(eq(adminFreeVessels.id, row.id)).returning();
    return updated || row;
  }
}
