import { NextRequest, NextResponse } from "next/server";
import { logAisUsage } from "../../../lib/credits";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const APRSFI_BASE_URL = "https://api.aprs.fi/api/get";
const SHIPFINDER_BASE_URL = "https://api.elaneglobal.com/v1/AIS";

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
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
      headers: { accept: "application/json", "user-agent": "Painel-de-Bordo/138-free" },
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.result === "fail") {
      const message = text(body?.description || body?.message || body?.error) || `Erro AIS Free (${response.status}).`;
      throw Object.assign(new Error(message), { status: response.status || 502, provider: "aprsfi" });
    }
    return body;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("AIS Free demorou para responder."), { status: 504, provider: "aprsfi" });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function aprsRows(data: any) {
  return (Array.isArray(data?.entries) ? data.entries : []).filter((raw: any) => {
    const type = text(raw?.type).toLowerCase();
    const entryClass = text(raw?.class).toLowerCase();
    return type === "a" || entryClass === "i" || Boolean(text(raw?.mmsi));
  });
}

function aprsMatch(raw: any) {
  const vesselClass = text(raw?.vesselclass);
  return {
    name: text(raw?.showname || raw?.name),
    mmsi: text(raw?.mmsi).replace(/\D/g, ""),
    imo: text(raw?.imo).replace(/\D/g, ""),
    country: "",
    countryIso: "",
    shipType: vesselClass ? `AIS ${vesselClass}` : "Embarcação AIS",
    typeSpecific: vesselClass ? `AIS ${vesselClass}` : "Embarcação AIS",
    callsign: text(raw?.srccall),
    freeProvider: "aprsfi",
  };
}

function aprsVessel(raw: any, fallbackName = "") {
  const lat = numberOrNull(raw?.lat);
  const lon = numberOrNull(raw?.lng ?? raw?.lon);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const speedKph = numberOrNull(raw?.speed);
  const stamp = unixToIso(raw?.lasttime || raw?.time);
  const vesselClass = text(raw?.vesselclass);
  return {
    mmsi: text(raw?.mmsi).replace(/\D/g, ""),
    imo: text(raw?.imo).replace(/\D/g, ""),
    name: text(raw?.showname || raw?.name) || fallbackName,
    lat,
    lon,
    sog: speedKph == null ? null : Number((speedKph / 1.852).toFixed(2)),
    cog: numberOrNull(raw?.course),
    heading: numberOrNull(raw?.heading),
    draught: text(raw?.draught),
    destination: text(raw?.comment),
    lastPort: "",
    callsign: text(raw?.srccall),
    vesselType: vesselClass ? `AIS ${vesselClass}` : "Embarcação AIS",
    navStatusText: navStatusText(raw?.navstat),
    dataSource: "AIS Free · APRS.fi",
    positionReceived: stamp,
    updateTime: stamp,
    receivedAt: stamp ? new Date(stamp).getTime() : Date.now(),
  };
}

async function callShipFinder(path: string, params: URLSearchParams, apiKey: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const query = new URLSearchParams(params);
    query.set("key", apiKey);
    const response = await fetch(`${SHIPFINDER_BASE_URL}${path}?${query.toString()}`, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": "Painel-de-Bordo/138-free" },
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || Number(body?.status) !== 0) {
      throw Object.assign(new Error(text(body?.msg || body?.message || body?.error) || "Falha na ShipFinder."), {
        status: response.status >= 400 ? response.status : 502,
        provider: "shipfinder",
      });
    }
    return body;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("ShipFinder demorou para responder."), { status: 504, provider: "shipfinder" });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function shipFinderMatch(raw: any) {
  return {
    name: text(raw?.ship_name || raw?.name),
    mmsi: text(raw?.mmsi).replace(/\D/g, ""),
    imo: text(raw?.imo).replace(/\D/g, ""),
    country: "",
    countryIso: "",
    shipType: text(raw?.ship_type) || "Embarcação AIS",
    typeSpecific: text(raw?.ship_type) || "Embarcação AIS",
    callsign: text(raw?.call_sign),
    freeProvider: "shipfinder",
  };
}

