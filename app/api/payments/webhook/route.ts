import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { ensureBillingSchema } from "../../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rowsOf<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export async function POST(request: NextRequest) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) return NextResponse.json({ ok: false }, { status: 503 });
  await ensureBillingSchema();

  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const type = String(body?.type || url.searchParams.get("type") || body?.topic || url.searchParams.get("topic") || "");
  const paymentId = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "").trim();
  if (!paymentId || (type && type !== "payment")) return NextResponse.json({ ok: true });

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
  });
  const payment = await paymentResponse.json().catch(() => ({}));
  if (!paymentResponse.ok) return NextResponse.json({ ok: false }, { status: 502 });

  const externalReference = String(payment?.external_reference || "").trim();
  if (!externalReference) return NextResponse.json({ ok: true });
  const db = getDb();
  const orders = rowsOf<any>(await db.execute(sql`
    select id, user_id, credits, amount_brl, status, payment_id
    from public.payment_orders
    where external_reference = ${externalReference}
    limit 1
  `));
  const order = orders[0];
  if (!order) return NextResponse.json({ ok: true });

  const status = String(payment?.status || "").toLowerCase();
  if (status !== "approved") {
    await db.execute(sql`
      update public.payment_orders
      set status = ${status || "unknown"}, payment_id = coalesce(payment_id, ${paymentId}), updated_at = CURRENT_TIMESTAMP::text
      where id = ${order.id}
    `);
    return NextResponse.json({ ok: true });
  }

  const paidAmount = Number(payment?.transaction_amount || 0);
  const expected = Number(order.amount_brl || 0);
  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expected) > 0.01 || String(payment?.currency_id || "BRL") !== "BRL") {
    await db.execute(sql`
      update public.payment_orders set status = 'amount_mismatch', payment_id = ${paymentId}, updated_at = CURRENT_TIMESTAMP::text where id = ${order.id}
    `);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    const locked = rowsOf<any>(await tx.execute(sql`
      select id, user_id, credits, amount_brl, status, payment_id
      from public.payment_orders where id = ${order.id} for update
    `))[0];
    if (!locked || locked.status === "approved") return;
    if (locked.payment_id && String(locked.payment_id) !== paymentId) return;

    const walletRows = rowsOf<any>(await tx.execute(sql`
      update public.credit_wallets
      set balance = balance + ${Number(locked.credits)}, updated_at = CURRENT_TIMESTAMP::text
      where user_id = ${String(locked.user_id)}
      returning balance
    `));
    if (!walletRows.length) throw new Error("Carteira não encontrada.");
    const balance = Number(walletRows[0].balance || 0);

    await tx.execute(sql`
      insert into public.credit_transactions
        (user_id, delta, balance_after, kind, description, amount_brl, reference, metadata_json)
      values
        (${String(locked.user_id)}, ${Number(locked.credits)}, ${balance}, 'purchase', 'Compra Mercado Pago', ${Number(locked.amount_brl)}, ${externalReference}, ${JSON.stringify({ paymentId })})
    `);
    await tx.execute(sql`
      update public.payment_orders
      set status = 'approved', payment_id = ${paymentId}, approved_at = CURRENT_TIMESTAMP::text, updated_at = CURRENT_TIMESTAMP::text
      where id = ${order.id}
    `);
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "mercadopago-webhook" });
}
