import { NextRequest, NextResponse } from "next/server";
import { mercadoPagoAccessToken, reconcileMercadoPagoPayment } from "../../../../lib/mercadoPago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!mercadoPagoAccessToken()) return NextResponse.json({ ok: false }, { status: 503 });
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const type = String(body?.type || url.searchParams.get("type") || body?.topic || url.searchParams.get("topic") || "");
  const paymentId = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "").trim();
  if (!paymentId || (type && type !== "payment")) return NextResponse.json({ ok: true });
  try {
    const result = await reconcileMercadoPagoPayment(paymentId);
    return NextResponse.json({ ok: result.ok !== false });
  } catch (error) {
    console.error("Mercado Pago webhook error", error);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "mercadopago-pix-webhook" });
}
