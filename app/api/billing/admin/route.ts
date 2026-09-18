import { NextRequest, NextResponse } from "next/server";
import { getPanelUserFromRequest } from "../../../../lib/panelAuth";
import {
  getAdminBillingStats,
  getBillingSettings,
  isSuperAdmin,
  listAdminCreditUsers,
  updateBillingSettings,
} from "../../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const search = new URL(request.url).searchParams.get("search") || "";
  const [settings, stats, users] = await Promise.all([
    getBillingSettings(),
    getAdminBillingStats(user),
    listAdminCreditUsers(user, search),
  ]);
  return NextResponse.json({ settings, stats, users });
}

export async function PUT(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    const settings = await updateBillingSettings(user, body?.settings || {});
    const [stats, users] = await Promise.all([
      getAdminBillingStats(user),
      listAdminCreditUsers(user),
    ]);
    return NextResponse.json({ ok: true, settings, stats, users });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Não foi possível salvar as configurações." }, { status: Number(error?.status) || 400 });
  }
}
