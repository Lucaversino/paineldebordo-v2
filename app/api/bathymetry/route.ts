import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 12;

const GEBCO_WMS = "https://wms.gebco.net/mapserv";

function parseElevation(text: string) {
  const patterns = [
    /value_0\s*=\s*['"]?(-?\d+(?:\.\d+)?)/i,
    /elevation\s*=\s*['"]?(-?\d+(?:\.\d+)?)/i,
    /pixel(?:_value)?\s*=\s*['"]?(-?\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= -12000 && value <= 9000) return value;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Latitude/longitude inválidas." }, { status: 400 });
  }

  // Janela pequena em torno do ponto; o pixel central é consultado pelo GetFeatureInfo.
  const delta = 0.03;
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetFeatureInfo",
    LAYERS: "GEBCO_LATEST_2",
    QUERY_LAYERS: "GEBCO_LATEST_2",
    STYLES: "",
    SRS: "EPSG:4326",
    BBOX: `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`,
    WIDTH: "101",
    HEIGHT: "101",
    X: "50",
    Y: "50",
    FORMAT: "image/png",
    INFO_FORMAT: "text/plain",
    FEATURE_COUNT: "1",
  });

  try {
    const response = await fetch(`${GEBCO_WMS}?${params.toString()}`, {
      headers: {
        accept: "text/plain,*/*;q=0.8",
        "user-agent": "Painel-de-Bordo/141",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `GEBCO indisponível (${response.status}).` },
        { status: 502 },
      );
    }

    const raw = await response.text();
    const elevationMeters = parseElevation(raw);

    if (elevationMeters == null) {
      return NextResponse.json(
        { error: "Não foi possível obter a profundidade neste ponto." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        lat,
        lon,
        elevationMeters,
        depthMeters: elevationMeters < 0 ? Math.round(Math.abs(elevationMeters)) : 0,
        source: "GEBCO",
        approximate: true,
      },
      {
        headers: {
          "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Serviço de profundidade indisponível no momento." },
      { status: 502 },
    );
  }
}
