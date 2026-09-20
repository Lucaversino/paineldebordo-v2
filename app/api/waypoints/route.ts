import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { mapWaypoints } from "../../../db/schema";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const icons = new Set(["circle", "diamond", "triangle", "cross", "star"]);

function cleanName(value: unknown) {
  return String(value || "").trim().slice(0, 40);
}

function cleanIcon(value: unknown) {
  const icon = String(value || "diamond");
  return icons.has(icon) ? icon : "diamond";
}

function cleanColor(value: unknown) {
  const color = String(value || "#ffb52e").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffb52e";
}

let ready = false;
let readyPromise: Promise<void> | null = null;

async function ensureTable(db: ReturnType<typeof getDb>) {
  if (ready) return;
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.execute(sql`
        create table if not exists public.map_waypoints (
          id serial primary key,
          owner_id text not null,
          name text not null,
          latitude double precision not null,
          longitude double precision not null,
          icon text not null default 'diamond',
          color text not null default '#ffb52e',
          created_at text not null default CURRENT_TIMESTAMP::text,
          updated_at text not null default CURRENT_TIMESTAMP::text
        )
      `);
      await db.execute(sql`create index if not exists idx_map_waypoints_owner_time on public.map_waypoints(owner_id, id)`);
      await db.execute(sql`alter table public.map_waypoints enable row level security`);
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
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  await ensureTable(db);
  const rows = await db.select().from(mapWaypoints)
    .where(eq(mapWaypoints.ownerId, user.id))
    .orderBy(desc(mapWaypoints.id))
    .limit(200);
  return NextResponse.json({ waypoints: rows });
}

export async function POST(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  await ensureTable(db);
  const body = await request.json().catch(() => ({}));
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: "Posição inválida." }, { status: 400 });
  }

  const id = Number(body?.id);
  const now = new Date().toISOString();
  const values = {
    name: cleanName(body?.name) || "Waypoint",
    latitude,
    longitude,
    icon: cleanIcon(body?.icon),
    color: cleanColor(body?.color),
    updatedAt: now,
  };

  if (Number.isFinite(id) && id > 0) {
    const [row] = await db.update(mapWaypoints)
      .set(values)
      .where(and(eq(mapWaypoints.ownerId, user.id), eq(mapWaypoints.id, id)))
      .returning();
    if (!row) return NextResponse.json({ error: "Waypoint não encontrado." }, { status: 404 });
    return NextResponse.json({ waypoint: row });
  }

  const [row] = await db.insert(mapWaypoints)
    .values({ ownerId: user.id, ...values, createdAt: now })
    .returning();
  return NextResponse.json({ waypoint: row });
}

export async function DELETE(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  await ensureTable(db);
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Waypoint inválido." }, { status: 400 });
  await db.delete(mapWaypoints).where(and(eq(mapWaypoints.ownerId, user.id), eq(mapWaypoints.id, id)));
  return NextResponse.json({ ok: true });
}
