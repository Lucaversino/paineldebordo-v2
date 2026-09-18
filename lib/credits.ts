import { sql } from "drizzle-orm";
import { getDb } from "../db";
import type { PanelUser } from "./panelAuth";

export type ServiceMode = "ais_single" | "ais_update" | "ais_area" | "ai_basic" | "ai_full" | "ai_advanced";

export type BillingSettings = {
  CREDIT_UNIT_PRICE: number;
  AIS_SINGLE_QUERY_CREDITS: number;
  AIS_UPDATE_CREDITS: number;
  AIS_AREA_QUERY_CREDITS: number;
  AI_BASIC_QUERY_CREDITS: number;
  AI_FULL_ANALYSIS_CREDITS: number;
  AI_ADVANCED_ANALYSIS_CREDITS: number;
  AI_WELCOME_BONUS_BRL: number;
  AIS_CACHE_MINUTES: number;
  AIS_PROVIDER_COST_PER_QUERY_BRL: number;
  OPENAI_INPUT_COST_PER_1M: number;
  OPENAI_OUTPUT_COST_PER_1M: number;
  AI_BASIC_MODEL: string;
  AI_FULL_MODEL: string;
  AI_ADVANCED_MODEL: string;
};

export type WalletState = {
  userId: string;
  email: string;
  role: string;
  balance: number;
  aiBonusBrl: number;
  freeAisAccess: boolean;
  freeAiAccess: boolean;
  isSuperAdmin: boolean;
};

const DEFAULT_SETTINGS: Record<keyof BillingSettings, string> = {
  CREDIT_UNIT_PRICE: "1.00",
  AIS_SINGLE_QUERY_CREDITS: "2",
  AIS_UPDATE_CREDITS: "1",
  AIS_AREA_QUERY_CREDITS: "10",
  AI_BASIC_QUERY_CREDITS: "0",
  AI_FULL_ANALYSIS_CREDITS: "0",
  AI_ADVANCED_ANALYSIS_CREDITS: "0",
  AI_WELCOME_BONUS_BRL: "0",
  AIS_CACHE_MINUTES: "0",
  AIS_PROVIDER_COST_PER_QUERY_BRL: "0",
  OPENAI_INPUT_COST_PER_1M: "0",
  OPENAI_OUTPUT_COST_PER_1M: "0",
  AI_BASIC_MODEL: "",
  AI_FULL_MODEL: "",
  AI_ADVANCED_MODEL: "",
};

const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "brendaelucas.765@gmail.com").trim().toLowerCase();
const SETTINGS_CACHE_MS = 60_000;
const BILLING_SCHEMA_VERSION = "85";
const ADMIN_INITIAL_CREDITS = Math.max(0, Math.round(Number(process.env.ADMIN_INITIAL_CREDITS || 80) || 80));

let schemaPromise: Promise<void> | null = null;
let schemaReady = false;
let settingsCache: { value: BillingSettings; expiresAt: number } | null = null;

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

function errorText(error: unknown) {
  const anyError = error as any;
  return [anyError?.code, anyError?.message, anyError?.cause?.code, anyError?.cause?.message]
    .filter(Boolean).join(" ").toUpperCase();
}

function missingBillingTable(error: unknown) {
  const text = errorText(error);
  return text.includes("42P01") || text.includes("BILLING_SETTINGS") && text.includes("DOES NOT EXIST");
}

function transientDbError(error: unknown) {
  const text = errorText(error);
  return ["CONNECTION_CLOSED", "ECONNRESET", "ETIMEDOUT", "CONNECTION TERMINATED", "SOCKET"].some((part) => text.includes(part));
}

async function retryDb<T>(work: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await work(); } catch (error) {
      lastError = error;
      if (!transientDbError(error) || attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }
  throw lastError;
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
      ai_bonus_brl double precision not null default 0,
      ai_bonus_granted boolean not null default false,
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
  await db.execute(sql`
    insert into public.billing_settings (key, value)
    values ('BILLING_SCHEMA_VERSION', ${BILLING_SCHEMA_VERSION})
    on conflict (key) do update set value = excluded.value, updated_at = CURRENT_TIMESTAMP::text
  `);
}