function shipFinderVessel(raw: any, fallbackName = "") {
  const lat = numberOrNull(raw?.lat ?? raw?.latitude);
  const lon = numberOrNull(raw?.lng ?? raw?.lon ?? raw?.longitude);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const stamp = unixToIso(raw?.last_time);
  return {
    mmsi: text(raw?.mmsi).replace(/\D/g, ""),
    imo: text(raw?.imo).replace(/\D/g, ""),
    name: text(raw?.ship_name || raw?.name) || fallbackName,
    lat,
    lon,
    sog: numberOrNull(raw?.sog),
    cog: numberOrNull(raw?.cog),
    heading: numberOrNull(raw?.hdg ?? raw?.heading),
    draught: text(raw?.draught),
    destination: text(raw?.dest ?? raw?.destination),
    lastPort: "",
    callsign: text(raw?.call_sign),
    vesselType: text(raw?.ship_type) || "Embarcação AIS",
    navStatusText: navStatusText(raw?.navistat),
    dataSource: "AIS Free · ShipFinder",
    positionReceived: stamp,
    updateTime: stamp,
    receivedAt: stamp ? new Date(stamp).getTime() : Date.now(),
  };
}

function providerChoice(aprsKey?: string, shipFinderKey?: string) {
  if (aprsKey) return "aprsfi" as const;
  if (shipFinderKey) return "shipfinder" as const;
  return null;
}

