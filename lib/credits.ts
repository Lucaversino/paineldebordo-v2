import { sql } from "drizzle-orm";
import { getDb } from "../db";
import type { PanelUser } from "./panelAuth";

export type ServiceMode = "ais_single" | "ais_update" | "ai_basic" | "ai_full" | "ai_advanced";

export type BillingSettings = {
  CREDIT_UNIT_PRICE: number;
  AIS_SINGLE_QUERY_CREDITS: number;
  AIS_UPDATE_CREDITS: number;
  AI_BASIC_QUERY_CREDITS: number;
  AI_FULL_ANALYSIS_CREDITS: number;
  AI_ADVANCED_ANALYSIS_CREDITS: number;
  AIS_CACHE_MINUTES: number;
  AIS_PROVIDER_COST_PER_QUERY_BRL: number;
  OPENAI_INPUT_COST_PER_1M: number;
  OPENAI_OUTPUT_COST_PER_1M: number;
  AI_BASIC_MODEL: string;
  AI_FULL_MODEL: string;
  AI_ADVANCED_MODEL: string;
};

const DEFAULT_SETTINGS: Record<keyof BillingSettings, string> = {
  CREDIT_UNIT_PRICE: "1.00",
  AIS_SINGLE_QUERY_CREDITS: "2",
  AIS_UPDATE_CREDITS: "2",
  AI_BASIC_QUERY_CREDITS: "1",
  AI_FULL_ANALYSIS_CREDITS: "2",
  AI_ADVANCED_ANALYSIS_CREDITS: "3",
  AIS_CACHE_MINUTES: "0",
  AIS_PROVIDER_COST_PER_QUERY_BRL: "0",
  OPENAI_INPUT_COST_PER_1M: "0",
  OPENAI_OUTPUT_COST_PER_1M: "0",
  AI_BASIC_MODEL: "",
  AI_FULL_MODEL: "",
  AI_ADVANCED_MODEL: "",
};

const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "brendaelucas.765@gmail.com").trim().toLowerCase();

let schemaPromise: Promise<void> | null = null;

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rowsOf<T = any>(result: unknown): T[] {
  return Array.isArray(result) ? result as T[] : [];
}

export function isSuperAdmin(user: Pick<PanelUser, "email">) {
  return Boolean(user.email && user.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL);
}

async function createBillingSchema() {
  const db = getDb();
  await db.execute(sql`
    create table if not exists public.billing_settings (
      key text primary key,
      value text not null,
      updated_at text not null default CURRENT_TIMESTAMP::text
    )
  `);
  await db.execute(sql`
    create table if not exists public.credit_wallets (
      user_id text primary key,
      email text,
      role text not null default 'user',
      balance integer not null default 0,
      free_ais_access boolean not null default false,
      free_ai_access boolean not null default false,
      created_at text not null default CURRENT_TIMESTAMP::text,
      updated_at text not null default CURRENT_TIMESTAMP::text
    )
  `);
  await db.execute(sql`
    create table if not exists public.credit_transactions (
      id bigserial primary key,
      user_id text not null,
      delta integer not null,
      balance_after integer not null,
      kind text not null,
      description text not null,
      amount_brl double precision,
      reference text,
      metadata_json text,
      created_at text not null default CURRENT_TIMESTAMP::text
    )
  `);
  await db.execute(sql`create index if not exists idx_credit_transactions_user_time on public.credit_transactions(user_id, id desc)`);
  await db.execute(sql`
    create table if not exists public.ai_usage (
      id bigserial primary key,
      user_id text not null,
      request_type text not null,
      model text,
      input_tokens integer,
      output_tokens integer,
      total_tokens integer,
      credits_charged integer not null default 0,
      estimated_api_cost_brl double precision not null default 0,
      status text not null,
      error_text text,
      created_at text not null default CURRENT_TIMESTAMP::text
    )
  `);
  await db.execute(sql`create index if not exists idx_ai_usage_user_time on public.ai_usage(user_id, id desc)`);
  await db.execute(sql`
    create table if not exists public.ais_usage (
      id bigserial primary key,
      user_id text not null,
      action text not null,
      vessel_name text,
      provider_calls integer not null default 0,
      cache_hit boolean not null default false,
      credits_charged integer not null default 0,
      estimated_api_cost_brl double precision not null default 0,
      status text not null,
      error_text text,
      created_at text not null default CURRENT_TIMESTAMP::text
    )
  `);
  await db.execute(sql`create index if not exists idx_ais_usage_user_time on public.ais_usage(user_id, id desc)`);
  await db.execute(sql`
    create table if not exists public.payment_orders (
      id bigserial primary key,
      external_reference text not null unique,
      preference_id text,
      payment_id text unique,
      user_id text not null,
      user_email text,
      credits integer not null,
      amount_brl double precision not null,
      status text not null default 'pending',
      created_at text not null default CURRENT_TIMESTAMP::text,
      updated_at text not null default CURRENT_TIMESTAMP::text,
      approved_at text
    )
  `);
  await db.execute(sql`create index if not exists idx_payment_orders_user_time on public.payment_orders(user_id, id desc)`);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.execute(sql`
      insert into public.billing_settings (key, value)
      values (${key}, ${value})
      on conflict (key) do nothing
    `);
  }
}

