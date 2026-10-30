import { NextRequest, NextResponse } from "next/server";
import {
  assertCanUse,
  debitCreditsAfterSuccess,
  ensureWallet,
  getBillingSettings,
  logAisUsage,
  priceForCredits,
} from "../../../lib/credits";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const DATADOCKED_BASE_URL = "https://datadocked.com/api/vessels_operations";

function debug(step: string, payload?: unknown) {
  if (process.env.NODE_ENV !== "production") {
    if (payload === undefined) console.info(`[AIS PREMIUM] ${step}`);
    else console.info(`[AIS PREMIUM] ${step}`, payload);
  }
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function providerMessage(body: any, status: number) {
  const detail = body?.detail;
  return (
    (typeof detail === "string" && detail) ||
    (typeof detail?.message === "string" && detail.message) ||
    text(body?.message) ||
    text(body?.error) ||
    `Erro Data Docked (${status}).`
  );
}

async function callDataDocked(path: string, apiKey: string, timeoutMs = 9000) {
  debug("chamando API", { path });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${DATADOCKED_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
        "user-agent": "Painel-de-Bordo/138-premium",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    debug("resposta recebida", { status: response.status, ok: response.ok });
    if (response.ok) return body;
    throw Object.assign(new Error(providerMessage(body, response.status)), {
      status: response.status,
      provider: "datadocked",
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("A Data Docked demorou para responder."), {
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

function normalizeMatch(raw: any) {
  return {
    name: text(raw?.name || raw?.vesselName),
    mmsi: text(raw?.mmsi).replace(/\D/g, ""),
    imo: text(raw?.imo).replace(/\D/g, ""),
    country: text(raw?.country),
    countryIso: text(raw?.countryIso),
    shipType: text(raw?.shipType) || "Embarcação AIS",
    typeSpecific: text(raw?.typeSpecific || raw?.shipType) || "Embarcação AIS",
    callsign: text(raw?.callsign),
  };
}

function normalizeVessel(raw: any, fallbackName = "") {
  const lat = numberOrNull(raw?.latitude ?? raw?.lat);
  const lon = numberOrNull(raw?.longitude ?? raw?.lon);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const providerTime = text(raw?.positionReceived || raw?.updateTime || raw?.timestamp);
  const updateTime = text(raw?.updateTime || raw?.positionReceived || raw?.timestamp);
  return {
    mmsi: text(raw?.mmsi).replace(/\D/g, ""),
    imo: text(raw?.imo).replace(/\D/g, ""),
    name: text(raw?.name || raw?.vesselName) || fallbackName,
    lat,
    lon,
    sog: numberOrNull(raw?.speed ?? raw?.sog),
    cog: numberOrNull(raw?.course ?? raw?.cog),
    heading: numberOrNull(raw?.heading),
    draught: text(raw?.draught),
    destination: text(raw?.destination),
    lastPort: text(raw?.lastPort),
    callsign: text(raw?.callsign),
    vesselType: text(raw?.typeSpecific || raw?.shipType) || "Embarcação AIS",
    navStatusText: text(raw?.navigationalStatus || raw?.navStatus),
    dataSource: text(raw?.dataSource) || "Data Docked Premium",
    positionReceived: providerTime,
    updateTime,
    receivedAt: providerTime && !Number.isNaN(new Date(providerTime).getTime()) ? new Date(providerTime).getTime() : Date.now(),
  };
}

export async function GET(request: NextRequest) {
  debug("busca iniciada");
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 });

  const apiKey = process.env.DATADOCKED_API_KEY?.trim();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "status";

  try {
    const settings = await getBillingSettings();

    if (action === "status") {
      const wallet = await ensureWallet(user, settings);
      return NextResponse.json({
        configured: Boolean(apiKey),
        credits: wallet.balance,
        creditUnitPrice: settings.CREDIT_UNIT_PRICE,
        pricing: {
          locateCredits: settings.AIS_SINGLE_QUERY_CREDITS,
          updateCredits: settings.AIS_UPDATE_CREDITS,
          locateBrl: priceForCredits(settings, settings.AIS_SINGLE_QUERY_CREDITS),
        },
      });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "DATADOCKED_API_KEY não configurada.", configured: false }, { status: 503 });
    }

    if (action === "search") {
      const query = text(searchParams.get("q"));
      if (query.length < 2) return NextResponse.json({ error: "Digite nome, MMSI ou IMO." }, { status: 400 });

      debug("verificando créditos");
      const access = await assertCanUse(user, "ais_single");
      const digits = query.replace(/\D/g, "");
      if (digits.length === 7 || digits.length === 9) {
        const item = {
          name: digits.length === 9 ? `MMSI ${digits}` : `IMO ${digits}`,
          mmsi: digits.length === 9 ? digits : "",
          imo: digits.length === 7 ? digits : "",
          country: "",
          countryIso: "",
          shipType: "AIS Premium",
          typeSpecific: "Data Docked",
          callsign: "",
        };
        return NextResponse.json({
          items: [item],
          total: 1,
          creditCost: access.credits,
          balance: access.wallet.balance,
        });
      }

      const encodedName = encodeURIComponent(query.replace(/\s+/g, "_"));
      const data = await callDataDocked(`/vessels-by-vessel-name?name=${encodedName}&page_number=1`, apiKey);
      const source = detailOf(data);
      const rawItems = Array.isArray(source?.items) ? source.items : Array.isArray(data?.items) ? data.items : [];
      const items = rawItems.map(normalizeMatch).filter((item: any) => item.name || item.imo || item.mmsi);

      void logAisUsage({
        userId: user.id,
        action: "premium_search",
        vesselName: query,
        providerCalls: 1,
        creditsCharged: 0,
        estimatedApiCostBrl: 0,
        status: items.length ? "success" : "not_found",
      }).catch(() => null);

      return NextResponse.json({
        items,
        total: Number(source?.total ?? data?.total ?? items.length),
        creditCost: access.credits,
        balance: access.wallet.balance,
      });
    }

    if (action === "position") {
      const isUpdate = searchParams.get("update") === "1";
      const mode = isUpdate ? "ais_update" : "ais_single";
      debug("verificando créditos", { mode });
      const access = await assertCanUse(user, mode);

      const id = text(searchParams.get("id")).replace(/\D/g, "");
      const name = text(searchParams.get("name"));
      let identifier = id;
      let resolvedName = name;

      if (!identifier && name) {
        const encodedName = encodeURIComponent(name.replace(/\s+/g, "_"));
        const searchData = await callDataDocked(`/vessels-by-vessel-name?name=${encodedName}&page_number=1`, apiKey);
        const source = detailOf(searchData);
        const first = (Array.isArray(source?.items) ? source.items : Array.isArray(searchData?.items) ? searchData.items : [])[0];
        if (first) {
          identifier = text(first?.imo || first?.mmsi).replace(/\D/g, "");
          resolvedName = text(first?.name) || name;
        }
      }

      if (!identifier) return NextResponse.json({ error: "Não foi possível obter IMO/MMSI para a consulta Premium." }, { status: 404 });

      const data = await callDataDocked(`/get-vessel-location?imo_or_mmsi=${encodeURIComponent(identifier)}`, apiKey);
      const source = detailOf(data);
      const vessel = normalizeVessel(source, resolvedName);
      if (!vessel) return NextResponse.json({ error: "Data Docked não retornou uma posição válida." }, { status: 404 });

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
        action: isUpdate ? "premium_update" : "premium_position",
        vesselName: vessel.name || reference,
        providerCalls: 1,
        creditsCharged: debit.charged,
        estimatedApiCostBrl: 0,
        status: "success",
      }).catch(() => null);

      return NextResponse.json({
        vessel,
        provider: "Data Docked",
        creditCost: debit.charged,
        balance: debit.balance,
        billing: { charged: debit.charged },
      });
    }

    return NextResponse.json({ error: "Ação AIS Premium inválida." }, { status: 400 });
  } catch (error: any) {
    debug("erro", { message: error?.message, status: error?.status, code: error?.code });
    const status = Number(error?.status) || 502;
    if (status === 402) {
      return NextResponse.json({
        error: error?.message || "Saldo insuficiente.",
        code: "insufficient_credits",
        balance: error?.balance,
        required: error?.required,
      }, { status: 402 });
    }
    if (status === 504) return NextResponse.json({ error: error?.message || "Timeout no AIS Premium.", code: "timeout" }, { status: 504 });
    if (status === 401 || status === 403) return NextResponse.json({ error: "A chave Data Docked foi recusada ou o plano não permite a consulta.", code: "provider_auth" }, { status: 502 });
    if (status === 429) return NextResponse.json({ error: "Limite temporário da Data Docked atingido.", code: "rate_limit" }, { status: 429 });
    return NextResponse.json({ error: error?.message || "Falha temporária no AIS Premium.", code: "premium_provider_error" }, { status: status >= 500 ? status : 502 });
  }
}
