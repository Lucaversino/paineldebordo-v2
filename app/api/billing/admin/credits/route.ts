import { NextRequest, NextResponse } from "next/server";
import { getPanelUserFromRequest } from "../../../../../lib/panelAuth";
import { getAdminBillingStats, grantManualCredits, isSuperAdmin, listAdminCreditUsers } from "../../../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const admin = await getPanelUserFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  try {
    const result = await grantManualCredits({
      admin,
      targetUserId: String(body?.userId || ""),
      credits: Number(body?.credits || 0),
      note: body?.note == null ? null : String(body.note),
    });
    const [stats, users] = await Promise.all([
      getAdminBillingStats(admin),
      listAdminCreditUsers(admin),
    ]);
    return NextResponse.json({ ...result, stats, users });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Não foi possível adicionar os créditos." }, { status: Number(error?.status) || 400 });
  }
}
