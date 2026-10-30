import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { reconcileMercadoPagoPayment } from "../../../../lib/mercadoPago";
import { getPanelUserFromRequest } from "../../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rowsOf<T = any>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }

export async function GET(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sessão encerrada." }, { status: 401 });
  const paymentId = String(new URL(request.url).searchParams.get("paymentId") || "").trim();
  if (!paymentId) return NextResponse.json({ error: "Pagamento não informado." }, { status: 400 });

  const db = getDb();
  const owned = rowsOf<any>(await db.execute(sql`
    select id, payment_id, status, credits, amount_brl from public.payment_orders
    where user_id = ${user.id} and payment_id = ${paymentId} limit 1
  `));
  if (!owned.length) return NextResponse.json({ error: "Pagamento não encontrado para esta conta." }, { status: 404 });

  try {
    const result = await reconcileMercadoPagoPayment(paymentId);
    return NextResponse.json({
      ok: result.ok !== false,
      status: result.status,
      approved: result.approved === true,
      credited: result.credited === true,
      balance: result.balance ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível verificar o PIX." }, { status: 502 });
  }
}
