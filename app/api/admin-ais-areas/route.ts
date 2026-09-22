import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { isSuperAdmin } from "../../../lib/credits";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";
import {
  ADMIN_AREA_RADIUS_NM,
  adminAreaRow,
  cleanLatitude,
  cleanLongitude,
  createAdminRegionalArea,
  ensureAisRegionalAreaTables,
  refreshAdminRegionalArea,
} from "../../../lib/aisRegionalAreas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function rowsOf(result: any): any[] { return Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : []; }
function cleanName(value: unknown) { return String(value || "").trim().slice(0, 80) || "Área AIS administrativa"; }

export async function GET(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureAisRegionalAreaTables();
  const canManage = isSuperAdmin(user);
  const db = getDb();
  const result = await db.execute(canManage
    ? sql`select * from public.ais_admin_regional_areas order by id desc limit 100`
    : sql`select * from public.ais_admin_regional_areas where visible = true order by id desc limit 100`);
  return NextResponse.json({ areas: rowsOf(result).map(adminAreaRow), canManage, radiusNm: ADMIN_AREA_RADIUS_NM });
}

export async function POST(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user)) return NextResponse.json({ error: "Somente o administrador principal pode alterar áreas AIS administrativas." }, { status: 403 });
  await ensureAisRegionalAreaTables();
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "create");
  const db = getDb();

  if (action === "create") {
    const latitude = cleanLatitude(body?.latitude);
    const longitude = cleanLongitude(body?.longitude);
    if (latitude == null || longitude == null) return NextResponse.json({ error: "Latitude/longitude inválidas." }, { status: 400 });
    const area = await createAdminRegionalArea({ name: cleanName(body?.name), latitude, longitude, createdBy: user.id });
    return NextResponse.json({ area, radiusNm: ADMIN_AREA_RADIUS_NM });
  }

  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Área administrativa inválida." }, { status: 400 });
  const lookup = await db.execute(sql`select * from public.ais_admin_regional_areas where id = ${id} limit 1`);
  const row = rowsOf(lookup)[0];
  if (!row) return NextResponse.json({ error: "Área administrativa não encontrada." }, { status: 404 });

  if (action === "refresh") {
    const refreshed = await refreshAdminRegionalArea(row);
    return NextResponse.json(refreshed);
  }

  if (action === "settings") {
    const autoUpdate = body?.autoUpdate !== false;
    const visible = body?.visible !== false;
    const name = cleanName(body?.name || row.name);
    const now = new Date().toISOString();
    const result = await db.execute(sql`
      update public.ais_admin_regional_areas
      set name = ${name}, auto_update = ${autoUpdate}, visible = ${visible}, updated_at = ${now}
      where id = ${id}
      returning *
    `);
    return NextResponse.json({ area: adminAreaRow(rowsOf(result)[0]) });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user)) return NextResponse.json({ error: "Somente o administrador principal pode excluir áreas AIS administrativas." }, { status: 403 });
  await ensureAisRegionalAreaTables();
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Área inválida." }, { status: 400 });
  const db = getDb();
  await db.execute(sql`delete from public.ais_admin_regional_areas where id = ${id}`);
  return NextResponse.json({ ok: true });
}