async function migrateBillingSchemaIfNeeded() {
  const db = getDb();
  const versionRows = rowsOf<any>(await retryDb(() => db.execute(sql`
    select value from public.billing_settings where key = 'BILLING_SCHEMA_VERSION' limit 1
  `), 1));
  if (String(versionRows[0]?.value || "") === BILLING_SCHEMA_VERSION) return;

  // V85: Painel IA fica livre para todos. Créditos continuam sendo usados somente pelo AIS.
  await db.execute(sql`
    alter table public.credit_wallets
      add column if not exists ai_bonus_brl double precision not null default 0,
      add column if not exists ai_bonus_granted boolean not null default false,
      add column if not exists free_ai_access boolean not null default true
  `);
  await db.execute(sql`
    update public.credit_wallets
    set ai_bonus_brl = 0, ai_bonus_granted = true, free_ai_access = true, free_ais_access = false, updated_at = CURRENT_TIMESTAMP::text
  `);
  for (const [key, value] of Object.entries({
    AI_BASIC_QUERY_CREDITS: '0',
    AI_FULL_ANALYSIS_CREDITS: '0',
    AI_ADVANCED_ANALYSIS_CREDITS: '0',
    AI_WELCOME_BONUS_BRL: '0',
  })) {
    await db.execute(sql`
      insert into public.billing_settings (key, value, updated_at)
      values (${key}, ${value}, CURRENT_TIMESTAMP::text)
      on conflict (key) do update set value = excluded.value, updated_at = CURRENT_TIMESTAMP::text
    `);
  }
  await db.execute(sql`
    insert into public.billing_settings (key, value)
    values ('BILLING_SCHEMA_VERSION', ${BILLING_SCHEMA_VERSION})
    on conflict (key) do update set value = excluded.value, updated_at = CURRENT_TIMESTAMP::text
  `);
}

export async function ensureBillingSchema() {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = getDb();
      try {
        await retryDb(() => db.execute(sql`select 1 from public.billing_settings limit 1`), 1);
      } catch (error) {
        if (!missingBillingTable(error)) throw error;
        await createBillingSchema();
      }
      await migrateBillingSchemaIfNeeded();
      schemaReady = true;
    })().catch((error) => {
      schemaPromise = null;
      schemaReady = false;
      throw error;
    });
  }
  await schemaPromise;
}

function parseSettings(result: unknown): BillingSettings {
  const map = new Map(rowsOf<any>(result).map((row) => [String(row.key), String(row.value)]));
  const get = (key: keyof BillingSettings) => map.get(key) ?? DEFAULT_SETTINGS[key];
  return {
    CREDIT_UNIT_PRICE: Math.max(0.01, asNumber(get("CREDIT_UNIT_PRICE"), 1)),
    AIS_SINGLE_QUERY_CREDITS: Math.max(0, Math.round(asNumber(get("AIS_SINGLE_QUERY_CREDITS"), 2))),
    AIS_UPDATE_CREDITS: Math.max(0, Math.round(asNumber(get("AIS_UPDATE_CREDITS"), 1))),
    AIS_AREA_QUERY_CREDITS: Math.max(0, Math.round(asNumber(get("AIS_AREA_QUERY_CREDITS"), 10))),
    AI_BASIC_QUERY_CREDITS: Math.max(0, Math.round(asNumber(get("AI_BASIC_QUERY_CREDITS"), 0))),
    AI_FULL_ANALYSIS_CREDITS: Math.max(0, Math.round(asNumber(get("AI_FULL_ANALYSIS_CREDITS"), 0))),
    AI_ADVANCED_ANALYSIS_CREDITS: Math.max(0, Math.round(asNumber(get("AI_ADVANCED_ANALYSIS_CREDITS"), 0))),
    AI_WELCOME_BONUS_BRL: Math.max(0, asNumber(get("AI_WELCOME_BONUS_BRL"), 0)),
    AIS_CACHE_MINUTES: Math.max(0, Math.round(asNumber(get("AIS_CACHE_MINUTES"), 0))),
    AIS_PROVIDER_COST_PER_QUERY_BRL: Math.max(0, asNumber(get("AIS_PROVIDER_COST_PER_QUERY_BRL"), 0)),
    OPENAI_INPUT_COST_PER_1M: Math.max(0, asNumber(get("OPENAI_INPUT_COST_PER_1M"), 0)),
    OPENAI_OUTPUT_COST_PER_1M: Math.max(0, asNumber(get("OPENAI_OUTPUT_COST_PER_1M"), 0)),
    AI_BASIC_MODEL: String(get("AI_BASIC_MODEL") || ""),
    AI_FULL_MODEL: String(get("AI_FULL_MODEL") || ""),
    AI_ADVANCED_MODEL: String(get("AI_ADVANCED_MODEL") || ""),
  };
}

