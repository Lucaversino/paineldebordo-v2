import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { officialAreas } from "../../../db/schema";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";
import { isSuperAdmin } from "../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AreaColor = "green" | "yellow" | "red";
type AreaPoint = { latitude: number; longitude: number };

const colors = new Set<AreaColor>(["green", "yellow", "red"]);
let ready = false;
let readyPromise: Promise<void> | null = null;

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function cleanColor(value: unknown): AreaColor {
  const color = String(value || "green").trim().toLowerCase() as AreaColor;
  return colors.has(color) ? color : "green";
}

function cleanTransparency(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 55;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function cleanPoints(value: unknown): AreaPoint[] {
  if (!Array.isArray(value)) return [];
  const points = value.slice(0, 120).map((point: any) => ({
    latitude: Number(point?.latitude),
    longitude: Number(point?.longitude),
  })).filter((point) =>
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
  );
  return points;
}

function rowToArea(row: any) {
  let points: AreaPoint[] = [];
  try { points = cleanPoints(JSON.parse(row.pointsJson || "[]")); } catch {}
  return {
    id: row.id,
    name: row.name,
    color: cleanColor(row.color),
    transparency: cleanTransparency(row.transparency),
    points,
    description: row.description || "",
    visible: row.visible !== false,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function ensureTable(db: ReturnType<typeof getDb>) {
  if (ready) return;
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.execute(sql`
        create table if not exists public.official_areas (
          id serial primary key,
          name text not null,
          color text not null default 'green',
          transparency integer not null default 55,
          points_json text not null,
          description text not null default '',
          visible boolean not null default true,
          created_by text not null,
          created_at text not null default CURRENT_TIMESTAMP::text,
          updated_at text not null default CURRENT_TIMESTAMP::text
        )
      `);
      await db.execute(sql`create index if not exists idx_official_areas_visible_id on public.official_areas(visible, id desc)`);
      await db.execute(sql`alter table public.official_areas enable row level security`);
      ready = true;
    })().catch((error) => {
      ready = false;
      readyPromise = null;
      throw error;
    });
  }
  await readyPromise;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const db = getDb();
    await ensureTable(db);
    const canManage = isSuperAdmin(user);
    const includeHidden = request.nextUrl.searchParams.get("includeHidden") === "1" && canManage;
    const rows = includeHidden
      ? await db.select().from(officialAreas).orderBy(desc(officialAreas.id)).limit(500)
      : await db.select().from(officialAreas).where(eq(officialAreas.visible, true)).orderBy(desc(officialAreas.id)).limit(500);
    return NextResponse.json({ areas: rows.map(rowToArea), canManage });
  } catch (error) {
    console.error("official areas GET failed", error);
    return NextResponse.json({ error: "Não foi possível carregar as áreas oficiais." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "Somente o administrador principal pode alterar áreas oficiais." }, { status: 403 });

    const db = getDb();
    await ensureTable(db);
    const body = await request.json().catch(() => ({}));
    const name = cleanText(body?.name, 80) || "Área oficial";
    const color = cleanColor(body?.color);
    const transparency = cleanTransparency(body?.transparency);
    const description = cleanText(body?.description, 500);
    const visible = body?.visible !== false;
    const points = cleanPoints(body?.points);
    const id = Number(body?.id);
    const now = new Date().toISOString();

    if (points.length < 3) return NextResponse.json({ error: "A área precisa de pelo menos 3 pontos." }, { status: 400 });
    const pointsJson = JSON.stringify(points);

    if (Number.isFinite(id) && id > 0) {
      const [row] = await db.update(officialAreas)
        .set({ name, color, transparency, pointsJson, description, visible, updatedAt: now })
        .where(eq(officialAreas.id, id)).returning();
      if (!row) return NextResponse.json({ error: "Área oficial não encontrada." }, { status: 404 });
      return NextResponse.json({ area: rowToArea(row) });
    }

    const [row] = await db.insert(officialAreas).values({
      name, color, transparency, pointsJson, description, visible,
      createdBy: user.id, createdAt: now, updatedAt: now,
    }).returning();
    return NextResponse.json({ area: rowToArea(row) });
  } catch (error) {
    console.error("official areas POST failed", error);
    return NextResponse.json({ error: "Não foi possível salvar a área oficial." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "Somente o administrador principal pode apagar áreas oficiais." }, { status: 403 });
    const db = getDb();
    await ensureTable(db);
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Área inválida." }, { status: 400 });
    const [deleted] = await db.delete(officialAreas).where(eq(officialAreas.id, id)).returning({ id: officialAreas.id });
    if (!deleted) return NextResponse.json({ error: "Área oficial não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("official areas DELETE failed", error);
    return NextResponse.json({ error: "Não foi possível apagar a área oficial." }, { status: 503 });
  }
}
