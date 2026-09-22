import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureAisRegionalAreaTables, refreshAdminRegionalArea } from "../../../../lib/aisRegionalAreas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function rowsOf(result: any): any[] { return Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : []; }

export async function GET(request: NextRequest) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!secret && request.headers.get("x-vercel-cron") !== "1" && !/vercel-cron/i.test(request.headers.get("user-agent") || "")) {
    return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  }

  await ensureAisRegionalAreaTables();
  const db = getDb();
  const result = await db.execute(sql`
    select * from public.ais_admin_regional_areas
    where auto_update = true
      and visible = true
      and (last_attempt_at is null or last_attempt_at::timestamptz <= now() - interval '20 hours')
    order by id asc
    limit 40
  `);
  const rows = rowsOf(result);
  const updates: any[] = [];
  for (const row of rows) {
    try {
      const refreshed = await refreshAdminRegionalArea(row);
      updates.push({ id: Number(row.id), ok: true, vesselCount: refreshed.area?.vesselCount || 0, preserved: refreshed.preserved });
    } catch (error) {
      updates.push({ id: Number(row.id), ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return NextResponse.json({ ok: true, checked: rows.length, updates, ranAt: new Date().toISOString() });
}