export async function getBillingSettings(): Promise<BillingSettings> {
  if (settingsCache && settingsCache.expiresAt > Date.now()) return settingsCache.value;
  await ensureBillingSchema();
  const db = getDb();
  const result = await retryDb(() => db.execute(sql`select key, value from public.billing_settings`), 1);
  const value = parseSettings(result);
  settingsCache = { value, expiresAt: Date.now() + SETTINGS_CACHE_MS };
  return value;
}

export function invalidateBillingSettingsCache() {
  settingsCache = null;
}

export async function ensureWallet(user: PanelUser, suppliedSettings?: BillingSettings): Promise<WalletState> {
  await ensureBillingSchema();
  const db = getDb();
  const admin = isSuperAdmin(user);
  const settings = suppliedSettings || await getBillingSettings();

  let rows = rowsOf<any>(await retryDb(() => db.execute(sql`
    select user_id, email, role, balance, ai_bonus_brl, ai_bonus_granted, free_ais_access, free_ai_access
    from public.credit_wallets where user_id = ${user.id} limit 1
  `), 1));

  if (!rows.length) {
    const welcomeBonus = 0;
    rows = rowsOf<any>(await retryDb(() => db.execute(sql`
      insert into public.credit_wallets
        (user_id, email, role, balance, ai_bonus_brl, ai_bonus_granted, free_ais_access, free_ai_access)
      values
        (${user.id}, ${user.email || null}, ${admin ? "super_admin" : "user"}, 0, ${welcomeBonus}, true, false, true)
      on conflict (user_id) do nothing
      returning user_id, email, role, balance, ai_bonus_brl, ai_bonus_granted, free_ais_access, free_ai_access
    `), 1));
    if (!rows.length) {
      rows = rowsOf<any>(await retryDb(() => db.execute(sql`
        select user_id, email, role, balance, ai_bonus_brl, ai_bonus_granted, free_ais_access, free_ai_access
        from public.credit_wallets where user_id = ${user.id} limit 1
      `), 1));
    } else if (welcomeBonus > 0) {
      await db.execute(sql`
        insert into public.credit_transactions
          (user_id, delta, balance_after, kind, description, amount_brl, reference, metadata_json)
        values
          (${user.id}, 0, 0, 'ai_welcome_bonus', 'Bônus inicial do Painel IA', ${welcomeBonus}, 'AI_WELCOME_V80', ${JSON.stringify({ aiOnly: true })})
      `).catch(() => null);
    }
  }

  let row = rows[0] || {};
  const expectedRole = admin ? "super_admin" : "user";
  const flagsWrong = Boolean(row.free_ais_access) || !Boolean(row.free_ai_access) || String(row.role || "") !== expectedRole || String(row.email || "") !== String(user.email || "");
  if (flagsWrong) {
    const updated = rowsOf<any>(await retryDb(() => db.execute(sql`
      update public.credit_wallets set
        email = ${user.email || null}, role = ${expectedRole}, ai_bonus_brl = 0, ai_bonus_granted = true, free_ais_access = false, free_ai_access = true, updated_at = CURRENT_TIMESTAMP::text
      where user_id = ${user.id}
      returning user_id, email, role, balance, ai_bonus_brl, ai_bonus_granted, free_ais_access, free_ai_access
    `), 1));
    if (updated[0]) row = updated[0];
  }

  if (admin && ADMIN_INITIAL_CREDITS > 0) {
    const marker = rowsOf<any>(await retryDb(() => db.execute(sql`
      select id from public.credit_transactions
      where user_id = ${user.id} and reference = 'ADMIN_INITIAL_CREDITS_V84'
      limit 1
    `), 1));
    if (!marker.length) {
      const currentBalance = Math.max(0, Math.round(asNumber(row.balance, 0)));
      const targetBalance = Math.max(currentBalance, ADMIN_INITIAL_CREDITS);
      const delta = targetBalance - currentBalance;
      if (delta > 0) {
        const updated = rowsOf<any>(await retryDb(() => db.execute(sql`
          update public.credit_wallets
          set balance = ${targetBalance}, updated_at = CURRENT_TIMESTAMP::text
          where user_id = ${user.id}
          returning balance
        `), 1));
        if (updated[0]) row = { ...row, balance: updated[0].balance };
      }
      await db.execute(sql`
        insert into public.credit_transactions
          (user_id, delta, balance_after, kind, description, amount_brl, reference, metadata_json)
        values
          (${user.id}, ${delta}, ${targetBalance}, 'admin_initial_credit', 'Créditos iniciais do administrador', null, 'ADMIN_INITIAL_CREDITS_V84', ${JSON.stringify({ targetCredits: ADMIN_INITIAL_CREDITS })})
      `).catch(() => null);
    }
  }

  return {
    userId: user.id,
    email: row.email || user.email,
    role: row.role || expectedRole,
    balance: Math.max(0, Math.round(asNumber(row.balance, 0))),
    aiBonusBrl: 0,
    freeAisAccess: false,
    freeAiAccess: true,
    isSuperAdmin: admin,
  };
}

