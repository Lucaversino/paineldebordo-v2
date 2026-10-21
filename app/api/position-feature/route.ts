import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";
import { getBillingSettings, isSuperAdmin } from "../../../lib/credits";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const FEATURE_KEY = "POSITION_PAGE_ENABLED";
export async function GET(req: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    await getBillingSettings();
    const rows = await getDb().execute(sql`select value from public.billing_settings where key = ${FEATURE_KEY} limit 1`);
    const value = Array.isArray(rows) ? (rows as any[])[0]?.value : undefined;
    return NextResponse.json({ enabled: value === "1", isAdmin: isSuperAdmin(user) });
  } catch (error) { return NextResponse.json({ error: "Não foi possível consultar a ativação." }, { status: 503 }); }
}
export async function PUT(req: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "Proibido" }, { status: 403 });
    const data = await req.json();
    if (typeof data.enabled !== "boolean") return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    await getBillingSettings();
    const value = data.enabled ? "1" : "0";
    await getDb().execute(sql`insert into public.billing_settings (key, value, updated_at) values (${FEATURE_KEY}, ${value}, CURRENT_TIMESTAMP::text) on conflict (key) do update set value = excluded.value, updated_at = CURRENT_TIMESTAMP::text`);
    return NextResponse.json({ enabled: data.enabled });
  } catch { return NextResponse.json({ error: "Não foi possível salvar a ativação." }, { status: 503 }); }
}
