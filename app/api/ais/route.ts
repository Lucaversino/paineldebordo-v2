import { NextRequest, NextResponse } from "next/server";
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
    dataSource: "APRS.fi AIS",
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

async function callMarinesia(path: string, params: URLSearchParams, apiKey: string, timeoutMs = 8000) {
  params.set("key", apiKey);
  const safeParams = new URLSearchParams(params);
  safeParams.set("key", "***");
  const cacheKey = `${path}?${safeParams.toString()}`;
  const cached = marinesiaState.cache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return { ...cached.body, __cached: true };

  // Proteção para o plano grátis mostrado no painel: 1 chamada a cada 30 min.
  // Ao trocar de plano, reduza MARINESIA_MIN_INTERVAL_SECONDS na Vercel.
  const minInterval = Math.max(
    0,
    Number(process.env.MARINESIA_MIN_INTERVAL_SECONDS || 1800) * 1000,
  );
  if (minInterval > 0 && marinesiaState.lastCallAt && now - marinesiaState.lastCallAt < minInterval) {
    throw Object.assign(new Error("Marinesia em intervalo de proteção do plano grátis."), {
      status: 429,
      provider: "marinesia",
      localRateLimit: true,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    marinesiaState.lastCallAt = now;
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
    if (!response.ok || body?.error === true) {
      throw Object.assign(new Error(marinesiaProviderMessage(body, response.status)), {
        status: response.status || 502,
        provider: "marinesia",
        providerBody: body,
      });
    }
    marinesiaState.cache.set(cacheKey, { body, expiresAt: Date.now() + MARINESIA_FREE_TTL_MS });
    if (marinesiaState.cache.size > 40) {
      const first = marinesiaState.cache.keys().next().value;
      if (first) marinesiaState.cache.delete(first);
    }
    return body;
  } catch (error: any) {
    if (error?.name === "AbortError") {
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
        configured: Boolean(aprsApiKey),
        areaConfigured: Boolean(dataDockedApiKey),
        provider: "APRS.fi",
        complementaryProvider: marinesiaApiKey ? "Marinesia AIS" : null,
        marinesiaConfigured: Boolean(marinesiaApiKey),
        credits: wallet.balance,
        creditUnitPrice: settings.CREDIT_UNIT_PRICE,
        balanceBrl: priceForCredits(settings, wallet.balance),
        adminFree: false,
        pricing: {
          locateCredits: 0,
          updateCredits: 0,
          areaCredits: settings.AIS_AREA_QUERY_CREDITS,
          locateBrl: 0,
        },
      });
    }

    if (action === "provider-health") {
      if (!admin) return NextResponse.json({ error: "Acesso administrativo negado." }, { status: 403 });
      if (!aprsApiKey) {
        return NextResponse.json({ ok: false, provider: "APRS.fi", error: "APRSFI_API_KEY não configurada." }, { status: 503 });
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
        provider: "APRS.fi",
        configured: true,
        areaProvider: dataDockedApiKey ? "Data Docked" : marinesiaApiKey ? "Marinesia AIS (fallback)" : "não configurado",
        complementaryProvider: marinesiaApiKey ? "Marinesia AIS" : "não configurado",
        marinesiaConfigured: Boolean(marinesiaApiKey),
        marinesiaPlanMode: "free-protected-30min",
        credits: dataDockedCredits,
      });
    }

    if (action === "name") {
      if (!aprsApiKey) {
        return NextResponse.json(
          { error: "APRSFI_API_KEY não configurada na Vercel.", configured: false },
          { status: 503 },
        );
      }

      const rawName = (searchParams.get("name") || "").trim();
      if (rawName.length < 2) {
        return NextResponse.json({ error: "Digite pelo menos 2 caracteres do nome do barco." }, { status: 400 });
      }

      const data = await callAprsFi(rawName, aprsApiKey);
      const entries = aprsEntries(data);
      const items = entries
        .map(normalizeAprsMatch)
        .filter((item: any) => item.name || item.imo || item.mmsi);

      void logAisUsage({
        userId: user.id,
        action: "name_search_aprsfi",
        vesselName: rawName,
        providerCalls: 1,
        creditsCharged: 0,
        estimatedApiCostBrl: 0,
        status: items.length ? "success" : "not_found",
      }).catch(() => null);

      return NextResponse.json({
        configured: true,
        provider: "APRS.fi",
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
      const target = name || id;
      if (!target) return NextResponse.json({ error: "Informe o nome, IMO ou MMSI." }, { status: 400 });

      let aprsError: any = null;
      if (aprsApiKey) {
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

          const vessel = normalizeAprsVessel(selected);
          if (vessel) {
            if (!vessel.name && name) vessel.name = name;
            void logAisUsage({
              userId: user.id,
              action: searchParams.get("update") === "1" ? "update_aprsfi" : "locate_aprsfi",
              vesselName: vessel.name || name || target,
              providerCalls: 1,
              creditsCharged: 0,
              estimatedApiCostBrl: 0,
              status: "success",
            }).catch(() => null);
            return NextResponse.json({
              configured: true,
              provider: "APRS.fi",
              vessel,
              creditCost: 0,
              billing: { charged: 0, balanceUnchanged: true },
              adminFree: false,
            });
          }
          aprsError = new Error("APRS.fi não retornou posição válida.");
        } catch (error) {
          aprsError = error;
        }
      }

      // Marinesia entra como complemento/fallback quando o alvo tem MMSI/IMO.
      if (marinesiaApiKey && id) {
        try {
          const isLikelyMmsi = id.length === 9;
          const vessel = await getMarinesiaLatest(marinesiaApiKey, {
            mmsi: isLikelyMmsi ? id : "",
            imo: isLikelyMmsi ? "" : id,
            name,
          });
          if (vessel) {
            void logAisUsage({
              userId: user.id,
              action: searchParams.get("update") === "1" ? "update_marinesia" : "locate_marinesia",
              vesselName: vessel.name || name || target,
              providerCalls: 1,
              creditsCharged: 0,
              estimatedApiCostBrl: 0,
              status: "success",
            }).catch(() => null);
            return NextResponse.json({
              configured: true,
              provider: "Marinesia",
              fallbackUsed: true,
              vessel,
              creditCost: 0,
              billing: { charged: 0, balanceUnchanged: true },
              adminFree: false,
            });
          }
        } catch (error: any) {
          if (!error?.localRateLimit) aprsError = aprsError || error;
        }
      }

      if (!aprsApiKey && !marinesiaApiKey) {
        return NextResponse.json(
          { error: "Nenhum provedor de posição individual está configurado. Adicione APRSFI_API_KEY ou MARINESIA_API_KEY na Vercel.", configured: false },
          { status: 503 },
        );
      }

      return NextResponse.json(
        {
          error: id && marinesiaApiKey
            ? "Nenhum dos provedores AIS retornou uma posição válida agora. APRS.fi foi tentado e a Marinesia ficou disponível como complemento quando a cota permite."
            : (aprsError?.message || "Nenhuma posição AIS válida foi encontrada. Se tiver MMSI/IMO, a Marinesia pode ser usada como complemento."),
          code: "ais_all_providers_no_position",
        },
        { status: 404 },
      );
    }

    if (action === "area") {
      const latitude = numberOrNull(searchParams.get("latitude"));
      const longitude = numberOrNull(searchParams.get("longitude"));
      if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return NextResponse.json({ error: "Latitude/longitude inválidas para a busca por área." }, { status: 400 });
      }

      if (!dataDockedApiKey && !marinesiaApiKey) {
        return NextResponse.json(
          { error: "Busca por área sem provedor configurado. Adicione DATADOCKED_API_KEY ou MARINESIA_API_KEY.", configured: false },
          { status: 503 },
        );
      }

      const access = await assertCanUse(user, "ais_area");
      let vessels: any[] = [];
      let provider = "";
      let providerCalls = 0;
      let primaryError: any = null;

      if (dataDockedApiKey) {
        try {
          const params = new URLSearchParams({
            latitude: String(Math.round(latitude * 10000) / 10000),
            longitude: String(Math.round(longitude * 10000) / 10000),
            circle_radius: "50",
          });
          const data = await callDataDocked(`/get-vessels-by-area?${params.toString()}`, dataDockedApiKey);
          const source = detailOf(data);
          const rawVessels = Array.isArray(source?.vessels) ? source.vessels : Array.isArray(source) ? source : [];
          vessels = rawVessels.map(normalizeAreaVessel).filter(Boolean);
          provider = "Data Docked";
          providerCalls += 1;
        } catch (error) {
          primaryError = error;
        }
      }

      if ((!provider || vessels.length === 0) && marinesiaApiKey) {
        try {
          const supplemental = await getMarinesiaArea(marinesiaApiKey, latitude, longitude, 50);
          if (supplemental.length || !provider) {
            vessels = supplemental;
            provider = "Marinesia AIS";
          }
          providerCalls += 1;
        } catch (error: any) {
          if (!error?.localRateLimit && !primaryError) primaryError = error;
        }
      }

      if (!provider) {
        throw primaryError || Object.assign(new Error("Nenhum provedor AIS respondeu à consulta por área."), { status: 502 });
      }

      const debit = await debitCreditsAfterSuccess({
        user,
        mode: "ais_area",
        description: "Busca AIS por área — 50 km",
        reference: `${latitude.toFixed(4)},${longitude.toFixed(4)}`,
        metadata: { latitude, longitude, radiusKm: 50, vessels: vessels.length, provider },
      });

      void logAisUsage({
        userId: user.id,
        action: provider.includes("Marinesia") ? "area_50km_marinesia" : "area_50km",
        vesselName: null,
        providerCalls: Math.max(1, providerCalls),
        creditsCharged: debit.charged,
        estimatedApiCostBrl: provider.includes("Marinesia") ? 0 : access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL,
        status: "success",
      }).catch(() => null);

      return NextResponse.json({
        configured: true,
        provider,
        fallbackUsed: provider.includes("Marinesia"),
        providerNote: provider.includes("Marinesia") ? "Plano grátis Marinesia: retorno limitado e protegido por cache/intervalo." : null,
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
        return NextResponse.json(
          {
            error: error?.localRateLimit
              ? "Marinesia protegida pelo intervalo do plano grátis. O painel mantém cache para evitar estourar a cota."
              : "Limite da Marinesia atingido. No plano grátis a documentação informa 1 requisição a cada 30 minutos.",
            code: "marinesia_rate_limit",
          },
          { status: 429 },
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