export function creditsForMode(settings: BillingSettings, mode: ServiceMode) {
  switch (mode) {
    case "ais_single": return settings.AIS_SINGLE_QUERY_CREDITS;
    case "ais_update": return settings.AIS_UPDATE_CREDITS;
    case "ais_area": return settings.AIS_AREA_QUERY_CREDITS;
    case "ai_basic": return settings.AI_BASIC_QUERY_CREDITS;
    case "ai_full": return settings.AI_FULL_ANALYSIS_CREDITS;
    case "ai_advanced": return settings.AI_ADVANCED_ANALYSIS_CREDITS;
  }
}

export function priceForCredits(settings: BillingSettings, credits: number) {
  return Math.round(credits * settings.CREDIT_UNIT_PRICE * 100) / 100;
}

export function quoteService(wallet: WalletState, settings: BillingSettings, mode: ServiceMode) {
  const isAis = mode.startsWith("ais_");
  const isFree = isAis ? wallet.freeAisAccess : wallet.freeAiAccess;
  const configuredCredits = isFree ? 0 : creditsForMode(settings, mode);
  const fullPriceBrl = isFree ? 0 : priceForCredits(settings, configuredCredits);
  const bonusAppliedBrl = !isAis && !isFree ? Math.min(wallet.aiBonusBrl, fullPriceBrl) : 0;
  const remainingBrl = Math.max(0, fullPriceBrl - bonusAppliedBrl);
  const credits = isFree || remainingBrl <= 0 ? 0 : Math.min(configuredCredits, Math.ceil((remainingBrl / settings.CREDIT_UNIT_PRICE) - 1e-9));
  return { isAis, isFree, configuredCredits, fullPriceBrl, bonusAppliedBrl, credits };
}

