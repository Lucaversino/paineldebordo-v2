import { NextRequest, NextResponse } from "next/server";
import { getPanelUser } from "../../../../lib/panelAuth";
import { getAdminBillingStats, getBillingSettings, isSuperAdmin, updateBillingSettings } from "../../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [settings, stats] = await Promise.all([getBillingSettings(), getAdminBillingStats(user)]);
  return NextResponse.json({ settings, stats });
}

export async function PUT(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    const settings = await updateBillingSettings(user, body?.settings || {});
    const stats = await getAdminBillingStats(user);
    return NextResponse.json({ ok: true, settings, stats });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Não foi possível salvar as configurações." }, { status: Number(error?.status) || 400 });
  }
}
