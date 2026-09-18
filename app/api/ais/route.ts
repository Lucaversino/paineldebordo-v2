import { NextRequest, NextResponse } from "next/server";
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
function textOrEmpty(value: unknown) { return value == null ? "" : String(value).trim(); }

async function callDataDocked(path: string, apiKey: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { accept: "application/json", "x-api-key": apiKey },
      cache: "no-store",
      signal: controller.signal,
    });
    let body: any = null;
    try { body = await response.json(); } catch { body = { detail: `Resposta inválida do provedor AIS (${response.status}).` }; }
    if (!response.ok) {
      const message = typeof body?.detail === "string" ? body.detail : typeof body?.error === "string" ? body.error : `Erro Data Docked (${response.status}).`;
      throw Object.assign(new Error(message), { status: response.status });
    }
    return body;
  } catch (error: any) {
    if (error?.name === "AbortError") throw Object.assign(new Error("A consulta AIS demorou demais. Tente novamente."), { status: 504 });
    throw error;
  } finally { clearTimeout(timer); }
}

function normalizeNameResult(raw: any) {
  return {
    name: textOrEmpty(raw?.name),
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    country: textOrEmpty(raw?.country),
    countryIso: textOrEmpty(raw?.countryIso),
    shipType: textOrEmpty(raw?.shipType),
    typeSpecific: textOrEmpty(raw?.typeSpecific),
    callsign: textOrEmpty(raw?.callsign),
  };
}

function normalizeSingleVessel(raw: any) {
  const lat = numberOrNull(raw?.latitude);
  const lon = numberOrNull(raw?.longitude);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    name: textOrEmpty(raw?.name),
    lat, lon,
    sog: numberOrNull(raw?.speed),
    cog: numberOrNull(raw?.course),
    heading: numberOrNull(raw?.heading),
    draught: textOrEmpty(raw?.draught),
    destination: textOrEmpty(raw?.destination),
    lastPort: textOrEmpty(raw?.lastPort),
    callsign: textOrEmpty(raw?.callsign),
    vesselType: textOrEmpty(raw?.typeSpecific),
    navStatusText: textOrEmpty(raw?.navigationalStatus),
    dataSource: textOrEmpty(raw?.dataSource),
    positionReceived: textOrEmpty(raw?.positionReceived),
    updateTime: textOrEmpty(raw?.updateTime),
    receivedAt: Date.now(),
    provider: "Data Docked",
  };
}

function normalizeAreaVessel(raw: any) {
  const lat = numberOrNull(raw?.latitude);
  const lon = numberOrNull(raw?.longitude);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const speedRaw = numberOrNull(raw?.speed);
  return {
    mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
    imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
    name: textOrEmpty(raw?.name) || "SEM NOME",
    lat, lon,
    sog: speedRaw == null ? null : speedRaw / 10,
    cog: numberOrNull(raw?.course),
    heading: numberOrNull(raw?.heading),
    vesselType: textOrEmpty(raw?.typeSpecific),
    navStatusText: textOrEmpty(raw?.navigationalStatus),
    dataSource: textOrEmpty(raw?.dataSource) || "Terrestrial Area",
    receivedAt: Date.now(),
  };
}

