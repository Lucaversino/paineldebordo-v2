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
        areaProvider: dataDockedApiKey ? "Data Docked" : "não configurado",
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
      if (!aprsApiKey) {
        return NextResponse.json(
          { error: "APRSFI_API_KEY não configurada na Vercel.", configured: false },
          { status: 503 },
        );
      }

      const id = (searchParams.get("id") || "").replace(/[^0-9]/g, "");
      const name = (searchParams.get("name") || "").trim();
      const target = name || id;
      if (!target) return NextResponse.json({ error: "Informe o nome, IMO ou MMSI." }, { status: 400 });

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
      if (!vessel) {
        return NextResponse.json(
          { error: "O APRS.fi não retornou uma posição AIS válida para esta embarcação. Nenhum crédito foi descontado." },
          { status: 404 },
        );
      }
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

    if (action === "area") {
      if (!dataDockedApiKey) {
        return NextResponse.json(
          { error: "A busca por área continua usando Data Docked e DATADOCKED_API_KEY não está configurada.", configured: false },
          { status: 503 },
        );
      }

      const latitude = numberOrNull(searchParams.get("latitude"));
      const longitude = numberOrNull(searchParams.get("longitude"));
      if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return NextResponse.json({ error: "Latitude/longitude inválidas para a busca por área." }, { status: 400 });
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
        description: "Busca AIS por área — 50 km",
        reference: `${latitude.toFixed(4)},${longitude.toFixed(4)}`,
        metadata: { latitude, longitude, radiusKm: 50, vessels: vessels.length },
      });

      void logAisUsage({
        userId: user.id,
        action: "area_50km",
        vesselName: null,
        providerCalls: 1,
        creditsCharged: debit.charged,
        estimatedApiCostBrl: access.settings.AIS_PROVIDER_COST_PER_QUERY_BRL,
        status: "success",
      }).catch(() => null);

      return NextResponse.json({
        configured: true,
        provider: "Data Docked",
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
