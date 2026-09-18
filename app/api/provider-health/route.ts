import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../db";
import { isSuperAdmin } from "../../../lib/credits";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function fetchJson(url: string, init: RequestInit, timeoutMs = 6000) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export async function GET(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sessão encerrada." }, { status: 401 });
  if (!isSuperAdmin(user)) return NextResponse.json({ error: "Acesso administrativo negado." }, { status: 403 });

  const dataDockedKey = process.env.DATADOCKED_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL || "gpt-5.6-sol";

  const [dbResult, aisResult, aiResult] = await Promise.allSettled([
    Promise.race([
      getDb().execute(sql`select 1 as ok`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]),
    dataDockedKey
      ? fetchJson("https://datadocked.com/api/vessels_operations/my-credits", { headers: { accept: "application/json", "x-api-key": dataDockedKey } }, 6000)
      : Promise.reject(new Error("DATADOCKED_API_KEY ausente")),
    openAiKey
      ? fetchJson(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { authorization: `Bearer ${openAiKey}` } }, 6000)
      : Promise.reject(new Error("OPENAI_API_KEY ausente")),
  ]);

  const db = dbResult.status === "fulfilled"
    ? { ok: true }
    : { ok: false, error: dbResult.reason?.message || "Banco indisponível" };

  let ais: any;
  if (aisResult.status === "fulfilled") {
    const { response, body } = aisResult.value as any;
    const detail = body?.detail && typeof body.detail === "object" ? body.detail : body;
    ais = response.ok
      ? { ok: true, credits: Number(detail?.credits ?? body?.credits ?? 0), status: response.status }
      : { ok: false, status: response.status, error: detail?.message || body?.message || body?.error || String(body?.detail || "Data Docked recusou a chave") };
  } else {
    ais = { ok: false, error: aisResult.reason?.message || "Data Docked indisponível" };
  }

  let ai: any;
  if (aiResult.status === "fulfilled") {
    const { response, body } = aiResult.value as any;
    ai = response.ok
      ? { ok: true, model: body?.id || model, status: response.status }
      : { ok: false, model, status: response.status, error: body?.error?.message || body?.message || "OpenAI recusou a chave/modelo" };
  } else {
    ai = { ok: false, model, error: aiResult.reason?.message || "OpenAI indisponível" };
  }

  return NextResponse.json({ generatedAt: new Date().toISOString(), database: db, datadocked: ais, openai: ai });
}