export async function GET(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.DATADOCKED_API_KEY?.trim();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "credits";

  try {
    if (action === "credits") {
      const [wallet, settings] = await Promise.all([ensureWallet(user), getBillingSettings()]);
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

    if (action === "name") {
      const rawName = (searchParams.get("name") || "").trim();
      if (rawName.length < 2) return NextResponse.json({ error: "Digite pelo menos 2 caracteres do nome do barco." }, { status: 400 });
      const access = await assertCanUse(user, "ais_single");
      const pageNumber = Math.max(1, Math.min(10, Math.round(numberOrNull(searchParams.get("page")) ?? 1)));
      const params = new URLSearchParams({ name: rawName.replace(/\s+/g, "_"), page_number: String(pageNumber) });
      const data = await callDataDocked(`/vessels-by-vessel-name?${params.toString()}`, apiKey);
      const items = Array.isArray(data?.items) ? data.items.map(normalizeNameResult) : [];
      await logAisUsage({ userId: user.id, action: "name_search", vesselName: rawName, providerCalls: 1, creditsCharged: 0, estimatedApiCostBrl: access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL, status: items.length ? "success" : "not_found" }).catch(() => null);
      return NextResponse.json({ configured: true, provider: "Data Docked", query: rawName, total: Number(data?.total) || items.length, page: pageNumber, items, finalQueryCredits: access.isFree ? 0 : access.settings.AIS_SINGLE_QUERY_CREDITS, adminFree: access.isFree });
    }

    if (action === "vessel") {
      const id = (searchParams.get("id") || "").replace(/[^0-9]/g, "");
      const isUpdate = searchParams.get("update") === "1";
      const name = (searchParams.get("name") || "").trim();
      if (!id) return NextResponse.json({ error: "Informe IMO ou MMSI." }, { status: 400 });
      const mode = isUpdate ? "ais_update" as const : "ais_single" as const;
      const access = await assertCanUse(user, mode);
      const data = await callDataDocked(`/get-vessel-location?imo_or_mmsi=${encodeURIComponent(id)}`, apiKey);
      const vessel = normalizeSingleVessel(data);
      if (!vessel) return NextResponse.json({ error: "O provedor não retornou uma posição válida para esta embarcação. Nenhum crédito foi descontado." }, { status: 404 });
      if (!vessel.name && name) vessel.name = name;
      const debit = await debitCreditsAfterSuccess({ user, mode, description: `${isUpdate ? "Atualizar posição" : "Localizar barco"} — ${vessel.name || id}`, reference: id, metadata: { name: vessel.name, lat: vessel.lat, lon: vessel.lon } });
      await logAisUsage({ userId: user.id, action: isUpdate ? "update" : "locate", vesselName: vessel.name || name, providerCalls: 1, creditsCharged: debit.charged, estimatedApiCostBrl: debit.settings.AIS_PROVIDER_COST_PER_QUERY_BRL, status: "success" }).catch(() => null);
      return NextResponse.json({ configured: true, provider: "Data Docked", vessel, creditCost: debit.charged, billing: { chargedCredits: debit.charged, balance: debit.balance, free: debit.free } });
    }

    if (action === "area") {
      const latitude = numberOrNull(searchParams.get("latitude"));
      const longitude = numberOrNull(searchParams.get("longitude"));
      if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return NextResponse.json({ error: "Latitude/longitude inválidas para a busca por área." }, { status: 400 });
      const access = await assertCanUse(user, "ais_area");
      const params = new URLSearchParams({ latitude: String(Math.round(latitude * 10) / 10), longitude: String(Math.round(longitude * 10) / 10), circle_radius: "50" });
      const data = await callDataDocked(`/get-vessels-by-area?${params.toString()}`, apiKey);
      const vessels = (Array.isArray(data?.vessels) ? data.vessels : []).map(normalizeAreaVessel).filter(Boolean);
      const debit = await debitCreditsAfterSuccess({ user, mode: "ais_area", description: `Busca AIS por área — 50 km`, reference: `${latitude.toFixed(4)},${longitude.toFixed(4)}`, metadata: { latitude, longitude, radiusKm: 50, vessels: vessels.length } });
      await logAisUsage({ userId: user.id, action: "area_50km", vesselName: null, providerCalls: 1, creditsCharged: debit.charged, estimatedApiCostBrl: debit.settings.AIS_PROVIDER_COST_PER_QUERY_BRL, status: "success" }).catch(() => null);
      return NextResponse.json({ configured: true, provider: "Data Docked", center: { latitude, longitude }, radiusKm: 50, vessels, total: vessels.length, creditCost: debit.charged, billing: { chargedCredits: debit.charged, balance: debit.balance, free: debit.free } });
    }

    return NextResponse.json({ error: "Ação AIS inválida." }, { status: 400 });
  } catch (error: any) {
    const status = Number(error?.status) || 502;
    if (status === 402) return NextResponse.json({ error: error?.message || "Saldo insuficiente.", code: "insufficient_credits", balance: error?.balance, required: error?.required }, { status: 402 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar Data Docked." }, { status });
  }
}
