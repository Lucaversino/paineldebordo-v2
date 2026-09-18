import { NextRequest, NextResponse } from "next/server";
import { getPanelUserFromRequest } from "../../../../../lib/panelAuth";
import { getAdminBillingStats, grantManualCredits, isSuperAdmin } from "../../../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} demorou mais que ${Math.round(ms / 1000)}s.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await withTimeout(getPanelUserFromRequest(request), 8_000, "Autenticação");
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const result = await withTimeout(grantManualCredits({
      admin,
      targetUserId: String(body?.userId || ""),
      credits: Number(body?.credits || 0),
      note: body?.note == null ? null : String(body.note),
    }), 12_000, "Crédito manual");

    let stats = null;
    try {
      stats = await withTimeout(getAdminBillingStats(admin), 6_000, "Atualização dos indicadores");
    } catch (error) {
      console.warn("manual credits stats refresh skipped", error);
    }

    return NextResponse.json({ ...result, stats });
  } catch (error: any) {
    console.error("manual credits failed", error);
    return NextResponse.json(
      { error: error?.message || "Não foi possível adicionar os créditos." },
      { status: Number(error?.status) || 503 },
    );
  }
}