export async function assertCanUse(user: PanelUser, mode: ServiceMode) {
  const settings = await getBillingSettings();
  const wallet = await ensureWallet(user, settings);
  const quote = quoteService(wallet, settings, mode);
  if (!quote.isFree && wallet.balance < quote.credits) {
    const error = Object.assign(new Error(`Saldo insuficiente. Esta operação precisa de ${quote.credits} crédito(s) após o bônus da IA.`), {
      status: 402,
      code: "insufficient_credits",
      balance: wallet.balance,
      required: quote.credits,
      aiBonusBrl: wallet.aiBonusBrl,
    });
    throw error;
  }
  return { wallet, settings, ...quote };
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
  if (access.isFree) {
    return { charged: 0, balance: access.wallet.balance, free: true, bonusUsedBrl: 0, aiBonusBrl: access.wallet.aiBonusBrl, settings: access.settings };
  }

  const bonusUsedBrl = Math.round(access.bonusAppliedBrl * 100) / 100;
  const creditsToCharge = access.credits;
  if (bonusUsedBrl <= 0 && creditsToCharge <= 0) {
    return { charged: 0, balance: access.wallet.balance, free: false, bonusUsedBrl: 0, aiBonusBrl: access.wallet.aiBonusBrl, settings: access.settings };
  }

  const updated = rowsOf<any>(await retryDb(() => db.execute(sql`
    update public.credit_wallets
    set
      ai_bonus_brl = greatest(0, ai_bonus_brl - ${bonusUsedBrl}),
      balance = balance - ${creditsToCharge},
      updated_at = CURRENT_TIMESTAMP::text
    where user_id = ${args.user.id}
      and balance >= ${creditsToCharge}
      and ai_bonus_brl + 0.0001 >= ${bonusUsedBrl}
    returning balance, ai_bonus_brl
  `), 1));

  if (!updated.length) {
    const current = await ensureWallet(args.user, access.settings);
    const error = Object.assign(new Error("Saldo ou bônus da IA mudou durante a operação. Tente novamente."), {
      status: 409,
      code: "wallet_changed",
      balance: current.balance,
      aiBonusBrl: current.aiBonusBrl,
    });
    throw error;
  }

  const balance = Math.max(0, Math.round(asNumber(updated[0].balance, 0)));
  const aiBonusBrl = Math.max(0, Math.round(asNumber(updated[0].ai_bonus_brl, 0) * 100) / 100);

  if (bonusUsedBrl > 0) {
    await db.execute(sql`
      insert into public.credit_transactions
        (user_id, delta, balance_after, kind, description, amount_brl, reference, metadata_json)
      values
        (${args.user.id}, 0, ${balance}, 'ai_bonus_spend', ${args.description + " — bônus IA"}, ${-bonusUsedBrl}, ${args.reference || null}, ${args.metadata ? JSON.stringify(args.metadata) : null})
    `).catch(() => null);
  }
  if (creditsToCharge > 0) {
    const amountBrl = priceForCredits(access.settings, creditsToCharge);
    await db.execute(sql`
      insert into public.credit_transactions
        (user_id, delta, balance_after, kind, description, amount_brl, reference, metadata_json)
      values
        (${args.user.id}, ${-creditsToCharge}, ${balance}, ${args.mode}, ${args.description}, ${amountBrl}, ${args.reference || null}, ${args.metadata ? JSON.stringify(args.metadata) : null})
    `);
  }

  return { charged: creditsToCharge, balance, free: false, bonusUsedBrl, aiBonusBrl, settings: access.settings };
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
  const result = rowsOf<any>(await retryDb(() => db.execute(sql`
    update public.credit_wallets
    set balance = balance + ${args.credits}, updated_at = CURRENT_TIMESTAMP::text
    where user_id = ${args.userId}
    returning balance
  `), 1));
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
  return rowsOf<any>(await retryDb(() => db.execute(sql`
    select id, delta, balance_after as "balanceAfter", kind, description, amount_brl as "amountBrl",
           reference, metadata_json as "metadataJson", created_at as "createdAt"
    from public.credit_transactions
    where user_id = ${userId}
    order by id desc
    limit ${Math.max(1, Math.min(200, limit))}
  `), 1));
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
  invalidateBillingSettingsCache();
  return getBillingSettings();
}

