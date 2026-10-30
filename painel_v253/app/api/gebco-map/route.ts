import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GEBCO_WMS = "https://wms.gebco.net/mapserv";

export async function GET(request: NextRequest) {
  try {
    const params = new URLSearchParams();
    request.nextUrl.searchParams.forEach((value, key) => params.set(key, value));
    params.set("SERVICE", params.get("SERVICE") || "WMS");
    params.set("REQUEST", params.get("REQUEST") || "GetMap");
    params.set("VERSION", params.get("VERSION") || "1.1.1");
    params.set("LAYERS", params.get("LAYERS") || "GEBCO_Latest_2");
    params.set("FORMAT", params.get("FORMAT") || "image/png");

    const upstream = await fetch(`${GEBCO_WMS}?${params.toString()}`, {
      headers: {
        accept: "image/png,image/*;q=0.9,*/*;q=0.8",
        "user-agent": "Painel-de-Bordo/195 (Batimetria GEBCO 2026)",
      },
      cache: "force-cache",
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `GEBCO respondeu HTTP ${upstream.status}.` }, { status: 502 });
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "image/png",
        "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar batimetria GEBCO." },
      { status: 502 }
    );
  }
}
