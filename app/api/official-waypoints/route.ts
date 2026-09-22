import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { officialWaypoints } from "../../../db/schema";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";
import { isSuperAdmin } from "../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const waypointTypes = new Set(["skull", "rock", "reef", "wreck"]);
let ready = false;
let readyPromise: Promise<void> | null = null;

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function cleanType(value: unknown) {
  const type = String(value || "rock").trim().toLowerCase();
  return waypointTypes.has(type) ? type : "rock";
}

async function ensureTable(db: ReturnType<typeof getDb>) {
  if (ready) return;
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.execute(sql`
        create table if not exists public.official_waypoints (
          id serial primary key,
          name text not null,
          waypoint_type text not null,
          latitude double precision not null,
          longitude double precision not null,
          description text not null default '',
          visible boolean not null default true,
          created_by text not null,
          created_at text not null default CURRENT_TIMESTAMP::text,
          updated_at text not null default CURRENT_TIMESTAMP::text
        )
      `);
      await db.execute(sql`create index if not exists idx_official_waypoints_visible_id on public.official_waypoints(visible, id desc)`);
      await db.execute(sql`alter table public.official_waypoints enable row level security`);
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
    const includeHidden = request.nextUrl.searchParams.get("includeHidden") === "1" && isSuperAdmin(user);

    const rows = includeHidden
      ? await db.select().from(officialWaypoints).orderBy(desc(officialWaypoints.id)).limit(1000)
      : await db.select().from(officialWaypoints).where(eq(officialWaypoints.visible, true)).orderBy(desc(officialWaypoints.id)).limit(1000);

    return NextResponse.json({ waypoints: rows, canManage: isSuperAdmin(user) });
  } catch (error) {
    console.error("official waypoints GET failed", error);
    return NextResponse.json({ error: "Não foi possível carregar os waypoints oficiais." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "Somente o administrador principal pode alterar waypoints oficiais." }, { status: 403 });

    const db = getDb();
    await ensureTable(db);
    const body = await request.json().catch(() => ({}));
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return NextResponse.json({ error: "Posição inválida." }, { status: 400 });
    }

    const name = cleanText(body?.name, 80) || "Waypoint oficial";
    const waypointType = cleanType(body?.waypointType);
    const description = cleanText(body?.description, 500);
    const visible = body?.visible !== false;
    const id = Number(body?.id);
    const now = new Date().toISOString();

    if (Number.isFinite(id) && id > 0) {
      const [row] = await db.update(officialWaypoints)
        .set({ name, waypointType, latitude, longitude, description, visible, updatedAt: now })
        .where(eq(officialWaypoints.id, id))
        .returning();
      if (!row) return NextResponse.json({ error: "Waypoint oficial não encontrado." }, { status: 404 });
      return NextResponse.json({ waypoint: row });
    }

    const [row] = await db.insert(officialWaypoints)
      .values({ name, waypointType, latitude, longitude, description, visible, createdBy: user.id, createdAt: now, updatedAt: now })
      .returning();
    return NextResponse.json({ waypoint: row });
  } catch (error) {
    console.error("official waypoints POST failed", error);
    return NextResponse.json({ error: "Não foi possível salvar o waypoint oficial." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "Somente o administrador principal pode apagar waypoints oficiais." }, { status: 403 });

    const db = getDb();
    await ensureTable(db);
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Waypoint inválido." }, { status: 400 });

    const [deleted] = await db.delete(officialWaypoints).where(eq(officialWaypoints.id, id)).returning({ id: officialWaypoints.id });
    if (!deleted) return NextResponse.json({ error: "Waypoint oficial não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("official waypoints DELETE failed", error);
    return NextResponse.json({ error: "Não foi possível apagar o waypoint oficial." }, { status: 503 });
  }
}
