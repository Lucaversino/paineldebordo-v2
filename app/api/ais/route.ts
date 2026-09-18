import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../db";
import {
  assertCanUse,
  debitCreditsAfterSuccess,
  ensureWallet,
  getBillingSettings,
  logAisUsage,
  priceForCredits,
} from "../../../lib/credits";
import { getPanelUser } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BASE_URL = "https://datadocked.com/api/vessels_operations";

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrEmpty(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function normalizeName(value: string) {
  return value.toUpperCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

async function callDataDocked(path: string, apiKey: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: "application/json", "x-api-key": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.detail === "string" ? body.detail : typeof body?.error === "string" ? body.error : `Erro Data Docked (${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return body;
}

function pickIdentifier(raw: any) {
  const mmsi = textOrEmpty(raw?.mmsi).replace(/\D/g, "");
  const imo = textOrEmpty(raw?.imo).replace(/\D/g, "");
  return mmsi || imo;
}

function normalizePosition(raw: any, fallbackName = "") {
  const lat = numberOrNull(raw?.latitude);
  const lon = numberOrNull(raw?.longitude);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    name: textOrEmpty(raw?.name) || fallbackName,
    lat,
    lon,
    positionReceived: textOrEmpty(raw?.positionReceived),
    updateTime: textOrEmpty(raw?.updateTime),
    dataSource: textOrEmpty(raw?.dataSource),
    vesselRef: pickIdentifier(raw),
  };
}

let aisHistorySchemaReady = false;
let aisHistorySchemaPromise: Promise<void> | null = null;

async function ensureAisHistoryColumns() {
  if (aisHistorySchemaReady) return;
  if (!aisHistorySchemaPromise) {
    aisHistorySchemaPromise = (async () => {
      const db = getDb();
      try {
        await db.execute(sql`select credits_used from public.ais_search_history limit 1`);
      } catch (error: any) {
        const text = [error?.code, error?.message, error?.cause?.code, error?.cause?.message].filter(Boolean).join(" ").toUpperCase();
        const missing = text.includes("42P01") || text.includes("42703");
        if (!missing) throw error;
          await db.execute(sql`
            create table if not exists public.ais_search_history (
              id serial primary key,
              owner_id text not null,
              vessel_key text not null,
              name text not null,
              mmsi text,
              imo text,
              latitude double precision not null,
              longitude double precision not null,
              sog double precision,
              cog double precision,
              heading double precision,
              destination text,
              nav_status text,
              data_source text,
              position_received text,
              update_time text,
              credits_used integer not null default 0,
              queried_at text not null default CURRENT_TIMESTAMP::text
            )
          `);
          await db.execute(sql`alter table public.ais_search_history add column if not exists credits_used integer not null default 0`);
          await db.execute(sql`create index if not exists idx_ais_history_owner_time on public.ais_search_history(owner_id, queried_at)`);
      }
      aisHistorySchemaReady = true;
    })().catch((error) => { aisHistorySchemaPromise = null; aisHistorySchemaReady = false; throw error; });
  }
  await aisHistorySchemaPromise;
}

async function saveHistory(userId: string, vessel: { name: string; lat: number; lon: number; positionReceived: string; updateTime: string; dataSource: string; vesselRef: string }, creditsUsed: number) {
  await ensureAisHistoryColumns();
  const db = getDb();
  await db.execute(sql`
    insert into public.ais_search_history
      (owner_id, vessel_key, name, mmsi, imo, latitude, longitude, data_source, position_received, update_time, credits_used)
    values
      (${userId}, ${vessel.vesselRef || vessel.name}, ${vessel.name || "EMBARCAÇÃO"}, ${vessel.vesselRef || null}, null, ${vessel.lat}, ${vessel.lon}, ${vessel.dataSource || null}, ${vessel.positionReceived || null}, ${vessel.updateTime || null}, ${creditsUsed})
  `);
  await db.execute(sql`
    update public.ais_saved_vessels
    set last_latitude = ${vessel.lat}, last_longitude = ${vessel.lon},
        last_data_source = ${vessel.dataSource || null}, last_position_received = ${vessel.positionReceived || null},
        last_update_time = ${vessel.updateTime || null}, updated_at = CURRENT_TIMESTAMP::text
    where owner_id = ${userId} and (mmsi = ${vessel.vesselRef} or imo = ${vessel.vesselRef} or vessel_key = ${vessel.vesselRef})
  `).catch(() => null);
}

export async function GET() {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [wallet, settings] = await Promise.all([ensureWallet(user), getBillingSettings()]);
  return NextResponse.json({
    configured: Boolean(process.env.DATADOCKED_API_KEY?.trim()),
    wallet,
    pricing: {
      locateCredits: wallet.freeAisAccess ? 0 : settings.AIS_SINGLE_QUERY_CREDITS,
      updateCredits: wallet.freeAisAccess ? 0 : settings.AIS_UPDATE_CREDITS,
      locateBrl: wallet.freeAisAccess ? 0 : priceForCredits(settings, settings.AIS_SINGLE_QUERY_CREDITS),
      updateBrl: wallet.freeAisAccess ? 0 : priceForCredits(settings, settings.AIS_UPDATE_CREDITS),
      adminFree: wallet.freeAisAccess,
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.DATADOCKED_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "DATADOCKED_API_KEY não configurada na Vercel." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "locate");
  const isUpdate = action === "update";
  const mode = isUpdate ? "ais_update" as const : "ais_single" as const;
  let vesselName = String(body?.name || "").trim();
  const vesselRef = String(body?.vesselRef || "").replace(/\D/g, "");
  let providerCalls = 0;

  try {
    const access = await assertCanUse(user, mode);
    let targetId = vesselRef;

    if (!isUpdate && access.settings.AIS_CACHE_MINUTES > 0 && vesselName.length >= 2) {
      await ensureAisHistoryColumns();
      const cacheKey = normalizeName(vesselName).replace(/[^A-Z0-9]/g, "");
      const cachedRows = await getDb().execute(sql`
        select name, latitude, longitude, position_received, update_time, data_source, vessel_key
        from public.ais_search_history
        where owner_id = ${user.id}
          and regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = ${cacheKey}
          and queried_at::timestamptz >= now() - make_interval(mins => ${access.settings.AIS_CACHE_MINUTES})
        order by id desc limit 1
      `);
      const cached = Array.isArray(cachedRows) ? cachedRows[0] : null;
      if (cached) {
        const vessel = {
          name: String(cached.name || vesselName),
          lat: Number(cached.latitude),
          lon: Number(cached.longitude),
          positionReceived: String(cached.position_received || ""),
          updateTime: String(cached.update_time || ""),
          dataSource: String(cached.data_source || "CACHE"),
          vesselRef: String(cached.vessel_key || ""),
        };
        const debit = await debitCreditsAfterSuccess({ user, mode, description: `Localizar barco — ${vessel.name}`, reference: vessel.vesselRef, metadata: { cacheHit: true, name: vessel.name, lat: vessel.lat, lon: vessel.lon } });
        await Promise.allSettled([
          saveHistory(user.id, vessel, debit.charged),
          logAisUsage({ userId: user.id, action: "locate", vesselName: vessel.name, providerCalls: 0, cacheHit: true, creditsCharged: debit.charged, estimatedApiCostBrl: 0, status: "success" }),
        ]);
        return NextResponse.json({ vessel, cacheHit: true, billing: { chargedCredits: debit.charged, balance: debit.balance, free: debit.free, label: debit.free ? "GRÁTIS — ADMIN" : `${debit.charged} crédito(s)` } });
      }
    }

    if (!isUpdate) {
      if (vesselName.length < 2) return NextResponse.json({ error: "Digite o nome da embarcação." }, { status: 400 });
      const providerName = vesselName.replace(/\s+/g, "_");
      const params = new URLSearchParams({ name: providerName, page_number: "1" });
      const names = await callDataDocked(`/vessels-by-vessel-name?${params.toString()}`, apiKey);
      providerCalls += 1;
      const items = Array.isArray(names?.items) ? names.items : [];
      if (!items.length) {
        await logAisUsage({ userId: user.id, action: "locate", vesselName, providerCalls, creditsCharged: 0, estimatedApiCostBrl: access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL * providerCalls, status: "not_found" });
        return NextResponse.json({ error: "Embarcação não encontrada. Nenhum crédito foi descontado." }, { status: 404 });
      }
      const normalizedQuery = normalizeName(vesselName);
      const chosen = items.find((item: any) => normalizeName(textOrEmpty(item?.name)) === normalizedQuery) || items[0];
      targetId = pickIdentifier(chosen);
      vesselName = textOrEmpty(chosen?.name) || vesselName;
      if (!targetId) {
        await logAisUsage({ userId: user.id, action: "locate", vesselName, providerCalls, creditsCharged: 0, estimatedApiCostBrl: access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL * providerCalls, status: "invalid_result" });
        return NextResponse.json({ error: "Embarcação encontrada sem identificador válido. Nenhum crédito foi descontado." }, { status: 404 });
      }
    } else if (!targetId) {
      return NextResponse.json({ error: "Não foi possível identificar o barco para atualizar." }, { status: 400 });
    }

    const locationRaw = await callDataDocked(`/get-vessel-location?imo_or_mmsi=${encodeURIComponent(targetId)}`, apiKey);
    providerCalls += 1;
    const vessel = normalizePosition(locationRaw, vesselName);
    if (!vessel) {
      await logAisUsage({ userId: user.id, action: isUpdate ? "update" : "locate", vesselName, providerCalls, creditsCharged: 0, estimatedApiCostBrl: access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL * providerCalls, status: "no_position" });
      return NextResponse.json({ error: "Não foi possível consultar a posição neste momento. Nenhum crédito foi descontado." }, { status: 404 });
    }
    vessel.vesselRef = vessel.vesselRef || targetId;

    const debit = await debitCreditsAfterSuccess({
      user,
      mode,
      description: `${isUpdate ? "Atualizar posição" : "Localizar barco"} — ${vessel.name || vesselName}`,
      reference: vessel.vesselRef,
      metadata: { name: vessel.name, lat: vessel.lat, lon: vessel.lon },
    });
    await Promise.allSettled([
      saveHistory(user.id, vessel, debit.charged),
      logAisUsage({
        userId: user.id,
        action: isUpdate ? "update" : "locate",
        vesselName: vessel.name,
        providerCalls,
        creditsCharged: debit.charged,
        estimatedApiCostBrl: debit.settings.AIS_PROVIDER_COST_PER_QUERY_BRL * providerCalls,
        status: "success",
      }),
    ]);

    return NextResponse.json({
      vessel,
      billing: {
        chargedCredits: debit.charged,
        balance: debit.balance,
        free: debit.free,
        label: debit.free ? "GRÁTIS — ADMIN" : `${debit.charged} crédito(s)`,
      },
    });
  } catch (error: any) {
    const status = Number(error?.status) || 502;
    if (providerCalls > 0) {
      const settings = await getBillingSettings().catch(() => null);
      await logAisUsage({
        userId: user.id,
        action: isUpdate ? "update" : "locate",
        vesselName,
        providerCalls,
        creditsCharged: 0,
        estimatedApiCostBrl: (settings?.AIS_PROVIDER_COST_PER_QUERY_BRL || 0) * providerCalls,
        status: "error",
        errorText: error?.message || "Falha AIS",
      }).catch(() => null);
    }
    if (status === 402) {
      return NextResponse.json({ error: error?.message, code: "insufficient_credits", balance: error?.balance, required: error?.required }, { status: 402 });
    }
    return NextResponse.json({ error: "Não foi possível consultar a posição neste momento. Nenhum crédito foi descontado." }, { status });
  }
}
