import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { ensureBillingSchema } from "./credits";

function rowsOf<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function mercadoPagoAccessToken() {
  return process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || "";
}

export async function fetchMercadoPagoPayment(paymentId: string) {
  const accessToken = mercadoPagoAccessToken();
  if (!accessToken) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado na Vercel.");
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const payment = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payment?.message || payment?.error || "Não foi possível consultar o pagamento no Mercado Pago.");
  }
  return payment;
}

export async function reconcileMercadoPagoPayment(paymentId: string) {
  await ensureBillingSchema();
  const payment = await fetchMercadoPagoPayment(paymentId);
  const externalReference = String(payment?.external_reference || "").trim();
  const status = String(payment?.status || "").toLowerCase() || "unknown";
  if (!externalReference) return { ok: true, status, approved: false, credited: false, externalReference: "" };

  const db = getDb();
  const orders = rowsOf<any>(await db.execute(sql`
    select id, user_id, credits, amount_brl, status, payment_id
    from public.payment_orders
    where external_reference = ${externalReference}
    limit 1
  `));
  const order = orders[0];
  if (!order) return { ok: true, status, approved: false, credited: false, externalReference };

  if (status !== "approved") {
    await db.execute(sql`
      update public.payment_orders
      set status = ${status}, payment_id = coalesce(payment_id, ${paymentId}), updated_at = CURRENT_TIMESTAMP::text
      where id = ${order.id}
    `);
    return { ok: true, status, approved: false, credited: false, externalReference, order };
  }

  const paidAmount = Number(payment?.transaction_amount || 0);
  const expected = Number(order.amount_brl || 0);
  const currency = String(payment?.currency_id || "BRL");
  const method = String(payment?.payment_method_id || payment?.payment_type_id || "").toLowerCase();
  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expected) > 0.01 || currency !== "BRL" || (method && method !== "pix" && method !== "bank_transfer")) {
    await db.execute(sql`
      update public.payment_orders
      set status = 'amount_mismatch', payment_id = ${paymentId}, updated_at = CURRENT_TIMESTAMP::text
      where id = ${order.id}
    `);
    return { ok: false, status: "amount_mismatch", approved: false, credited: false, externalReference, order };
  }

  let credited = false;
  let balance: number | null = null;
  await db.transaction(async (tx) => {
    const locked = rowsOf<any>(await tx.execute(sql`
      select id, user_id, credits, amount_brl, status, payment_id
      from public.payment_orders where id = ${order.id} for update
    `))[0];
    if (!locked) return;
    if (locked.status === "approved") {
      const current = rowsOf<any>(await tx.execute(sql`select balance from public.credit_wallets where user_id = ${String(locked.user_id)} limit 1`));
      balance = current.length ? Number(current[0].balance || 0) : null;
      return;
    }
    if (locked.payment_id && String(locked.payment_id) !== paymentId) return;

    const walletRows = rowsOf<any>(await tx.execute(sql`
      update public.credit_wallets
      set balance = balance + ${Number(locked.credits)}, updated_at = CURRENT_TIMESTAMP::text
      where user_id = ${String(locked.user_id)}
      returning balance
    `));
    if (!walletRows.length) throw new Error("Carteira não encontrada.");
    balance = Number(walletRows[0].balance || 0);
    credited = true;

    await tx.execute(sql`
      insert into public.credit_transactions
        (user_id, delta, balance_after, kind, description, amount_brl, reference, metadata_json)
      values
        (${String(locked.user_id)}, ${Number(locked.credits)}, ${balance}, 'purchase', 'Compra PIX Mercado Pago', ${Number(locked.amount_brl)}, ${externalReference}, ${JSON.stringify({ paymentId, paymentMethod: "pix" })})
    `);
    await tx.execute(sql`
      update public.payment_orders
      set status = 'approved', payment_id = ${paymentId}, approved_at = CURRENT_TIMESTAMP::text, updated_at = CURRENT_TIMESTAMP::text
      where id = ${order.id}
    `);
  });

  return { ok: true, status: "approved", approved: true, credited, externalReference, order, balance };
}