export async function ensureBillingSchema() {
  if (!schemaPromise) {
    schemaPromise = createBillingSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

export async function getBillingSettings(): Promise<BillingSettings> {
  await ensureBillingSchema();
  const db = getDb();
  const result = await db.execute(sql`select key, value from public.billing_settings`);
  const map = new Map(rowsOf<any>(result).map((row) => [String(row.key), String(row.value)]));
  const get = (key: keyof BillingSettings) => map.get(key) ?? DEFAULT_SETTINGS[key];
  return {
    CREDIT_UNIT_PRICE: Math.max(0.01, asNumber(get("CREDIT_UNIT_PRICE"), 1)),
    AIS_SINGLE_QUERY_CREDITS: Math.max(0, Math.round(asNumber(get("AIS_SINGLE_QUERY_CREDITS"), 2))),
    AIS_UPDATE_CREDITS: Math.max(0, Math.round(asNumber(get("AIS_UPDATE_CREDITS"), 2))),
    AI_BASIC_QUERY_CREDITS: Math.max(0, Math.round(asNumber(get("AI_BASIC_QUERY_CREDITS"), 1))),
    AI_FULL_ANALYSIS_CREDITS: Math.max(0, Math.round(asNumber(get("AI_FULL_ANALYSIS_CREDITS"), 2))),
    AI_ADVANCED_ANALYSIS_CREDITS: Math.max(0, Math.round(asNumber(get("AI_ADVANCED_ANALYSIS_CREDITS"), 3))),
    AIS_CACHE_MINUTES: Math.max(0, Math.round(asNumber(get("AIS_CACHE_MINUTES"), 0))),
    AIS_PROVIDER_COST_PER_QUERY_BRL: Math.max(0, asNumber(get("AIS_PROVIDER_COST_PER_QUERY_BRL"), 0)),
    OPENAI_INPUT_COST_PER_1M: Math.max(0, asNumber(get("OPENAI_INPUT_COST_PER_1M"), 0)),
    OPENAI_OUTPUT_COST_PER_1M: Math.max(0, asNumber(get("OPENAI_OUTPUT_COST_PER_1M"), 0)),
    AI_BASIC_MODEL: String(get("AI_BASIC_MODEL") || ""),
    AI_FULL_MODEL: String(get("AI_FULL_MODEL") || ""),
    AI_ADVANCED_MODEL: String(get("AI_ADVANCED_MODEL") || ""),
  };
}

export async function ensureWallet(user: PanelUser) {
  await ensureBillingSchema();
  const db = getDb();
  const admin = isSuperAdmin(user);
  await db.execute(sql`
    insert into public.credit_wallets (user_id, email, role, balance, free_ais_access, free_ai_access)
    values (${user.id}, ${user.email || null}, ${admin ? "super_admin" : "user"}, 0, ${admin}, ${admin})
    on conflict (user_id) do update set
      email = excluded.email,
      role = ${admin ? "super_admin" : "user"},
      free_ais_access = ${admin},
      free_ai_access = ${admin},
      updated_at = CURRENT_TIMESTAMP::text
  `);
  const rows = rowsOf<any>(await db.execute(sql`
    select user_id, email, role, balance, free_ais_access, free_ai_access
    from public.credit_wallets where user_id = ${user.id} limit 1
  `));
  const row = rows[0] || {};
  return {
    userId: user.id,
    email: row.email || user.email,
    role: row.role || (admin ? "super_admin" : "user"),
    balance: Math.max(0, Math.round(asNumber(row.balance, 0))),
    freeAisAccess: Boolean(row.free_ais_access ?? admin),
    freeAiAccess: Boolean(row.free_ai_access ?? admin),
    isSuperAdmin: admin,
  };
}

export function creditsForMode(settings: BillingSettings, mode: ServiceMode) {
  switch (mode) {
    case "ais_single": return settings.AIS_SINGLE_QUERY_CREDITS;
    case "ais_update": return settings.AIS_UPDATE_CREDITS;
    case "ai_basic": return settings.AI_BASIC_QUERY_CREDITS;
    case "ai_full": return settings.AI_FULL_ANALYSIS_CREDITS;
    case "ai_advanced": return settings.AI_ADVANCED_ANALYSIS_CREDITS;
  }
}

export function priceForCredits(settings: BillingSettings, credits: number) {
  return Math.round(credits * settings.CREDIT_UNIT_PRICE * 100) / 100;
}

export async function assertCanUse(user: PanelUser, mode: ServiceMode) {
  const [wallet, settings] = await Promise.all([ensureWallet(user), getBillingSettings()]);
  const isAis = mode.startsWith("ais_");
  const isFree = isAis ? wallet.freeAisAccess : wallet.freeAiAccess;
  const credits = isFree ? 0 : creditsForMode(settings, mode);
  if (!isFree && wallet.balance < credits) {
    const error = Object.assign(new Error(`Saldo insuficiente. Esta operação custa ${credits} crédito(s).`), {
      status: 402,
      code: "insufficient_credits",
      balance: wallet.balance,
      required: credits,
    });
    throw error;
  }
  return { wallet, settings, credits, isFree };
}

export async function debitCreditsAfterSuccess(args: {
  user: PanelUser;
  mode: ServiceMode;
  description: string;
  reference?: string | null;
  metadata?: unknown;
}) {
  const db = getDb();
  const access = await assertCanUse(args.user, args.mode);
  if (access.isFree || access.credits <= 0) {
    return { charged: 0, balance: access.wallet.balance, free: true, settings: access.settings };
  }

  const amountBrl = priceForCredits(access.settings, access.credits);
  const updated = rowsOf<any>(await db.execute(sql`
    update public.credit_wallets
    set balance = balance - ${access.credits}, updated_at = CURRENT_TIMESTAMP::text
    where user_id = ${args.user.id} and balance >= ${access.credits}
    returning balance
  `));
  if (!updated.length) {
    const current = await ensureWallet(args.user);
    const error = Object.assign(new Error(`Saldo insuficiente. Esta operação custa ${access.credits} crédito(s).`), {
      status: 402,
      code: "insufficient_credits",
      balance: current.balance,
      required: access.credits,
    });
    throw error;
  }
  const balance = Math.max(0, Math.round(asNumber(updated[0].balance, 0)));
  await db.execute(sql`
    insert into public.credit_transactions
      (user_id, delta, balance_after, kind, description, amount_brl, reference, metadata_json)
    values
      (${args.user.id}, ${-access.credits}, ${balance}, ${args.mode}, ${args.description}, ${amountBrl}, ${args.reference || null}, ${args.metadata ? JSON.stringify(args.metadata) : null})
  `);
  return { charged: access.credits, balance, free: false, settings: access.settings };
}

export async function addPurchasedCredits(args: {
  userId: string;
  credits: number;
  amountBrl: number;
  reference: string;
  paymentId: string;
}) {
  await ensureBillingSchema();
  const db = getDb();
  const result = rowsOf<any>(await db.execute(sql`
    update public.credit_wallets
    set balance = balance + ${args.credits}, updated_at = CURRENT_TIMESTAMP::text
    where user_id = ${args.userId}
    returning balance
  `));
  if (!result.length) throw new Error("Carteira do usuário não encontrada para creditar a compra.");
  const balance = Math.max(0, Math.round(asNumber(result[0].balance, 0)));
  await db.execute(sql`
    insert into public.credit_transactions
      (user_id, delta, balance_after, kind, description, amount_brl, reference, metadata_json)
    values
      (${args.userId}, ${args.credits}, ${balance}, 'purchase', 'Compra Mercado Pago', ${args.amountBrl}, ${args.reference}, ${JSON.stringify({ paymentId: args.paymentId })})
  `);
  return balance;
}

export async function listCreditTransactions(userId: string, limit = 50) {
  await ensureBillingSchema();
  const db = getDb();
  return rowsOf<any>(await db.execute(sql`
    select id, delta, balance_after as "balanceAfter", kind, description, amount_brl as "amountBrl",
           reference, metadata_json as "metadataJson", created_at as "createdAt"
    from public.credit_transactions
    where user_id = ${userId}
    order by id desc
    limit ${Math.max(1, Math.min(200, limit))}
  `));
}

export async function logAiUsage(args: {
  userId: string;
  requestType: string;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  creditsCharged: number;
  estimatedApiCostBrl: number;
  status: string;
  errorText?: string | null;
}) {
  await ensureBillingSchema();
  const db = getDb();
  await db.execute(sql`
    insert into public.ai_usage
      (user_id, request_type, model, input_tokens, output_tokens, total_tokens, credits_charged, estimated_api_cost_brl, status, error_text)
    values
      (${args.userId}, ${args.requestType}, ${args.model || null}, ${args.inputTokens ?? null}, ${args.outputTokens ?? null}, ${args.totalTokens ?? null}, ${args.creditsCharged}, ${args.estimatedApiCostBrl}, ${args.status}, ${args.errorText || null})
  `);
}

export async function logAisUsage(args: {
  userId: string;
  action: string;
  vesselName?: string | null;
  providerCalls: number;
  cacheHit?: boolean;
  creditsCharged: number;
  estimatedApiCostBrl: number;
  status: string;
  errorText?: string | null;
}) {
  await ensureBillingSchema();
  const db = getDb();
  await db.execute(sql`
    insert into public.ais_usage
      (user_id, action, vessel_name, provider_calls, cache_hit, credits_charged, estimated_api_cost_brl, status, error_text)
    values
      (${args.userId}, ${args.action}, ${args.vesselName || null}, ${args.providerCalls}, ${Boolean(args.cacheHit)}, ${args.creditsCharged}, ${args.estimatedApiCostBrl}, ${args.status}, ${args.errorText || null})
  `);
}

export async function updateBillingSettings(user: PanelUser, values: Partial<Record<keyof BillingSettings, string | number>>) {
  if (!isSuperAdmin(user)) throw Object.assign(new Error("Acesso administrativo negado."), { status: 403 });
  await ensureBillingSchema();
  const db = getDb();
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  for (const [key, raw] of Object.entries(values)) {
    if (!allowed.has(key)) continue;
    const value = String(raw ?? "").trim();
    if (!value && !key.endsWith("_MODEL")) continue;
    await db.execute(sql`
      insert into public.billing_settings (key, value, updated_at)
      values (${key}, ${value}, CURRENT_TIMESTAMP::text)
      on conflict (key) do update set value = excluded.value, updated_at = CURRENT_TIMESTAMP::text
    `);
  }
  return getBillingSettings();
}

export async function getAdminBillingStats(user: PanelUser) {
  if (!isSuperAdmin(user)) throw Object.assign(new Error("Acesso administrativo negado."), { status: 403 });
  await ensureBillingSchema();
  const db = getDb();
  const pick = async (query: any) => rowsOf<any>(await db.execute(query))[0] || {};
  const [wallet, transactions, payments, ais, ai] = await Promise.all([
    pick(sql`select coalesce(sum(balance),0)::int as balance, count(*)::int as users from public.credit_wallets`),
    pick(sql`select coalesce(sum(case when delta > 0 then delta else 0 end),0)::int as sold, coalesce(sum(case when delta < 0 then -delta else 0 end),0)::int as used from public.credit_transactions`),
    pick(sql`select coalesce(sum(amount_brl),0)::float8 as revenue, count(*) filter (where status = 'approved')::int as approved from public.payment_orders where status = 'approved'`),
    pick(sql`select count(*)::int as queries, count(distinct vessel_name)::int as vessels, coalesce(sum(credits_charged),0)::int as credits, coalesce(sum(provider_calls),0)::int as calls, count(*) filter (where cache_hit)::int as cache, coalesce(sum(estimated_api_cost_brl),0)::float8 as cost from public.ais_usage where status = 'success'`),
    pick(sql`select count(*)::int as queries,
      count(*) filter (where request_type = 'basic')::int as basic,
      count(*) filter (where request_type = 'full')::int as full,
      count(*) filter (where request_type = 'advanced')::int as advanced,
      coalesce(sum(credits_charged),0)::int as credits,
      coalesce(sum(total_tokens),0)::bigint as tokens,
      coalesce(sum(estimated_api_cost_brl),0)::float8 as cost
      from public.ai_usage where status = 'success'`),
  ]);
  const revenue = asNumber(payments.revenue, 0);
  const aisCost = asNumber(ais.cost, 0);
  const aiCost = asNumber(ai.cost, 0);
  const totalCost = aisCost + aiCost;
  return {
    creditsSold: asNumber(transactions.sold, 0),
    creditsUsed: asNumber(transactions.used, 0),
    creditsInWallets: asNumber(wallet.balance, 0),
    users: asNumber(wallet.users, 0),
    revenue,
    ais: { queries: asNumber(ais.queries, 0), vessels: asNumber(ais.vessels, 0), credits: asNumber(ais.credits, 0), providerCalls: asNumber(ais.calls, 0), cacheHits: asNumber(ais.cache, 0), cost: aisCost },
    ai: { queries: asNumber(ai.queries, 0), basic: asNumber(ai.basic, 0), full: asNumber(ai.full, 0), advanced: asNumber(ai.advanced, 0), credits: asNumber(ai.credits, 0), tokens: asNumber(ai.tokens, 0), cost: aiCost },
    totalCost,
    grossResult: revenue - totalCost,
    estimatedMarginPct: revenue > 0 ? ((revenue - totalCost) / revenue) * 100 : null,
  };
}
