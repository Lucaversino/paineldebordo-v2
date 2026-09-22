import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const DHN_WMS = "https://idem.dhn.mar.mil.br/geoserver/wms";

export async function GET(request: NextRequest) {
  const incoming = request.nextUrl.searchParams;
  const operation = String(incoming.get("REQUEST") || incoming.get("request") || "GetMap").toLowerCase();
  if (operation !== "getmap") {
    return NextResponse.json({ error: "Operação WMS não permitida." }, { status: 400 });
  }

  const params = new URLSearchParams();
  incoming.forEach((value, key) => params.set(key, value));
  params.set("SERVICE", "WMS");
  params.set("REQUEST", "GetMap");

  try {
    const upstream = await fetch(`${DHN_WMS}?${params.toString()}`, {
      headers: {
        accept: "image/png,image/*;q=0.9,*/*;q=0.5",
        "user-agent": "Painel-de-Bordo/194 (Carta Nautica DHN Automatica)",
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `IDEM-DHN respondeu HTTP ${upstream.status}.` },
        { status: 502 },
      );
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "image/png",
        "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar carta DHN." },
      { status: 502 },
    );
  }
}