export async function GET(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 });

  const aprsKey = process.env.APRSFI_API_KEY?.trim();
  const shipFinderKey = process.env.SHIPFINDER_API_KEY?.trim();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "status";

  try {
    if (action === "status") {
      return NextResponse.json({
        configured: Boolean(aprsKey || shipFinderKey),
        provider: providerChoice(aprsKey, shipFinderKey),
        free: true,
        creditCost: 0,
      });
    }

    if (action === "search") {
      const query = text(searchParams.get("q"));
      if (query.length < 2) return NextResponse.json({ error: "Digite nome, MMSI ou IMO." }, { status: 400 });
      const chosen = providerChoice(aprsKey, shipFinderKey);
      if (!chosen) return NextResponse.json({ error: "Nenhuma API AIS Free está configurada." }, { status: 503 });

      const digits = query.replace(/\D/g, "");
      if (digits.length === 7 || digits.length === 9) {
        const item = {
          name: digits.length === 9 ? `MMSI ${digits}` : `IMO ${digits}`,
          mmsi: digits.length === 9 ? digits : "",
          imo: digits.length === 7 ? digits : "",
          country: "",
          countryIso: "",
          shipType: "Embarcação AIS",
          typeSpecific: "AIS Free",
          callsign: "",
          freeProvider: chosen,
        };
        return NextResponse.json({ items: [item], total: 1, provider: chosen, creditCost: 0 });
      }

      let items: any[] = [];
      if (chosen === "aprsfi") {
        const data = await callAprsFi(query, aprsKey!);
        items = aprsRows(data).map(aprsMatch).filter((item: any) => item.name || item.mmsi || item.imo);
      } else {
        const data = await callShipFinder("/VesselSearch", new URLSearchParams({ keywords: query, max: "10" }), shipFinderKey!);
        items = (Array.isArray(data?.data) ? data.data : []).map(shipFinderMatch).filter((item: any) => item.name || item.mmsi || item.imo);
      }

      void logAisUsage({
        userId: user.id,
        action: "free_search",
        vesselName: query,
        providerCalls: 1,
        creditsCharged: 0,
        estimatedApiCostBrl: 0,
        status: items.length ? "success" : "not_found",
      }).catch(() => null);

      return NextResponse.json({ items, total: items.length, provider: chosen, creditCost: 0 });
    }

    if (action === "position") {
      const requestedProvider = text(searchParams.get("provider")).toLowerCase();
      const id = text(searchParams.get("id")).replace(/\D/g, "");
      const name = text(searchParams.get("name"));
      if (!id && !name) return NextResponse.json({ error: "Informe nome, MMSI ou IMO." }, { status: 400 });

      const failures: string[] = [];
      let vessel: any = null;
      let usedProvider = "";
      let providerCalls = 0;

      const tryAprs = async () => {
        if (!aprsKey || vessel) return;
        providerCalls += 1;
        try {
          const target = id || name;
          const data = await callAprsFi(target, aprsKey);
          const candidates = aprsRows(data);
          const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
          const entry = candidates.find((raw: any) => {
            const rawMmsi = text(raw?.mmsi).replace(/\D/g, "");
            if (id.length === 9 && rawMmsi === id) return true;
            const rawName = text(raw?.showname || raw?.name).toLowerCase().replace(/[^a-z0-9]/g, "");
            return Boolean(normalizedName && rawName === normalizedName);
          }) || candidates[0];
          vessel = entry ? aprsVessel(entry, name) : null;
          if (vessel) usedProvider = "aprsfi";
          else failures.push("APRS.fi sem posição");
        } catch (error: any) {
          failures.push(`APRS.fi: ${text(error?.message) || "falhou"}`);
        }
      };

      const tryShipFinder = async () => {
        if (!shipFinderKey || vessel) return;
        providerCalls += 1;
        try {
          let mmsi = id.length === 9 ? id : "";
          if (!mmsi && name) {
            const search = await callShipFinder("/VesselSearch", new URLSearchParams({ keywords: name, max: "10" }), shipFinderKey);
            const candidates = Array.isArray(search?.data) ? search.data : [];
            const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
            const exact = candidates.find((raw: any) => text(raw?.ship_name || raw?.name).toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedName);
            const chosen = exact || candidates[0];
            mmsi = text(chosen?.mmsi).replace(/\D/g, "");
          }
          if (!mmsi) {
            failures.push("ShipFinder sem MMSI");
            return;
          }
          const data = await callShipFinder("/VesselPositionSingle", new URLSearchParams({ mmsi }), shipFinderKey);
          vessel = shipFinderVessel(data?.data, name);
          if (vessel) usedProvider = "shipfinder";
          else failures.push("ShipFinder sem posição");
        } catch (error: any) {
          failures.push(`ShipFinder: ${text(error?.message) || "falhou"}`);
        }
      };

      if (requestedProvider === "shipfinder") {
        await tryShipFinder();
      } else if (requestedProvider === "aprsfi") {
        await tryAprs();
      } else {
        // Fluxo GFW: o Global Fishing Watch resolve a identidade/MMSI.
        // Depois tentamos automaticamente todas as fontes FREE de posição configuradas.
        await tryAprs();
        await tryShipFinder();
      }

      if (!vessel) {
        const configured = Boolean(aprsKey || shipFinderKey);
        return NextResponse.json({
          error: configured
            ? "Barco encontrado no cadastro, mas nenhuma fonte AIS FREE retornou posição atual agora."
            : "Nenhuma API AIS Free está configurada.",
          details: failures,
        }, { status: configured ? 404 : 503 });
      }

      void logAisUsage({
        userId: user.id,
        action: "free_position",
        vesselName: vessel.name || id || name,
        providerCalls: Math.max(1, providerCalls),
        creditsCharged: 0,
        estimatedApiCostBrl: 0,
        status: "success",
      }).catch(() => null);

      return NextResponse.json({ vessel, provider: usedProvider || requestedProvider || "free", creditCost: 0, free: true, tried: failures });
    }

    return NextResponse.json({ error: "Ação AIS Free inválida." }, { status: 400 });
  } catch (error: any) {
    const status = Number(error?.status) || 502;
    if (status === 504) return NextResponse.json({ error: error?.message || "Timeout no AIS Free.", code: "timeout" }, { status: 504 });
    if (status === 401 || status === 403) return NextResponse.json({ error: "A chave da API AIS Free foi recusada.", code: "provider_auth" }, { status: 502 });
    if (status === 429) return NextResponse.json({ error: "Limite temporário da API AIS Free atingido.", code: "rate_limit" }, { status: 429 });
    return NextResponse.json({ error: error?.message || "Falha temporária no AIS Free.", code: "free_provider_error" }, { status: status >= 500 ? status : 502 });
  }
}