export type AdminCreditUser = {
  userId: string;
  email: string;
  balance: number;
  role: string;
  createdAt?: string | null;
};

export async function listAdminCreditUsers(user: PanelUser, search = "", limit = 300): Promise<AdminCreditUser[]> {
  if (!isSuperAdmin(user)) throw Object.assign(new Error("Acesso administrativo negado."), { status: 403 });
  await ensureBillingSchema();
  const db = getDb();
  const term = search.trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(500, Math.round(limit || 300)));

  try {
    const rows = rowsOf<any>(await retryDb(() => db.execute(sql`
      select
        u.id::text as user_id,
        coalesce(u.email, w.email, '') as email,
        coalesce(w.balance, 0)::int as balance,
        coalesce(w.role, 'user') as role,
        u.created_at::text as created_at
      from auth.users u
      left join public.credit_wallets w on w.user_id = u.id::text
      where ${term === ""} or lower(coalesce(u.email, '')) like ${`%${term}%`}
      order by u.created_at desc
      limit ${safeLimit}
    `), 1));
    return rows.map((row) => ({
      userId: String(row.user_id || ""),
      email: String(row.email || ""),
      balance: Math.max(0, Math.round(asNumber(row.balance, 0))),
      role: String(row.role || "user"),
      createdAt: row.created_at || null,
    })).filter((row) => row.userId);
  } catch {
    const rows = rowsOf<any>(await retryDb(() => db.execute(sql`
      select user_id, coalesce(email, '') as email, balance, role, created_at
      from public.credit_wallets
      where ${term === ""} or lower(coalesce(email, '')) like ${`%${term}%`}
      order by created_at desc
      limit ${safeLimit}
    `), 1));
    return rows.map((row) => ({
      userId: String(row.user_id || ""),
      email: String(row.email || ""),
      balance: Math.max(0, Math.round(asNumber(row.balance, 0))),
      role: String(row.role || "user"),
      createdAt: row.created_at || null,
    })).filter((row) => row.userId);
  }
}

