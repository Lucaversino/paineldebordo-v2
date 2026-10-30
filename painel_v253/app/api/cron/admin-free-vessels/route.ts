import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adminFreeVessels } from "../../../../db/schema";
import { ensureAdminFreeVesselsTable, refreshAdminFreeVessel } from "../../../../lib/adminFreeVessels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = getDb();
    await ensureAdminFreeVesselsTable(db);
    const rows = await db.select().from(adminFreeVessels).where(eq(adminFreeVessels.automatic, true)).limit(60);
    let updated = 0;
    let withPosition = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i += 4) {
      const batch = rows.slice(i, i + 4);
      const results = await Promise.all(batch.map((row) => refreshAdminFreeVessel(db, row)));
      updated += results.length;
      withPosition += results.filter((row) => Number.isFinite(row.lastLatitude) && Number.isFinite(row.lastLongitude)).length;
      errors += results.filter((row) => Boolean(row.lastError)).length;
    }

    return NextResponse.json({ ok: true, updated, withPosition, errors, ranAt: new Date().toISOString() });
  } catch (error) {
    console.error("admin free vessels cron failed", error);
    return NextResponse.json({ error: "Falha na atualização automática dos barcos FREE." }, { status: 503 });
  }
}
