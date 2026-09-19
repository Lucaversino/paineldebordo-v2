import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  assertCanUse,
  debitCreditsAfterSuccess,
  ensureWallet,
  getBillingSettings,
  isSuperAdmin,
  logAisUsage,
  priceForCredits,
} from "../../../lib/credits";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DATADOCKED_BASE_URL = "https://datadocked.com/api/vessels_operations";
const APRSFI_BASE_URL = "https://api.aprs.fi/api/get";
const MARINESIA_BASE_URL = "https://api.marinesia.com/api/v2";

type MarinesiaState = {
  cache: Map<string, { body: any; expiresAt: number }>;
  lastCallAt: number;
};

const globalMarinesia = globalThis as typeof globalThis & { __painelMarinesia?: MarinesiaState };
const marinesiaState: MarinesiaState = globalMarinesia.__painelMarinesia || {
  cache: new Map(),
  lastCallAt: 0,
};
globalMarinesia.__painelMarinesia = marinesiaState;

const MARINESIA_FREE_TTL_MS = 30 * 60_000;

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrEmpty(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function unixToIso(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
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
  return Number.isFinite(n) ? labels[n] || `Status AIS ${n}` : textOrEmpty(value);
}

function isAisEntry(raw: any) {
  const type = textOrEmpty(raw?.type).toLowerCase();
  const entryClass = textOrEmpty(raw?.class).toLowerCase();
  return type === "a" || entryClass === "i" || Boolean(textOrEmpty(raw?.mmsi));
}

function aprsProviderMessage(body: any, status: number) {
  return (
    textOrEmpty(body?.description) ||
    textOrEmpty(body?.message) ||
    textOrEmpty(body?.error) ||
    `Erro APRS.fi (${status}).`
  );
}

async function callAprsFi(target: string, apiKey: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({
      name: target,
      what: "loc",
      apikey: apiKey,
      format: "json",
    });

    const response = await fetch(`${APRSFI_BASE_URL}?${params.toString()}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "Painel-de-Bordo/98",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = { result: "fail", description: `Resposta inválida do APRS.fi (${response.status}).` };
    }

    if (!response.ok || body?.result === "fail") {
      const message = aprsProviderMessage(body, response.status);
      const authFailed = /auth|api key|apikey|chave/i.test(message);
      throw Object.assign(new Error(message), {
        status: authFailed ? 401 : (response.status || 502),
        provider: "aprsfi",
        providerBody: body,
      });
    }

    return body;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("O APRS.fi demorou para responder. Tente novamente em alguns segundos."), {
        status: 504,
        provider: "aprsfi",
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function aprsEntries(data: any) {
  return (Array.isArray(data?.entries) ? data.entries : []).filter(isAisEntry);
}

function normalizeAprsMatch(raw: any) {
  const vesselClass = textOrEmpty(raw?.vesselclass);
  return {
    name: textOrEmpty(raw?.showname || raw?.name),
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    country: "",
    countryIso: "",
    shipType: vesselClass ? `AIS ${vesselClass}` : "Embarcação AIS",
    typeSpecific: vesselClass ? `AIS ${vesselClass}` : "Embarcação AIS",
    callsign: textOrEmpty(raw?.srccall),
  };
}

function normalizeAprsVessel(raw: any) {
  const lat = numberOrNull(raw?.lat);
  const lon = numberOrNull(raw?.lng ?? raw?.lon);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const speedKph = numberOrNull(raw?.speed);
  const providerTime = unixToIso(raw?.lasttime || raw?.time);
  const vesselClass = textOrEmpty(raw?.vesselclass);

  return {
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    name: textOrEmpty(raw?.showname || raw?.name),
    lat,
    lon,
    sog: speedKph == null ? null : Number((speedKph / 1.852).toFixed(2)),
    cog: numberOrNull(raw?.course),
    heading: numberOrNull(raw?.heading),
    draught: textOrEmpty(raw?.draught),
    destination: textOrEmpty(raw?.comment),
    lastPort: "",
    callsign: textOrEmpty(raw?.srccall),
    vesselType: vesselClass ? `AIS ${vesselClass}` : "Embarcação AIS",
    navStatusText: navStatusText(raw?.navstat),
    dataSource: "Premium AIS",
    positionReceived: providerTime,
    updateTime: providerTime,
    receivedAt: providerTime ? new Date(providerTime).getTime() : Date.now(),
    provider: "APRS.fi",
  };
}

function marinesiaProviderMessage(body: any, status: number) {
  return (
    textOrEmpty(body?.message) ||
    textOrEmpty(body?.error) ||
    `Erro Marinesia (${status}).`
  );
}

let marinesiaLimiterReady = false;
let marinesiaLimiterPromise: Promise<void> | null = null;

function rowsFromExecute(result: any) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

async function ensureMarinesiaLimiterTable() {
  if (marinesiaLimiterReady) return;
  if (!marinesiaLimiterPromise) {
    marinesiaLimiterPromise = (async () => {
      const db = getDb();
      await db.execute(sql`
        create table if not exists public.ais_provider_rate_limits (
          provider text primary key,
          next_allowed_at timestamptz not null default now(),
          last_status integer,
          last_limit integer,
          last_remaining integer,
          last_reset_epoch bigint,
          updated_at timestamptz not null default now()
        )
      `);
      marinesiaLimiterReady = true;
    })().catch((error) => {
      marinesiaLimiterPromise = null;
      marinesiaLimiterReady = false;
      throw error;
    });
  }
  await marinesiaLimiterPromise;
}

async function claimMarinesiaSlot(intervalSeconds: number) {
  await ensureMarinesiaLimiterTable();
  const db = getDb();
  const result: any = await db.execute(sql`
    with claimed as (
      insert into public.ais_provider_rate_limits (
        provider, next_allowed_at, updated_at
      )
      values (
        'marinesia',
        now() + make_interval(secs => ${intervalSeconds}),
        now()
      )
      on conflict (provider) do update
        set next_allowed_at = now() + make_interval(secs => ${intervalSeconds}),
            updated_at = now()
        where public.ais_provider_rate_limits.next_allowed_at <= now()
      returning next_allowed_at
    )
    select true as acquired, next_allowed_at from claimed
    union all
    select false as acquired, next_allowed_at
    from public.ais_provider_rate_limits
    where provider = 'marinesia'
      and not exists (select 1 from claimed)
    limit 1
  `);
  const row = rowsFromExecute(result)[0] || {};
  const acquired = row.acquired === true || row.acquired === "t";
  const nextAllowedAt = row.next_allowed_at ? new Date(row.next_allowed_at).getTime() : Date.now() + intervalSeconds * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((nextAllowedAt - Date.now()) / 1000));
  return { acquired, nextAllowedAt, retryAfterSeconds };
}

async function updateMarinesiaLimiter(input: {
  status?: number;
  limit?: number | null;
  remaining?: number | null;
  resetEpoch?: number | null;
  fallbackSeconds?: number;
}) {
  try {
    await ensureMarinesiaLimiterTable();
    const db = getDb();
    const resetEpoch = Number(input.resetEpoch);
    const fallbackSeconds = Math.max(1, Number(input.fallbackSeconds || 1800));
    const nextAllowedAt = Number.isFinite(resetEpoch) && resetEpoch > 0
      ? new Date(resetEpoch * 1000)
      : new Date(Date.now() + fallbackSeconds * 1000);
    const nextAllowedIso = nextAllowedAt.toISOString();

    await db.execute(sql`
      insert into public.ais_provider_rate_limits (
        provider, next_allowed_at, last_status, last_limit, last_remaining, last_reset_epoch, updated_at
      )
      values (
        'marinesia',
        ${nextAllowedIso}::timestamptz,
        ${input.status ?? null},
        ${input.limit ?? null},
        ${input.remaining ?? null},
        ${Number.isFinite(resetEpoch) && resetEpoch > 0 ? Math.floor(resetEpoch) : null},
        now()
      )
      on conflict (provider) do update
        set next_allowed_at = excluded.next_allowed_at,
            last_status = excluded.last_status,
            last_limit = excluded.last_limit,
            last_remaining = excluded.last_remaining,
            last_reset_epoch = excluded.last_reset_epoch,
            updated_at = now()
    `);
  } catch (error) {
    console.warn("[Marinesia] não foi possível atualizar o limitador persistente", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function callMarinesia(path: string, params: URLSearchParams, apiKey: string, timeoutMs = 8000) {
  params.set("key", apiKey);
  const safeParams = new URLSearchParams(params);
  safeParams.set("key", "***");
  const cacheKey = `${path}?${safeParams.toString()}`;
  const cached = marinesiaState.cache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return { ...cached.body, __cached: true };

  // A chave Free é compartilhada pelo projeto inteiro. Como a Vercel usa várias
  // instâncias serverless, um contador só em memória não protege a cota.
  // O banco faz o bloqueio global/atômico entre todos os usuários e instâncias.
  const minIntervalSeconds = Math.max(
    0,
    Number(process.env.MARINESIA_MIN_INTERVAL_SECONDS || 1800),
  );
  const minInterval = minIntervalSeconds * 1000;

  if (minInterval > 0 && marinesiaState.lastCallAt && now - marinesiaState.lastCallAt < minInterval) {
    const retryAfterSeconds = Math.max(1, Math.ceil((minInterval - (now - marinesiaState.lastCallAt)) / 1000));
    throw Object.assign(new Error("Marinesia em intervalo de proteção do plano grátis."), {
      status: 429,
      provider: "marinesia",
      localRateLimit: true,
      retryAfterSeconds,
    });
  }

  if (minIntervalSeconds > 0) {
    const slot = await claimMarinesiaSlot(minIntervalSeconds);
    if (!slot.acquired) {
      console.info("[Marinesia] cota protegida pelo limitador global", {
        path,
        retryAfterSeconds: slot.retryAfterSeconds,
      });
      throw Object.assign(new Error("Marinesia em intervalo de proteção do plano grátis."), {
        status: 429,
        provider: "marinesia",
        localRateLimit: true,
        retryAfterSeconds: slot.retryAfterSeconds,
      });
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${MARINESIA_BASE_URL}${path}?${params.toString()}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "Painel-de-Bordo/119",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    let body: any = null;
    try { body = await response.json(); } catch { body = null; }

    const returnedCount = Array.isArray(body?.data) ? body.data.length : body?.data ? 1 : Array.isArray(body) ? body.length : 0;
    const rateLimit = numberOrNull(response.headers.get("x-ratelimit-limit"));
    const rateRemaining = numberOrNull(response.headers.get("x-ratelimit-remaining"));
    const rateReset = numberOrNull(response.headers.get("x-ratelimit-reset"));

    console.info("[Marinesia] resposta da API", {
      path,
      status: response.status,
      ok: response.ok,
      apiError: Boolean(body?.error),
      message: textOrEmpty(body?.message || body?.error),
      returnedCount,
      rateLimit,
      rateRemaining,
      rateReset,
    });

    if (!response.ok || body?.error === true) {
      await updateMarinesiaLimiter({
        status: response.status || 502,
        limit: rateLimit,
        remaining: rateRemaining,
        resetEpoch: rateReset,
        fallbackSeconds: response.status === 429 ? minIntervalSeconds || 1800 : response.status >= 500 ? 60 : 300,
      });

      const retryAfterSeconds = rateReset
        ? Math.max(1, Math.ceil(rateReset - Date.now() / 1000))
        : response.status === 429 ? minIntervalSeconds || 1800 : undefined;

      throw Object.assign(new Error(marinesiaProviderMessage(body, response.status)), {
        status: response.status || 502,
        provider: "marinesia",
        providerBody: body,
        retryAfterSeconds,
      });
    }

    await updateMarinesiaLimiter({
      status: response.status,
      limit: rateLimit,
      remaining: rateRemaining,
      resetEpoch: rateReset,
      fallbackSeconds: minIntervalSeconds || 1800,
    });

    marinesiaState.lastCallAt = Date.now();
    marinesiaState.cache.set(cacheKey, { body, expiresAt: Date.now() + MARINESIA_FREE_TTL_MS });
    if (marinesiaState.cache.size > 40) {
      const first = marinesiaState.cache.keys().next().value;
      if (first) marinesiaState.cache.delete(first);
    }
    return body;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      await updateMarinesiaLimiter({ status: 504, fallbackSeconds: 60 });
      throw Object.assign(new Error("A Marinesia demorou para responder."), { status: 504, provider: "marinesia" });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMarinesiaVessel(raw: any, fallbackName = "") {
  const lat = numberOrNull(raw?.lat ?? raw?.latitude);
  const lon = numberOrNull(raw?.lng ?? raw?.lon ?? raw?.longitude);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const providerTime = textOrEmpty(raw?.ts || raw?.timestamp);
  return {
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    name: textOrEmpty(raw?.name) || fallbackName,
    lat,
    lon,
    sog: numberOrNull(raw?.sog),
    cog: numberOrNull(raw?.cog),
    heading: numberOrNull(raw?.hdt ?? raw?.heading),
    draught: textOrEmpty(raw?.draught),
    destination: textOrEmpty(raw?.dest ?? raw?.destination),
    lastPort: "",
    callsign: textOrEmpty(raw?.callsign),
    vesselType: textOrEmpty(raw?.type ?? raw?.ship_type) || "Embarcação AIS",
    navStatusText: navStatusText(raw?.status),
    dataSource: "Marinesia AIS",
    positionReceived: providerTime,
    updateTime: providerTime,
    receivedAt: providerTime && !Number.isNaN(new Date(providerTime).getTime()) ? new Date(providerTime).getTime() : Date.now(),
    provider: "Marinesia",
  };
}

async function getMarinesiaLatest(apiKey: string, input: { mmsi?: string; imo?: string; name?: string }) {
  const mmsi = textOrEmpty(input.mmsi).replace(/\D/g, "");
  const imo = textOrEmpty(input.imo).replace(/\D/g, "");
  if (!mmsi && !imo) return null;
  const params = new URLSearchParams();
  if (mmsi) params.set("mmsi", mmsi);
  else params.set("imo", imo);
  const body = await callMarinesia("/vessel/location/latest", params, apiKey);
  return normalizeMarinesiaVessel(body?.data ?? body, input.name || "");
}

function areaBox(latitude: number, longitude: number, radiusKm = 50) {
  const latDelta = radiusKm / 111.32;
  const cos = Math.max(0.15, Math.cos((latitude * Math.PI) / 180));
  const lonDelta = radiusKm / (111.32 * cos);
  return {
    latMin: Math.max(-90, latitude - latDelta),
    latMax: Math.min(90, latitude + latDelta),
    lonMin: Math.max(-180, longitude - lonDelta),
    lonMax: Math.min(180, longitude + lonDelta),
  };
}

async function getMarinesiaArea(apiKey: string, latitude: number, longitude: number, radiusKm = 50) {
  const box = areaBox(latitude, longitude, radiusKm);
  const params = new URLSearchParams({
    lat_min: box.latMin.toFixed(5),
    lat_max: box.latMax.toFixed(5),
    long_min: box.lonMin.toFixed(5),
    long_max: box.lonMax.toFixed(5),
  });
  const body = await callMarinesia("/vessel/area", params, apiKey);
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  return rows.map((raw: any) => normalizeMarinesiaVessel(raw, textOrEmpty(raw?.name) || "SEM NOME")).filter(Boolean);
}

function dataDockedProviderMessage(body: any, status: number) {
  const detail = body?.detail;
  return (
    (typeof detail === "string" && detail) ||
    (typeof detail?.message === "string" && detail.message) ||
    (typeof body?.message === "string" && body.message) ||
    (typeof body?.error === "string" && body.error) ||
    `Erro Data Docked (${status}).`
  );
}

async function callDataDocked(path: string, apiKey: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${DATADOCKED_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
        "user-agent": "Painel-de-Bordo/98",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = { detail: `Resposta inválida do provedor AIS (${response.status}).` };
    }

    if (response.ok) return body;
    throw Object.assign(new Error(dataDockedProviderMessage(body, response.status)), {
      status: response.status,
      provider: "datadocked",
      providerBody: body,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("A Data Docked demorou para responder. Tente novamente em alguns segundos."), {
        status: 504,
        provider: "datadocked",
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function detailOf(data: any) {
  return data?.detail && typeof data.detail === "object" ? data.detail : data;
}

function normalizeDataDockedMatch(raw: any) {
  return {
    name: textOrEmpty(raw?.name || raw?.vesselName),
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    country: textOrEmpty(raw?.country),
    countryIso: textOrEmpty(raw?.countryIso),
    shipType: textOrEmpty(raw?.shipType) || "Embarcação AIS",
    typeSpecific: textOrEmpty(raw?.typeSpecific || raw?.shipType) || "Embarcação AIS",
    callsign: textOrEmpty(raw?.callsign),
  };
}

function normalizeDataDockedVessel(raw: any, fallbackName = "") {
  const lat = numberOrNull(raw?.latitude ?? raw?.lat);
  const lon = numberOrNull(raw?.longitude ?? raw?.lon);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const providerTime = textOrEmpty(raw?.positionReceived || raw?.updateTime || raw?.timestamp);
  const updateTime = textOrEmpty(raw?.updateTime || raw?.positionReceived || raw?.timestamp);
  return {
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    name: textOrEmpty(raw?.name || raw?.vesselName) || fallbackName,
    lat,
    lon,
    sog: numberOrNull(raw?.speed ?? raw?.sog),
    cog: numberOrNull(raw?.course ?? raw?.cog),
    heading: numberOrNull(raw?.heading),
    draught: textOrEmpty(raw?.draught),
    destination: textOrEmpty(raw?.destination),
    lastPort: textOrEmpty(raw?.lastPort),
    callsign: textOrEmpty(raw?.callsign),
    vesselType: textOrEmpty(raw?.typeSpecific || raw?.shipType) || "Embarcação AIS",
    navStatusText: textOrEmpty(raw?.navigationalStatus || raw?.navStatus),
    dataSource: textOrEmpty(raw?.dataSource) || "Data Docked",
    positionReceived: providerTime,
    updateTime,
    receivedAt: providerTime && !Number.isNaN(new Date(providerTime).getTime()) ? new Date(providerTime).getTime() : Date.now(),
    provider: "Data Docked",
  };
}

function normalizeAreaVessel(raw: any) {
  const lat = numberOrNull(raw?.latitude ?? raw?.lat);
  const lon = numberOrNull(raw?.longitude ?? raw?.lon);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const speedRaw = numberOrNull(raw?.speed ?? raw?.sog);
  return {
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    name: textOrEmpty(raw?.name || raw?.vesselName) || "SEM NOME",
    lat,
    lon,
    sog: speedRaw == null ? null : (speedRaw > 80 ? speedRaw / 10 : speedRaw),
    cog: numberOrNull(raw?.course ?? raw?.cog),
    heading: numberOrNull(raw?.heading),
    vesselType: textOrEmpty(raw?.typeSpecific || raw?.shipType),
    navStatusText: textOrEmpty(raw?.navigationalStatus || raw?.navStatus),
    dataSource: textOrEmpty(raw?.dataSource) || "Terrestrial Area",
    receivedAt: Date.now(),
  };
}

export async function GET(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "Sessão encerrada. Entre novamente no painel.", code: "session_expired" },
      { status: 401 },
    );
  }

  const admin = isSuperAdmin(user);
  const aprsApiKey = process.env.APRSFI_API_KEY?.trim();
  const dataDockedApiKey = process.env.DATADOCKED_API_KEY?.trim();
  const marinesiaApiKey = process.env.MARINESIA_API_KEY?.trim();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "credits";

  try {
    if (action === "credits") {
      const settings = await getBillingSettings();
      const wallet = await ensureWallet(user, settings);
      return NextResponse.json({
        configured: Boolean(dataDockedApiKey),
        areaConfigured: Boolean(dataDockedApiKey),
        provider: "Data Docked",
        complementaryProvider: marinesiaApiKey ? "Marinesia AIS" : null,
        nameResolverFallback: Boolean(aprsApiKey),
        marinesiaConfigured: Boolean(marinesiaApiKey),
        credits: wallet.balance,
        creditUnitPrice: settings.CREDIT_UNIT_PRICE,
        balanceBrl: priceForCredits(settings, wallet.balance),
        adminFree: false,
        pricing: {
          locateCredits: settings.AIS_SINGLE_QUERY_CREDITS,
          updateCredits: settings.AIS_UPDATE_CREDITS,
          areaCredits: settings.AIS_AREA_QUERY_CREDITS,
          locateBrl: priceForCredits(settings, settings.AIS_SINGLE_QUERY_CREDITS),
        },
      });
    }

    if (action === "provider-health") {
      if (!admin) return NextResponse.json({ error: "Acesso administrativo negado." }, { status: 403 });
      if (!dataDockedApiKey) {
        return NextResponse.json({ ok: false, provider: "Data Docked", error: "DATADOCKED_API_KEY não configurada." }, { status: 503 });
      }

      let dataDockedCredits: number | null = null;
      if (dataDockedApiKey) {
        try {
          const data = await callDataDocked("/my-credits", dataDockedApiKey, 6000);
          const source = detailOf(data);
          dataDockedCredits = Number(source?.credits ?? data?.credits ?? 0);
        } catch {
          dataDockedCredits = null;
        }
      }

      return NextResponse.json({
        ok: true,
        provider: "Data Docked",
        configured: true,
        areaProvider: "Data Docked",
        complementaryProvider: marinesiaApiKey ? "Marinesia AIS" : "não configurado",
        marinesiaConfigured: Boolean(marinesiaApiKey),
        marinesiaPlanMode: "free-protected-30min",
        credits: dataDockedCredits,
      });
    }

    if (action === "name") {
      const providerChoice = (searchParams.get("provider") || "premium").toLowerCase();
      const isFreeSearch = providerChoice === "marinesia" || providerChoice === "free";
      const settings = await getBillingSettings();
      const rawName = (searchParams.get("name") || "").trim();

      if (rawName.length < 2) {
        return NextResponse.json({ error: "Digite pelo menos 2 caracteres do nome do barco." }, { status: 400 });
      }

      if (!isFreeSearch) {
        if (!dataDockedApiKey) {
          return NextResponse.json(
            { error: "DATADOCKED_API_KEY não configurada para o AIS Premium.", configured: false },
            { status: 503 },
          );
        }

        const encodedName = encodeURIComponent(rawName.replace(/\s+/g, "_"));
        const data = await callDataDocked(`/vessels-by-vessel-name?name=${encodedName}&page_number=1`, dataDockedApiKey);
        const source = detailOf(data);
        const rawItems = Array.isArray(source?.items) ? source.items : Array.isArray(data?.items) ? data.items : [];
        const items = rawItems
          .map(normalizeDataDockedMatch)
          .filter((item: any) => item.name || item.imo || item.mmsi);

        void logAisUsage({
          userId: user.id,
          action: "name_search_datadocked",
          vesselName: rawName,
          providerCalls: 1,
          creditsCharged: 0,
          estimatedApiCostBrl: 0,
          status: items.length ? "success" : "not_found",
        }).catch(() => null);

        return NextResponse.json({
          configured: true,
          provider: "Data Docked",
          query: rawName,
          exactSearch: true,
          total: Number(source?.total ?? data?.total ?? items.length),
          page: 1,
          items,
          finalQueryCredits: settings.AIS_SINGLE_QUERY_CREDITS,
          adminFree: false,
        });
      }

      if (!aprsApiKey) {
        return NextResponse.json(
          { error: "Busca gratuita por nome indisponível no momento. Use MMSI/IMO ou Buscar Região.", configured: false },
          { status: 503 },
        );
      }

      const data = await callAprsFi(rawName, aprsApiKey);
      const entries = aprsEntries(data);
      const items = entries
        .map(normalizeAprsMatch)
        .filter((item: any) => item.name || item.imo || item.mmsi);

      void logAisUsage({
        userId: user.id,
        action: "name_search_ais_free",
        vesselName: rawName,
        providerCalls: 1,
        creditsCharged: 0,
        estimatedApiCostBrl: 0,
        status: items.length ? "success" : "not_found",
      }).catch(() => null);

      return NextResponse.json({
        configured: true,
        provider: "AIS Free · identificador",
        query: rawName,
        exactSearch: true,
        total: items.length,
        page: 1,
        items,
        finalQueryCredits: 0,
        adminFree: false,
      });
    }

    if (action === "vessel") {
      const id = (searchParams.get("id") || "").replace(/[^0-9]/g, "");
      const name = (searchParams.get("name") || "").trim();
      const providerChoice = (searchParams.get("provider") || "premium").toLowerCase();
      const isFree = providerChoice === "marinesia" || providerChoice === "free";
      const isUpdate = searchParams.get("update") === "1";
      const target = id || name;

      if (!target) return NextResponse.json({ error: "Informe o nome, IMO ou MMSI." }, { status: 400 });

      if (isFree) {
        let vessel: any = null;
        let provider = "AIS Free";
        let marinesiaError: any = null;

        if (marinesiaApiKey && id) {
          try {
            const isLikelyMmsi = id.length === 9;
            vessel = await getMarinesiaLatest(marinesiaApiKey, {
              mmsi: isLikelyMmsi ? id : "",
              imo: isLikelyMmsi ? "" : id,
              name,
            });
            if (vessel) {
              vessel.dataSource = "Marinesia AIS";
              provider = "AIS Free · Marinesia";
            }
          } catch (error) {
            marinesiaError = error;
          }
        }

        if (!vessel && aprsApiKey) {
          try {
            const data = await callAprsFi(target, aprsApiKey);
            const entries = aprsEntries(data);
            const selected =
              (id
                ? entries.find((entry: any) => {
                    const mmsi = textOrEmpty(entry?.mmsi).replace(/\D/g, "");
                    const imo = textOrEmpty(entry?.imo).replace(/\D/g, "");
                    return mmsi === id || imo === id;
                  })
                : null) ||
              entries[0];
            vessel = normalizeAprsVessel(selected);
            if (vessel) {
              if (!vessel.name && name) vessel.name = name;
              vessel.dataSource = "AIS Free · APRS.fi";
              vessel.provider = "APRS.fi";
              provider = marinesiaApiKey ? "AIS Free · Marinesia/APRS.fi fallback" : "AIS Free · APRS.fi";
            }
          } catch {
            // Mantém a tentativa gratuita sem derrubar a rota.
          }
        }

        if (!vessel) {
          const message = marinesiaError?.localRateLimit
            ? "AIS Free aguardando a próxima janela da Marinesia e nenhum fallback retornou posição agora. Tente novamente ou use a busca por região."
            : "AIS Free não retornou uma posição válida para este barco agora.";
          return NextResponse.json({ error: message, code: "free_ais_no_position" }, { status: 404 });
        }

        void logAisUsage({
          userId: user.id,
          action: isUpdate ? "update_ais_free" : "locate_ais_free",
          vesselName: vessel.name || name || id,
          providerCalls: 1,
          creditsCharged: 0,
          estimatedApiCostBrl: 0,
          status: "success",
        }).catch(() => null);

        return NextResponse.json({
          configured: true,
          provider,
          vessel,
          creditCost: 0,
          billing: { charged: 0, balanceUnchanged: true },
          adminFree: false,
          free: true,
        });
      }

      const mode = isUpdate ? "ais_update" as const : "ais_single" as const;
      const access = await assertCanUse(user, mode);

      if (!dataDockedApiKey) {
        return NextResponse.json(
          { error: "DATADOCKED_API_KEY não configurada para o AIS Premium.", configured: false },
          { status: 503 },
        );
      }

      let identifier = id;
      let resolvedName = name;

      if (!identifier && name) {
        const encodedName = encodeURIComponent(name.replace(/\s+/g, "_"));
        const searchData = await callDataDocked(`/vessels-by-vessel-name?name=${encodedName}&page_number=1`, dataDockedApiKey);
        const searchSource = detailOf(searchData);
        const first = (Array.isArray(searchSource?.items) ? searchSource.items : Array.isArray(searchData?.items) ? searchData.items : [])[0];
        if (first) {
          identifier = textOrEmpty(first?.imo || first?.mmsi).replace(/\D/g, "");
          resolvedName = textOrEmpty(first?.name) || name;
        }
      }

      if (!identifier) {
        return NextResponse.json(
          { error: "Não foi possível obter IMO/MMSI para consultar a posição Premium. Nenhum crédito foi descontado." },
          { status: 404 },
        );
      }

      const data = await callDataDocked(`/get-vessel-location?imo_or_mmsi=${encodeURIComponent(identifier)}`, dataDockedApiKey);
      const source = detailOf(data);
      const vessel = normalizeDataDockedVessel(source, resolvedName);

      if (!vessel) {
        return NextResponse.json(
          { error: "Data Docked não retornou uma posição válida. Nenhum crédito foi descontado." },
          { status: 404 },
        );
      }

      const reference = vessel.mmsi || vessel.imo || identifier;
      const debit = await debitCreditsAfterSuccess({
        user,
        mode,
        description: `${isUpdate ? "Atualizar posição" : "Localizar barco"} — ${vessel.name || reference}`,
        reference,
        metadata: { name: vessel.name, lat: vessel.lat, lon: vessel.lon, provider: "Data Docked" },
      });

      void logAisUsage({
        userId: user.id,
        action: isUpdate ? "update_premium_datadocked" : "locate_premium_datadocked",
        vesselName: vessel.name || resolvedName || reference,
        providerCalls: 1,
        creditsCharged: debit.charged,
        estimatedApiCostBrl: access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL,
        status: "success",
      }).catch(() => null);

      return NextResponse.json({
        configured: true,
        provider: "Data Docked",
        vessel,
        creditCost: debit.charged,
        billing: debit,
        adminFree: false,
      });
    }

    if (action === "area") {
      const latitude = numberOrNull(searchParams.get("latitude"));
      const longitude = numberOrNull(searchParams.get("longitude"));
      const providerChoice = (searchParams.get("provider") || "premium").toLowerCase();
      const isFree = providerChoice === "marinesia" || providerChoice === "free";

      if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return NextResponse.json({ error: "Latitude/longitude inválidas para a busca por área." }, { status: 400 });
      }

      if (isFree) {
        if (!marinesiaApiKey) {
          return NextResponse.json(
            { error: "MARINESIA_API_KEY não configurada. O painel tentará a camada AIS Free de fallback.", configured: false, code: "marinesia_not_configured" },
            { status: 503 },
          );
        }

        const vessels = await getMarinesiaArea(marinesiaApiKey, latitude, longitude, 50);
        void logAisUsage({
          userId: user.id,
          action: "area_50km_ais_free",
          vesselName: null,
          providerCalls: 1,
          creditsCharged: 0,
          estimatedApiCostBrl: 0,
          status: vessels.length ? "success" : "not_found",
        }).catch(() => null);

        return NextResponse.json({
          configured: true,
          provider: "Marinesia AIS",
          free: true,
          center: { latitude, longitude },
          radiusKm: 50,
          vessels,
          total: vessels.length,
          creditCost: 0,
          billing: { charged: 0, balanceUnchanged: true },
          adminFree: false,
          providerNote: "AIS Free: a Marinesia limita a busca próxima no plano grátis e o painel usa cache para respeitar a cota.",
        });
      }

      if (!dataDockedApiKey) {
        return NextResponse.json(
          { error: "DATADOCKED_API_KEY não configurada para a busca Premium por área.", configured: false },
          { status: 503 },
        );
      }

      const access = await assertCanUse(user, "ais_area");
      const params = new URLSearchParams({
        latitude: String(Math.round(latitude * 10000) / 10000),
        longitude: String(Math.round(longitude * 10000) / 10000),
        circle_radius: "50",
      });
      const data = await callDataDocked(`/get-vessels-by-area?${params.toString()}`, dataDockedApiKey);
      const source = detailOf(data);
      const rawVessels = Array.isArray(source?.vessels) ? source.vessels : Array.isArray(source) ? source : [];
      const vessels = rawVessels.map(normalizeAreaVessel).filter(Boolean);

      const debit = await debitCreditsAfterSuccess({
        user,
        mode: "ais_area",
        description: "Busca AIS Premium por área — 50 km",
        reference: `${latitude.toFixed(4)},${longitude.toFixed(4)}`,
        metadata: { latitude, longitude, radiusKm: 50, vessels: vessels.length, provider: "Data Docked" },
      });

      void logAisUsage({
        userId: user.id,
        action: "area_50km_premium",
        vesselName: null,
        providerCalls: 1,
        creditsCharged: debit.charged,
        estimatedApiCostBrl: access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL,
        status: "success",
      }).catch(() => null);

      return NextResponse.json({
        configured: true,
        provider: "Data Docked",
        free: false,
        center: { latitude, longitude },
        radiusKm: 50,
        vessels,
        total: vessels.length,
        creditCost: debit.charged,
        billing: debit,
        adminFree: false,
      });
    }

    return NextResponse.json({ error: "Ação AIS inválida." }, { status: 400 });
  } catch (error: any) {
    const status = Number(error?.status) || 502;

    if (status === 402) {
      return NextResponse.json(
        {
          error: error?.message || "Saldo insuficiente.",
          code: "insufficient_credits",
          balance: error?.balance,
          required: error?.required,
        },
        { status: 402 },
      );
    }

    if (error?.provider === "aprsfi") {
      if (status === 401) {
        return NextResponse.json(
          {
            error: "A chave APRSFI_API_KEY foi recusada pelo APRS.fi. Gere uma nova chave na conta APRS.fi e atualize a Vercel.",
            code: "aprsfi_key_invalid",
          },
          { status: 502 },
        );
      }
      if (status === 429) {
        return NextResponse.json(
          {
            error: "Limite temporário de consultas do APRS.fi atingido. Aguarde alguns segundos e tente novamente.",
            code: "aprsfi_rate_limit",
          },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: error?.message || "Falha temporária no APRS.fi.", code: "aprsfi_error" },
        { status: status >= 500 ? status : 502 },
      );
    }

    if (error?.provider === "marinesia") {
      if (status === 401 || status === 403) {
        return NextResponse.json(
          { error: "A chave MARINESIA_API_KEY foi recusada pela Marinesia. Confira a chave na Vercel.", code: "marinesia_key_invalid" },
          { status: 502 },
        );
      }
      if (status === 429) {
        const retryAfterSeconds = Number(error?.retryAfterSeconds || 0);
        const retryMinutes = retryAfterSeconds > 0 ? Math.max(1, Math.ceil(retryAfterSeconds / 60)) : null;
        return NextResponse.json(
          {
            error: error?.localRateLimit
              ? `AIS Free aguardando a próxima janela da Marinesia${retryMinutes ? ` — tente novamente em cerca de ${retryMinutes} min` : ""}.`
              : "Limite da Marinesia atingido pelo provedor. O painel usará o fallback gratuito quando possível.",
            code: "marinesia_rate_limit",
            retryAfterSeconds: retryAfterSeconds || null,
          },
          { status: 429, headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined },
        );
      }
      return NextResponse.json(
        { error: error?.message || "Falha temporária na Marinesia.", code: "marinesia_error" },
        { status: status >= 500 ? status : 502 },
      );
    }

    if (error?.provider === "datadocked") {
      if (status === 401) {
        return NextResponse.json(
          {
            error: "A chave DATADOCKED_API_KEY foi recusada pela Data Docked. Confira a chave na Vercel.",
            code: "datadocked_key_invalid",
          },
          { status: 502 },
        );
      }
      if (status === 403) {
        return NextResponse.json(
          {
            error: "A conta Data Docked está sem créditos/plano para esta consulta por área.",
            code: "datadocked_no_provider_credits",
          },
          { status: 502 },
        );
      }
      if (status === 429) {
        return NextResponse.json(
          {
            error: "Limite temporário de consultas da Data Docked atingido. Aguarde alguns segundos e tente novamente.",
            code: "datadocked_rate_limit",
          },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: error?.message || "Falha temporária na Data Docked.", code: "datadocked_error" },
        { status: status >= 500 ? status : 502 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar AIS." },
      { status },
    );
  }
}
