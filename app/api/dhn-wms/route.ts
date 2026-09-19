import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const DHN_WMS_CAPABILITIES =
  "https://idem.dhn.mar.mil.br/geoserver/wms?service=WMS&request=GetCapabilities&version=1.3.0";

export async function GET() {
  try {
    const response = await fetch(DHN_WMS_CAPABILITIES, {
      method: "GET",
      headers: {
        accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
        "user-agent": "Painel-de-Bordo/137",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `IDEM-DHN indisponível (${response.status}).` },
        { status: 502 },
      );
    }

    const xml = await response.text();
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível conectar ao serviço WMS da DHN." },
      { status: 502 },
    );
  }
}
