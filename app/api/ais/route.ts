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

const BASE_URL = "https://datadocked.com/api/vessels_operations";

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function textOrEmpty(value: unknown) { return value == null ? "" : String(value).trim(); }

function providerMessage(body: any, status: number) {
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
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
        "user-agent": "Painel-de-Bordo/83",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    let body: any = null;
    try { body = await response.json(); }
    catch { body = { detail: `Resposta inválida do provedor AIS (${response.status}).` }; }

    if (response.ok) return body;
    throw Object.assign(new Error(providerMessage(body, response.status)), {
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

function normalizeNameResult(raw: any) {
  return {
    name: textOrEmpty(raw?.name || raw?.vesselName),
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    country: textOrEmpty(raw?.country),
    countryIso: textOrEmpty(raw?.countryIso),
    shipType: textOrEmpty(raw?.shipType),
    typeSpecific: textOrEmpty(raw?.typeSpecific),
    callsign: textOrEmpty(raw?.callsign || raw?.callSign),
  };
}

function normalizeSingleVessel(raw: any) {
  const lat = numberOrNull(raw?.latitude ?? raw?.lat);
  const lon = numberOrNull(raw?.longitude ?? raw?.lon);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    name: textOrEmpty(raw?.name || raw?.vesselName),
    lat, lon,
    sog: numberOrNull(raw?.speed ?? raw?.sog),
    cog: numberOrNull(raw?.course ?? raw?.cog),
    heading: numberOrNull(raw?.heading),
    draught: textOrEmpty(raw?.draught),
    destination: textOrEmpty(raw?.destination),
    lastPort: textOrEmpty(raw?.lastPort),
    callsign: textOrEmpty(raw?.callsign || raw?.callSign),
    vesselType: textOrEmpty(raw?.typeSpecific || raw?.shipType),
    navStatusText: textOrEmpty(raw?.navigationalStatus || raw?.navStatus),
    dataSource: textOrEmpty(raw?.dataSource),
    positionReceived: textOrEmpty(raw?.positionReceived || raw?.lastUpdate),
    updateTime: textOrEmpty(raw?.updateTime || raw?.lastUpdate),
    receivedAt: Date.now(),
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
    lat, lon,
    sog: speedRaw == null ? null : (speedRaw > 80 ? speedRaw / 10 : speedRaw),
    cog: numberOrNull(raw?.course ?? raw?.cog),
    heading: numberOrNull(raw?.heading),
    vesselType: textOrEmpty(raw?.typeSpecific || raw?.shipType),
    navStatusText: textOrEmpty(raw?.navigationalStatus || raw?.navStatus),
    dataSource: textOrEmpty(raw?.dataSource) || "Terrestrial Area",
    receivedAt: Date.now(),
  };
}

function adminBilling() {
  return { charged: 0, balance: 0, free: true, bonusUsedBrl: 0, aiBonusBrl: 0 };
}

export async function GET(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sessão encerrada. Entre novamente no painel.", code: "session_expired" }, { status: 401 });

  const admin = isSuperAdmin(user);
  const apiKey = process.env.DATADOCKED_API_KEY?.trim();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "credits";

  try {
    // Super Admin não depende da carteira/Supabase para usar AIS. Isso evita que uma falha
    // de banco impeça um acesso que é gratuito por regra administrativa.
    if (action === "credits" && admin) {
      return NextResponse.json({
        configured: Boolean(apiKey),
        credits: 0,
        adminFree: true,
        pricing: { locateCredits: 0, updateCredits: 0, areaCredits: 0, locateBrl: 0 },
      });
    }

    if (action === "credits") {
      const settings = await getBillingSettings();
      const wallet = await ensureWallet(user, settings);
      return NextResponse.json({
        configured: Boolean(apiKey),
        credits: wallet.balance,
        adminFree: wallet.freeAisAccess,
        pricing: {
          locateCredits: wallet.freeAisAccess ? 0 : settings.AIS_SINGLE_QUERY_CREDITS,
          updateCredits: wallet.freeAisAccess ? 0 : settings.AIS_UPDATE_CREDITS,
          areaCredits: wallet.freeAisAccess ? 0 : settings.AIS_AREA_QUERY_CREDITS,
          locateBrl: wallet.freeAisAccess ? 0 : priceForCredits(settings, settings.AIS_SINGLE_QUERY_CREDITS),
        },
      });
    }

    if (!apiKey) return NextResponse.json({ error: "DATADOCKED_API_KEY não configurada na Vercel.", configured: false }, { status: 503 });

    if (action === "provider-health") {
      if (!admin) return NextResponse.json({ error: "Acesso administrativo negado." }, { status: 403 });
      const data = await callDataDocked("/my-credits", apiKey, 6000);
      const source = detailOf(data);
      return NextResponse.json({ ok: true, provider: "Data Docked", credits: Number(source?.credits ?? data?.credits ?? 0) });
    }

    if (action === "name") {
      const rawName = (searchParams.get("name") || "").trim();
      if (rawName.length < 2) return NextResponse.json({ error: "Digite pelo menos 2 caracteres do nome do barco." }, { status: 400 });
      const access = admin ? null : await assertCanUse(user, "ais_single");
      const pageNumber = Math.max(1, Math.min(10, Math.round(numberOrNull(searchParams.get("page")) ?? 1)));
      const params = new URLSearchParams({ name: rawName.replace(/\s+/g, "_"), page_number: String(pageNumber) });
      const data = await callDataDocked(`/vessels-by-vessel-name?${params.toString()}`, apiKey);
      const source = detailOf(data);
      const rawItems = Array.isArray(source?.items)
        ? source.items
        : Array.isArray(source?.vessels)
          ? source.vessels
          : Array.isArray(source)
            ? source
            : [];
      const items = rawItems.map(normalizeNameResult).filter((item: any) => item.name || item.imo || item.mmsi);
      if (!admin && access) {
        void logAisUsage({ userId: user.id, action: "name_search", vesselName: rawName, providerCalls: 1, creditsCharged: 0, estimatedApiCostBrl: access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL, status: items.length ? "success" : "not_found" }).catch(() => null);
      }
      return NextResponse.json({ configured: true, provider: "Data Docked", query: rawName, total: Number(source?.total) || items.length, page: pageNumber, items, finalQueryCredits: admin ? 0 : access?.settings.AIS_SINGLE_QUERY_CREDITS ?? 2, adminFree: admin });
    }

    if (action === "vessel") {
      const id = (searchParams.get("id") || "").replace(/[^0-9]/g, "");
      const isUpdate = searchParams.get("update") === "1";
      const name = (searchParams.get("name") || "").trim();
      if (!id) return NextResponse.json({ error: "Informe IMO ou MMSI." }, { status: 400 });
      const mode = isUpdate ? "ais_update" as const : "ais_single" as const;
      const access = admin ? null : await assertCanUse(user, mode);
      const data = await callDataDocked(`/get-vessel-location?imo_or_mmsi=${encodeURIComponent(id)}`, apiKey);
      const source = detailOf(data);
      const vessel = normalizeSingleVessel(source);
      if (!vessel) return NextResponse.json({ error: "O provedor não retornou uma posição válida para esta embarcação. Nenhum crédito foi descontado." }, { status: 404 });
      if (!vessel.name && name) vessel.name = name;

      const debit = admin
        ? adminBilling()
        : await debitCreditsAfterSuccess({ user, mode, description: `${isUpdate ? "Atualizar posição" : "Localizar barco"} — ${vessel.name || id}`, reference: id, metadata: { name: vessel.name, lat: vessel.lat, lon: vessel.lon } });

      if (!admin && access) {
        void logAisUsage({ userId: user.id, action: isUpdate ? "update" : "locate", vesselName: vessel.name || name, providerCalls: 1, creditsCharged: debit.charged, estimatedApiCostBrl: access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL, status: "success" }).catch(() => null);
      }
      return NextResponse.json({ configured: true, provider: "Data Docked", vessel, creditCost: debit.charged, billing: debit, adminFree: admin });
    }

    if (action === "area") {
      const latitude = numberOrNull(searchParams.get("latitude"));
      const longitude = numberOrNull(searchParams.get("longitude"));
      if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return NextResponse.json({ error: "Latitude/longitude inválidas para a busca por área." }, { status: 400 });
      const access = admin ? null : await assertCanUse(user, "ais_area");
      const params = new URLSearchParams({ latitude: String(Math.round(latitude * 10000) / 10000), longitude: String(Math.round(longitude * 10000) / 10000), circle_radius: "50" });
      const data = await callDataDocked(`/get-vessels-by-area?${params.toString()}`, apiKey);
      const source = detailOf(data);
      const rawVessels = Array.isArray(source?.vessels) ? source.vessels : Array.isArray(source) ? source : [];
      const vessels = rawVessels.map(normalizeAreaVessel).filter(Boolean);
      const debit = admin
        ? adminBilling()
        : await debitCreditsAfterSuccess({ user, mode: "ais_area", description: "Busca AIS por área — 50 km", reference: `${latitude.toFixed(4)},${longitude.toFixed(4)}`, metadata: { latitude, longitude, radiusKm: 50, vessels: vessels.length } });
      if (!admin && access) {
        void logAisUsage({ userId: user.id, action: "area_50km", vesselName: null, providerCalls: 1, creditsCharged: debit.charged, estimatedApiCostBrl: access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL, status: "success" }).catch(() => null);
      }
      return NextResponse.json({ configured: true, provider: "Data Docked", center: { latitude, longitude }, radiusKm: 50, vessels, total: vessels.length, creditCost: debit.charged, billing: debit, adminFree: admin });
    }

    return NextResponse.json({ error: "Ação AIS inválida." }, { status: 400 });
  } catch (error: any) {
    const status = Number(error?.status) || 502;
    if (status === 402) return NextResponse.json({ error: error?.message || "Saldo insuficiente.", code: "insufficient_credits", balance: error?.balance, required: error?.required }, { status: 402 });

    if (error?.provider === "datadocked") {
      if (status === 401) return NextResponse.json({ error: "A chave DATADOCKED_API_KEY foi recusada pela Data Docked. Confira a chave na Vercel.", code: "datadocked_key_invalid" }, { status: 502 });
      if (status === 403) return NextResponse.json({ error: "A conta Data Docked está sem créditos/plano para esta consulta. O acesso GRÁTIS — ADMIN remove a cobrança do Painel, mas a API externa ainda precisa ter créditos.", code: "datadocked_no_provider_credits" }, { status: 502 });
      if (status === 429) return NextResponse.json({ error: "Limite temporário de consultas da Data Docked atingido. Aguarde alguns segundos e tente novamente.", code: "datadocked_rate_limit" }, { status: 429 });
      return NextResponse.json({ error: error?.message || "Falha temporária na Data Docked.", code: "datadocked_error" }, { status: status >= 500 ? status : 502 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar AIS." }, { status });
  }
}
