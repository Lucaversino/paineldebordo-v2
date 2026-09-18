import { NextRequest, NextResponse } from "next/server";
import { getPanelUserFromRequest } from "../../../../../lib/panelAuth";
import { getAdminOpenAiLocalReport, isSuperAdmin } from "../../../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function numberOf(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function utcDayStart(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
}

function utcMonthStart(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
}

async function openAiGet(path: string, adminKey: string) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${adminKey}`,
    "content-type": "application/json",
  };
  const orgId = process.env.OPENAI_ORG_ID?.trim();
  if (orgId) headers["OpenAI-Organization"] = orgId;

  const response = await fetch(`https://api.openai.com/v1${path}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || `OpenAI respondeu HTTP ${response.status}`;
    throw Object.assign(new Error(detail), { status: response.status });
  }
  return data;
}

function sumCosts(buckets: any[], since: number) {
  let total = 0;
  for (const bucket of buckets) {
    if (numberOf(bucket?.start_time) < since) continue;
    for (const item of Array.isArray(bucket?.results) ? bucket.results : []) {
      total += numberOf(item?.amount?.value);
    }
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const local = await getAdminOpenAiLocalReport(user);
    const adminKey = process.env.OPENAI_ADMIN_KEY?.trim();

    if (!adminKey) {
      return NextResponse.json({
        local,
        live: {
          configured: false,
          ok: false,
          error: "OPENAI_ADMIN_KEY não configurada. O relatório local continua funcionando, mas custos oficiais e limite mensal precisam de uma Admin API Key da OpenAI.",
        },
        prepaidBalance: {
          availableByApi: false,
          message: "O saldo pré-pago/créditos concedidos é consultado na página Billing da organização OpenAI. A API oficial de Usage/Costs não retorna esse saldo.",
        },
      });
    }

    const now = new Date();
    const todayStart = utcDayStart(now);
    const monthStart = utcMonthStart(now);
    const sevenDaysStart = todayStart - (6 * 86400);
    const thirtyDaysStart = todayStart - (29 * 86400);
    const lookbackStart = Math.min(monthStart, thirtyDaysStart);

    let costs: any = null;
    let usage: any = null;
    let spendLimit: any = null;
    let liveError = "";

    const [costResult, usageResult, limitResult] = await Promise.allSettled([
      openAiGet(`/organization/costs?start_time=${lookbackStart}&end_time=${Math.floor(Date.now() / 1000) + 60}&bucket_width=1d&limit=40&group_by=line_item`, adminKey),
      openAiGet(`/organization/usage/completions?start_time=${lookbackStart}&end_time=${Math.floor(Date.now() / 1000) + 60}&bucket_width=1d&limit=40&group_by=model`, adminKey),
      openAiGet("/organization/spend_limit", adminKey),
    ]);

    if (costResult.status === "fulfilled") costs = costResult.value;
    else liveError += `Custos: ${messageOf(costResult.reason, "falha")}. `;

    if (usageResult.status === "fulfilled") usage = usageResult.value;
    else liveError += `Uso: ${messageOf(usageResult.reason, "falha")}. `;

    if (limitResult.status === "fulfilled") spendLimit = limitResult.value;
    else liveError += `Limite: ${messageOf(limitResult.reason, "não configurado ou indisponível")}. `;

    const costBuckets = Array.isArray(costs?.data) ? costs.data : [];
    const usageBuckets = Array.isArray(usage?.data) ? usage.data : [];

    const todayCostUsd = sumCosts(costBuckets, todayStart);
    const weekCostUsd = sumCosts(costBuckets, sevenDaysStart);
    const monthCostUsd = sumCosts(costBuckets, monthStart);
    const thirtyDayCostUsd = sumCosts(costBuckets, thirtyDaysStart);

    const lineItems = new Map<string, number>();
    for (const bucket of costBuckets) {
      if (numberOf(bucket?.start_time) < monthStart) continue;
      for (const item of Array.isArray(bucket?.results) ? bucket.results : []) {
        const key = String(item?.line_item || "Outros");
        lineItems.set(key, (lineItems.get(key) || 0) + numberOf(item?.amount?.value));
      }
    }

    let todayRequests = 0;
    let todayInputTokens = 0;
    let todayOutputTokens = 0;
    let monthRequests = 0;
    let monthInputTokens = 0;
    let monthOutputTokens = 0;
    const modelMap = new Map<string, { requests: number; inputTokens: number; outputTokens: number }>();

    for (const bucket of usageBuckets) {
      const bucketStart = numberOf(bucket?.start_time);
      for (const item of Array.isArray(bucket?.results) ? bucket.results : []) {
        const requests = numberOf(item?.num_model_requests);
        const inputTokens = numberOf(item?.input_tokens);
        const outputTokens = numberOf(item?.output_tokens);
        const model = String(item?.model || "não informado");

        if (bucketStart >= todayStart) {
          todayRequests += requests;
          todayInputTokens += inputTokens;
          todayOutputTokens += outputTokens;
        }
        if (bucketStart >= monthStart) {
          monthRequests += requests;
          monthInputTokens += inputTokens;
          monthOutputTokens += outputTokens;
          const current = modelMap.get(model) || { requests: 0, inputTokens: 0, outputTokens: 0 };
          current.requests += requests;
          current.inputTokens += inputTokens;
          current.outputTokens += outputTokens;
          modelMap.set(model, current);
        }
      }
    }

    const rawThreshold = spendLimit?.threshold_amount;
    const spendLimitUsd = rawThreshold == null ? null : numberOf(rawThreshold) / 100;
    const remainingToLimitUsd = spendLimitUsd == null ? null : Math.max(0, spendLimitUsd - monthCostUsd);

    return NextResponse.json({
      local,
      live: {
        configured: true,
        ok: Boolean(costs || usage || spendLimit),
        error: liveError.trim() || null,
        timezone: "UTC",
        todayCostUsd,
        weekCostUsd,
        monthCostUsd,
        thirtyDayCostUsd,
        todayRequests,
        todayInputTokens,
        todayOutputTokens,
        todayTokens: todayInputTokens + todayOutputTokens,
        monthRequests,
        monthInputTokens,
        monthOutputTokens,
        monthTokens: monthInputTokens + monthOutputTokens,
        spendLimitUsd,
        remainingToLimitUsd,
        spendLimitCurrency: String(spendLimit?.currency || "USD"),
        spendLimitInterval: String(spendLimit?.interval || "month"),
        spendLimitEnforcement: spendLimit?.enforcement ?? null,
        lineItems: Array.from(lineItems.entries())
          .map(([name, costUsd]) => ({ name, costUsd: Math.round(costUsd * 1_000_000) / 1_000_000 }))
          .sort((a, b) => b.costUsd - a.costUsd),
        models: Array.from(modelMap.entries())
          .map(([model, value]) => ({ model, ...value, totalTokens: value.inputTokens + value.outputTokens }))
          .sort((a, b) => b.totalTokens - a.totalTokens),
        fetchedAt: new Date().toISOString(),
      },
      prepaidBalance: {
        availableByApi: false,
        message: "O saldo pré-pago/créditos concedidos é consultado na página Billing da organização OpenAI. O painel mostra o gasto oficial e, quando existe limite mensal, quanto ainda falta até esse limite.",
      },
    });
  } catch (error: any) {
    console.error("OpenAI admin report failed", error);
    return NextResponse.json(
      { error: error?.message || "Não foi possível carregar o relatório OpenAI." },
      { status: Number(error?.status) || 503 },
    );
  }
}
