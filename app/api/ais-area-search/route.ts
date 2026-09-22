import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";
import {
  USER_AREA_RADIUS_NM,
  adminAreaRow,
  cleanLatitude,
  cleanLongitude,
  ensureAisRegionalAreaTables,
  loadLiveVesselsInRadius,
  regionalSearchRow,
  saveUserAreaSearch,
} from "../../../lib/aisRegionalAreas";
import { logAisUsage } from "../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function rowsOf(result: any): any[] { return Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : []; }

export async function GET(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 });
  await ensureAisRegionalAreaTables();
  const db = getDb();
  const [searchesResult, adminResult] = await Promise.all([
    db.execute(sql`select * from public.ais_area_searches where owner_id = ${user.id} order by id desc limit 30`),
    db.execute(sql`select * from public.ais_admin_regional_areas where visible = true order by id desc limit 100`),
  ]);
  return NextResponse.json({
    searches: rowsOf(searchesResult).map(regionalSearchRow),
    adminAreas: rowsOf(adminResult).map(adminAreaRow),
    userRadiusNm: USER_AREA_RADIUS_NM,
  });
}

export async function POST(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 });
  await ensureAisRegionalAreaTables();
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "search");

  if (action === "search") {
    const latitude = cleanLatitude(body?.latitude);
    const longitude = cleanLongitude(body?.longitude);
    if (latitude == null || longitude == null) return NextResponse.json({ error: "Posição inválida para a busca de 30 MN." }, { status: 400 });
    const vessels = await loadLiveVesselsInRadius(latitude, longitude, USER_AREA_RADIUS_NM, 350);
    const savedSearch = await saveUserAreaSearch({
      ownerId: user.id,
      mode: "free",
      latitude,
      longitude,
      radiusNm: USER_AREA_RADIUS_NM,
      creditsUsed: 0,
      source: "AISStream · FREE 30 MN",
      vessels,
    });
    void logAisUsage({
      userId: user.id,
      action: "area_30nm_free",
      vesselName: null,
      providerCalls: 0,
      creditsCharged: 0,
      estimatedApiCostBrl: 0,
      status: vessels.length ? "success" : "not_found",
    }).catch(() => null);
    return NextResponse.json({
      free: true,
      provider: "AISStream · FREE",
      radiusNm: USER_AREA_RADIUS_NM,
      radiusKm: USER_AREA_RADIUS_NM * 1.852,
      vessels,
      total: vessels.length,
      creditCost: 0,
      savedSearch,
    });
  }

  if (action === "delete-search") {
    const id = Number(body?.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Busca inválida." }, { status: 400 });
    const db = getDb();
    await db.execute(sql`delete from public.ais_area_searches where id = ${id} and owner_id = ${user.id}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