export async function grantManualCredits(args: {
  admin: PanelUser;
  targetUserId: string;
  credits: number;
  note?: string | null;
}) {
  if (!isSuperAdmin(args.admin)) throw Object.assign(new Error("Acesso administrativo negado."), { status: 403 });
  await ensureBillingSchema();
  const targetUserId = String(args.targetUserId || "").trim();
  const credits = Math.round(Number(args.credits || 0));
  const note = String(args.note || "").trim().slice(0, 160);
  if (!targetUserId) throw Object.assign(new Error("Usuário inválido."), { status: 400 });
  if (!Number.isFinite(credits) || credits < 1 || credits > 100000) {
    throw Object.assign(new Error("Informe entre 1 e 100.000 créditos."), { status: 400 });
  }

  const db = getDb();
  let email = "";
  try {
    const authRows = rowsOf<any>(await retryDb(() => db.execute(sql`
      select coalesce(email, '') as email from auth.users where id::text = ${targetUserId} limit 1
    `), 1));
    email = String(authRows[0]?.email || "");
  } catch {}

  const existing = rowsOf<any>(await retryDb(() => db.execute(sql`
    select user_id, coalesce(email, '') as email, balance, role
    from public.credit_wallets where user_id = ${targetUserId} limit 1
  `), 1));
  if (!existing.length && !email) throw Object.assign(new Error("Usuário não encontrado."), { status: 404 });
  if (!email) email = String(existing[0]?.email || "");

  await retryDb(() => db.execute(sql`
    insert into public.credit_wallets
      (user_id, email, role, balance, ai_bonus_brl, ai_bonus_granted, free_ais_access, free_ai_access)
    values
      (${targetUserId}, ${email || null}, ${email.trim().toLowerCase() === SUPER_ADMIN_EMAIL ? "super_admin" : "user"}, 0, 0, true, false, false)
    on conflict (user_id) do update set
      email = coalesce(excluded.email, public.credit_wallets.email),
      free_ais_access = false,
      free_ai_access = false,
      updated_at = CURRENT_TIMESTAMP::text
  `), 1);

  const updated = rowsOf<any>(await retryDb(() => db.execute(sql`
    update public.credit_wallets
    set balance = balance + ${credits}, updated_at = CURRENT_TIMESTAMP::text
    where user_id = ${targetUserId}
    returning balance, email, role
  `), 1));
  if (!updated.length) throw new Error("Não foi possível atualizar a carteira do usuário.");

  const balance = Math.max(0, Math.round(asNumber(updated[0].balance, 0)));
  const reference = `ADMIN_CREDIT_${Date.now()}_${targetUserId.slice(0, 8)}`;
  await db.execute(sql`
    insert into public.credit_transactions
      (user_id, delta, balance_after, kind, description, amount_brl, reference, metadata_json)
    values
      (${targetUserId}, ${credits}, ${balance}, 'admin_credit', ${note ? `Crédito manual — ${note}` : "Crédito manual do administrador"}, null, ${reference}, ${JSON.stringify({ adminUserId: args.admin.id, adminEmail: args.admin.email, note: note || null })})
  `);

  return {
    ok: true,
    userId: targetUserId,
    email: String(updated[0].email || email || ""),
    role: String(updated[0].role || "user"),
    creditsAdded: credits,
    balance,
    reference,
  };
}

export async function getAdminBillingStats(user: PanelUser) {
  if (!isSuperAdmin(user)) throw Object.assign(new Error("Acesso administrativo negado."), { status: 403 });
  await ensureBillingSchema();
  const db = getDb();
  const pick = async (query: any) => rowsOf<any>(await retryDb(() => db.execute(query), 1))[0] || {};
  const [wallet, transactions, payments, ais, ai] = await Promise.all([
    pick(sql`select coalesce(sum(balance),0)::int as balance, coalesce(sum(ai_bonus_brl),0)::float8 as ai_bonus, count(*)::int as users from public.credit_wallets`),
    pick(sql`select
      coalesce(sum(case when kind = 'purchase' and delta > 0 then delta else 0 end),0)::int as sold,
      coalesce(sum(case when kind = 'admin_credit' and delta > 0 then delta else 0 end),0)::int as manual,
      coalesce(sum(case when delta < 0 then -delta else 0 end),0)::int as used
      from public.credit_transactions`),
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
    manualCreditsGranted: asNumber(transactions.manual, 0),
    creditsInWallets: asNumber(wallet.balance, 0),
    aiBonusOutstandingBrl: asNumber(wallet.ai_bonus, 0),
    users: asNumber(wallet.users, 0),
    revenue,
    ais: { queries: asNumber(ais.queries, 0), vessels: asNumber(ais.vessels, 0), credits: asNumber(ais.credits, 0), providerCalls: asNumber(ais.calls, 0), cacheHits: asNumber(ais.cache, 0), cost: aisCost },
    ai: { queries: asNumber(ai.queries, 0), basic: asNumber(ai.basic, 0), full: asNumber(ai.full, 0), advanced: asNumber(ai.advanced, 0), credits: asNumber(ai.credits, 0), tokens: asNumber(ai.tokens, 0), cost: aiCost },
    totalCost,
    grossResult: revenue - totalCost,
    estimatedMarginPct: revenue > 0 ? ((revenue - totalCost) / revenue) * 100 : null,
  };
}
