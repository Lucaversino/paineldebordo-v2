import { NextRequest, NextResponse } from "next/server";
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

async function callDataDocked(path: string, apiKey: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      accept: "application/json",
      "x-api-key": apiKey,
    },
    cache: "no-store",
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = { detail: `Resposta inválida do provedor AIS (${response.status}).` };
  }

  if (!response.ok) {
    const message = typeof body?.detail === "string"
      ? body.detail
      : typeof body?.error === "string"
        ? body.error
        : `Erro Data Docked (${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status });
  }

  return body;
}

function normalizeNameResult(raw: any) {
  const mmsi = textOrEmpty(raw?.mmsi).replace(/\D/g, "");
  const imo = textOrEmpty(raw?.imo).replace(/\D/g, "");
  return {
    name: textOrEmpty(raw?.name),
    mmsi,
    imo,
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
    lat,
    lon,
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

export async function GET(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.DATADOCKED_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "DATADOCKED_API_KEY não configurada na Vercel.", configured: false },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "credits";

  try {
    if (action === "credits") {
      const data = await callDataDocked("/my-credits", apiKey);
      const credits = numberOrNull(data?.detail?.credits ?? data?.credits);
      return NextResponse.json({ configured: true, provider: "Data Docked", credits });
    }

    if (action === "name") {
      const rawName = (searchParams.get("name") || "").trim();
      if (rawName.length < 2) {
        return NextResponse.json({ error: "Digite pelo menos 2 caracteres do nome do barco." }, { status: 400 });
      }

      const pageNumber = Math.max(1, Math.min(10, Math.round(numberOrNull(searchParams.get("page")) ?? 1)));
      const providerName = rawName.replace(/\s+/g, "_");
      const params = new URLSearchParams({ name: providerName, page_number: String(pageNumber) });
      const data = await callDataDocked(`/vessels-by-vessel-name?${params.toString()}`, apiKey);
      const items = Array.isArray(data?.items) ? data.items.map(normalizeNameResult) : [];

      return NextResponse.json({
        configured: true,
        provider: "Data Docked",
        query: rawName,
        total: Number(data?.total) || items.length,
        page: pageNumber,
        items,
        creditCost: 1,
      });
    }

    if (action === "vessel") {
      const id = (searchParams.get("id") || "").replace(/[^0-9]/g, "");
      if (!id) return NextResponse.json({ error: "Informe IMO ou MMSI." }, { status: 400 });
      const data = await callDataDocked(`/get-vessel-location?imo_or_mmsi=${encodeURIComponent(id)}`, apiKey);
      const vessel = normalizeSingleVessel(data);
      if (!vessel) return NextResponse.json({ error: "O provedor não retornou uma posição válida para esta embarcação." }, { status: 404 });
      return NextResponse.json({ configured: true, provider: "Data Docked", vessel, creditCost: 1 });
    }

    if (action === "area") {
      const latitude = numberOrNull(searchParams.get("latitude"));
      const longitude = numberOrNull(searchParams.get("longitude"));
      const requestedRadius = Math.round(numberOrNull(searchParams.get("radius")) ?? 50);

      if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return NextResponse.json({ error: "Latitude/longitude inválidas para a busca por área." }, { status: 400 });
      }
      if (![50, 100].includes(requestedRadius)) {
        return NextResponse.json({ error: "Use raio de 50 km ou 100 km." }, { status: 400 });
      }

      const roundProvider = (value: number) => Math.round(value * 10) / 10;
      const normalizeAreaVessel = (raw: any) => {
        const lat = numberOrNull(raw?.latitude);
        const lon = numberOrNull(raw?.longitude);
        if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
        const speedRaw = numberOrNull(raw?.speed);
        return {
          mmsi: textOrEmpty(raw?.mmsi).replace(/\D/g, ""),
          imo: textOrEmpty(raw?.imo).replace(/\D/g, ""),
          name: textOrEmpty(raw?.name) || "SEM NOME",
          lat,
          lon,
          sog: speedRaw == null ? null : speedRaw / 10,
          cog: numberOrNull(raw?.course),
          heading: numberOrNull(raw?.heading),
          vesselType: textOrEmpty(raw?.typeSpecific),
          navStatusText: textOrEmpty(raw?.navigationalStatus),
          dataSource: "Terrestrial Area",
          receivedAt: Date.now(),
        };
      };

      const fetchArea = async (lat: number, lon: number) => {
        const params = new URLSearchParams({
          latitude: String(roundProvider(lat)),
          longitude: String(roundProvider(lon)),
          circle_radius: "50",
        });
        const data = await callDataDocked(`/get-vessels-by-area?${params.toString()}`, apiKey);
        return (Array.isArray(data?.vessels) ? data.vessels : [])
          .map(normalizeAreaVessel)
          .filter(Boolean);
      };

      let vessels: any[] = [];
      let creditCost = 10;
      let providerQueries = 1;

      if (requestedRadius === 50) {
        vessels = await fetchArea(latitude, longitude);
      } else {
        // O provedor limita cada consulta a 50 km. Para visualizar ~100 km,
        // cobrimos o disco com uma grade 3x3 de consultas de 50 km.
        // Isso consome 9 consultas (90 créditos), por isso a UI exige confirmação.
        const kmLat = 1 / 111.32;
        const kmLon = 1 / (111.32 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)));
        const offsetsKm = [-50, 0, 50];
        const centers: Array<[number, number]> = [];
        for (const dy of offsetsKm) {
          for (const dx of offsetsKm) {
            centers.push([latitude + dy * kmLat, longitude + dx * kmLon]);
          }
        }
        const groups = await Promise.all(centers.map(([lat, lon]) => fetchArea(lat, lon)));
        const dedup = new Map<string, any>();
        for (const vessel of groups.flat()) {
          const key = vessel.mmsi || `${vessel.name}:${vessel.lat.toFixed(5)}:${vessel.lon.toFixed(5)}`;
          if (!dedup.has(key)) dedup.set(key, vessel);
        }
        vessels = [...dedup.values()].filter((vessel) => {
          const rad = Math.PI / 180;
          const dLat = (vessel.lat - latitude) * rad;
          const dLon = (vessel.lon - longitude) * rad;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(latitude * rad) * Math.cos(vessel.lat * rad) * Math.sin(dLon / 2) ** 2;
          const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return km <= 100;
        });
        creditCost = 90;
        providerQueries = 9;
      }

      return NextResponse.json({
        configured: true,
        provider: "Data Docked",
        center: { latitude, longitude },
        radiusKm: requestedRadius,
        vessels,
        total: vessels.length,
        creditCost,
        providerQueries,
        note: requestedRadius === 100
          ? "Raio de 100 km composto por 9 consultas de 50 km, limite máximo do provedor."
          : "Busca por área de 50 km.",
      });
    }

    return NextResponse.json({ error: "Ação AIS inválida." }, { status: 400 });
  } catch (error: any) {
    const status = Number(error?.status) || 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar Data Docked." },
      { status },
    );
  }
}
