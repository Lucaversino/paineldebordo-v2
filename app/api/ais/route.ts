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
  return typeof value === "string" ? value.trim() : "";
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

function normalizeAreaVessel(raw: any) {
  const lat = numberOrNull(raw?.latitude);
  const lon = numberOrNull(raw?.longitude);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const rawSpeed = numberOrNull(raw?.speed);
  return {
    mmsi: String(raw?.mmsi ?? "").replace(/\D/g, ""),
    name: textOrEmpty(raw?.name),
    lat,
    lon,
    // A API de área documenta speed em décimos de nó (110 = 11,0 kn).
    sog: rawSpeed == null ? null : rawSpeed / 10,
    cog: numberOrNull(raw?.course),
    heading: numberOrNull(raw?.heading),
    vesselType: textOrEmpty(raw?.typeSpecific),
    receivedAt: Date.now(),
    provider: "Data Docked",
  };
}

function normalizeSingleVessel(raw: any) {
  const lat = numberOrNull(raw?.latitude);
  const lon = numberOrNull(raw?.longitude);
  if (lat == null || lon == null) return null;
  return {
    mmsi: String(raw?.mmsi ?? "").replace(/\D/g, ""),
    imo: textOrEmpty(String(raw?.imo ?? "")),
    name: textOrEmpty(raw?.name),
    lat,
    lon,
    sog: numberOrNull(raw?.speed),
    cog: numberOrNull(raw?.course),
    heading: numberOrNull(raw?.heading),
    destination: textOrEmpty(raw?.destination),
    navStatusText: textOrEmpty(raw?.navigationalStatus),
    dataSource: textOrEmpty(raw?.dataSource),
    positionReceived: textOrEmpty(raw?.positionReceived),
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

    if (action === "area") {
      const lat = numberOrNull(searchParams.get("latitude"));
      const lon = numberOrNull(searchParams.get("longitude"));
      const requestedRadius = numberOrNull(searchParams.get("radius")) ?? 50;
      if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return NextResponse.json({ error: "Latitude ou longitude inválida." }, { status: 400 });
      }

      const radius = Math.max(1, Math.min(50, Math.round(requestedRadius)));
      // O endpoint Vessels by Area aceita latitude/longitude com até 1 casa decimal.
      const queryLat = Number(lat.toFixed(1));
      const queryLon = Number(lon.toFixed(1));
      const params = new URLSearchParams({
        latitude: String(queryLat),
        longitude: String(queryLon),
        circle_radius: String(radius),
      });
      const data = await callDataDocked(`/get-vessels-by-area?${params.toString()}`, apiKey);
      const vessels = (Array.isArray(data?.vessels) ? data.vessels : [])
        .map(normalizeAreaVessel)
        .filter(Boolean);

      return NextResponse.json({
        configured: true,
        provider: "Data Docked",
        source: "Terrestrial AIS",
        requestedCenter: { lat, lon },
        queryCenter: { lat: queryLat, lon: queryLon },
        radiusKm: radius,
        count: vessels.length,
        vessels,
        fetchedAt: Date.now(),
      });
    }

    if (action === "vessel") {
      const id = (searchParams.get("id") || "").replace(/[^0-9]/g, "");
      if (!id) return NextResponse.json({ error: "Informe IMO ou MMSI." }, { status: 400 });
      const data = await callDataDocked(`/get-vessel-location?imo_or_mmsi=${encodeURIComponent(id)}`, apiKey);
      return NextResponse.json({ configured: true, provider: "Data Docked", vessel: normalizeSingleVessel(data) });
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
