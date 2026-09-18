import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { ensureBillingSchema, ensureWallet, getBillingSettings, priceForCredits } from "../../../../lib/credits";
import { mercadoPagoAccessToken } from "../../../../lib/mercadoPago";
import { getPanelUserFromRequest } from "../../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PACKAGES = new Set([10, 20, 50, 100]);

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function providerError(payload: any) {
  return String(payload?.cause?.[0]?.description || payload?.message || payload?.error || "Não foi possível gerar o PIX no Mercado Pago.");
}

export async function POST(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 });
  const accessToken = mercadoPagoAccessToken();
  if (!accessToken) return NextResponse.json({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado na Vercel." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const credits = Math.round(Number(body?.credits || 0));
  const cpf = onlyDigits(body?.cpf);
  if (!ALLOWED_PACKAGES.has(credits)) return NextResponse.json({ error: "Pacote de créditos inválido." }, { status: 400 });
  if (cpf.length !== 11) return NextResponse.json({ error: "Informe um CPF com 11 dígitos para gerar o PIX." }, { status: 400 });
  if (!user.email) return NextResponse.json({ error: "Sua conta não possui e-mail disponível para o pagamento." }, { status: 400 });

  await ensureBillingSchema();
  await ensureWallet(user);
  const settings = await getBillingSettings();
  const amountBrl = Number(priceForCredits(settings, credits).toFixed(2));
  const externalReference = `painel-pix-${user.id}-${Date.now()}-${randomUUID()}`;
  const origin = (process.env.PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  const db = getDb();

  await db.execute(sql`
    insert into public.payment_orders
      (external_reference, preference_id, user_id, user_email, credits, amount_brl, status)
    values
      (${externalReference}, ${"pix-direct"}, ${user.id}, ${user.email}, ${credits}, ${amountBrl}, 'creating')
    on conflict (external_reference) do nothing
  `);

  const names = String(user.fullName || user.displayName || "Cliente Painel").trim().split(/\s+/).filter(Boolean);
  const firstName = names[0] || "Cliente";
  const lastName = names.slice(1).join(" ") || "Painel";

  let paymentResponse: Response;
  try {
    paymentResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
        "x-idempotency-key": externalReference,
      },
      body: JSON.stringify({
        transaction_amount: amountBrl,
        description: `${credits} créditos — Painel de Bordo`,
        payment_method_id: "pix",
        external_reference: externalReference,
        notification_url: `${origin}/api/payments/webhook`,
        payer: {
          email: user.email,
          first_name: firstName,
          last_name: lastName,
          identification: { type: "CPF", number: cpf },
        },
        metadata: { user_id: user.id, credits, product: "painel_de_bordo_credits" },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch (cause) {
    await db.execute(sql`update public.payment_orders set status = 'provider_timeout', updated_at = CURRENT_TIMESTAMP::text where external_reference = ${externalReference}`);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Mercado Pago demorou para responder. Tente novamente." }, { status: 504 });
  }

  const payment = await paymentResponse.json().catch(() => ({}));
  if (!paymentResponse.ok || !payment?.id) {
    await db.execute(sql`update public.payment_orders set status = 'provider_error', updated_at = CURRENT_TIMESTAMP::text where external_reference = ${externalReference}`);
    return NextResponse.json({ error: providerError(payment) }, { status: 502 });
  }

  const paymentId = String(payment.id);
  const transactionData = payment?.point_of_interaction?.transaction_data || {};
  const qrCode = String(transactionData?.qr_code || "");
  const qrCodeBase64 = String(transactionData?.qr_code_base64 || "");
  const ticketUrl = String(transactionData?.ticket_url || "");
  if (!qrCode || !qrCodeBase64) {
    await db.execute(sql`
      update public.payment_orders set status = ${String(payment?.status || "pending")}, payment_id = ${paymentId}, updated_at = CURRENT_TIMESTAMP::text
      where external_reference = ${externalReference}
    `);
    return NextResponse.json({ error: "O Mercado Pago criou o pagamento, mas não devolveu o QR Code PIX. Gere um novo PIX." }, { status: 502 });
  }

  await db.execute(sql`
    update public.payment_orders
    set status = ${String(payment?.status || "pending")}, payment_id = ${paymentId}, updated_at = CURRENT_TIMESTAMP::text
    where external_reference = ${externalReference}
  `);

  return NextResponse.json({
    paymentId,
    externalReference,
    status: String(payment?.status || "pending"),
    credits,
    amountBrl,
    qrCode,
    qrCodeBase64,
    ticketUrl,
    expiresAt: payment?.date_of_expiration || null,
  });
}
