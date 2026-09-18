import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { ensureBillingSchema, ensureWallet, getBillingSettings, priceForCredits } from "../../../../lib/credits";
import { getPanelUser } from "../../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PACKAGES = new Set([10, 20, 50, 100]);

export async function POST(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    return NextResponse.json({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado na Vercel." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({}));
  const credits = Math.round(Number(body?.credits || 0));
  if (!ALLOWED_PACKAGES.has(credits)) {
    return NextResponse.json({ error: "Pacote de créditos inválido." }, { status: 400 });
  }

  await ensureBillingSchema();
  await ensureWallet(user);
  const settings = await getBillingSettings();
  const amountBrl = priceForCredits(settings, credits);
  const externalReference = `painel-${user.id}-${Date.now()}-${randomUUID()}`;
  const origin = (process.env.PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");

  const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-idempotency-key": externalReference,
    },
    body: JSON.stringify({
      items: [{
        id: `credits-${credits}`,
        title: `${credits} créditos — Painel de Bordo`,
        description: "Créditos para consultas AIS e Assistente IA",
        quantity: 1,
        currency_id: "BRL",
        unit_price: amountBrl,
      }],
      payer: user.email ? { email: user.email } : undefined,
      external_reference: externalReference,
      notification_url: `${origin}/api/payments/webhook`,
      back_urls: {
        success: `${origin}/?view=credits&payment=success`,
        pending: `${origin}/?view=credits&payment=pending`,
        failure: `${origin}/?view=credits&payment=failure`,
      },
      auto_return: "approved",
      statement_descriptor: "PAINEL BORDO",
      metadata: { user_id: user.id, credits },
    }),
    cache: "no-store",
  });

  const preference = await preferenceResponse.json().catch(() => ({}));
  if (!preferenceResponse.ok || !preference?.id || !preference?.init_point) {
    return NextResponse.json({ error: preference?.message || "Não foi possível criar o pagamento no Mercado Pago." }, { status: 502 });
  }

  const db = getDb();
  await db.execute(sql`
    insert into public.payment_orders
      (external_reference, preference_id, user_id, user_email, credits, amount_brl, status)
    values
      (${externalReference}, ${String(preference.id)}, ${user.id}, ${user.email || null}, ${credits}, ${amountBrl}, 'pending')
    on conflict (external_reference) do nothing
  `);

  return NextResponse.json({
    preferenceId: String(preference.id),
    checkoutUrl: String(preference.init_point),
    credits,
    amountBrl,
  });
}
