import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { aisSavedVessels, aisSearchHistory } from "../../../db/schema";
import { getPanelUser } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function vesselKey(input: any) {
  const imo = text(input?.imo).replace(/\D/g, "");
  const mmsi = text(input?.mmsi).replace(/\D/g, "");
  if (imo && imo !== "0") return `imo:${imo}`;
  if (mmsi) return `mmsi:${mmsi}`;
  return "";
}

async function ensureTables(db: ReturnType<typeof getDb>) {
  await db.execute(sql`
    create table if not exists public.ais_saved_vessels (
      id serial primary key,
      owner_id text not null,
      vessel_key text not null,
      name text not null,
      mmsi text,
      imo text,
      country text,
      vessel_type text,
      callsign text,
      last_latitude double precision,
      last_longitude double precision,
      last_sog double precision,
      last_cog double precision,
      last_heading double precision,
      last_destination text,
      last_status text,
      last_data_source text,
      last_position_received text,
      last_update_time text,
      saved_at text not null default CURRENT_TIMESTAMP::text,
      updated_at text not null default CURRENT_TIMESTAMP::text,
      unique(owner_id, vessel_key)
    )
  `);
  await db.execute(sql`create index if not exists idx_ais_saved_owner_updated on public.ais_saved_vessels(owner_id, updated_at)`);
  await db.execute(sql`
    create table if not exists public.ais_search_history (
      id serial primary key,
      owner_id text not null,
      vessel_key text not null,
      name text not null,
      mmsi text,
      imo text,
      latitude double precision not null,
      longitude double precision not null,
      sog double precision,
      cog double precision,
      heading double precision,
      destination text,
      nav_status text,
      data_source text,
      position_received text,
      update_time text,
      queried_at text not null default CURRENT_TIMESTAMP::text
    )
  `);
  await db.execute(sql`create index if not exists idx_ais_history_owner_time on public.ais_search_history(owner_id, queried_at)`);
  await db.execute(sql`create index if not exists idx_ais_history_owner_vessel on public.ais_search_history(owner_id, vessel_key)`);
  await db.execute(sql`alter table public.ais_saved_vessels enable row level security`);
  await db.execute(sql`alter table public.ais_search_history enable row level security`);
}

export async function GET() {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  await ensureTables(db);

  const [saved, history] = await Promise.all([
    db.select().from(aisSavedVessels)
      .where(eq(aisSavedVessels.ownerId, user.id))
      .orderBy(desc(aisSavedVessels.updatedAt))
      .limit(100),
    db.select().from(aisSearchHistory)
      .where(eq(aisSearchHistory.ownerId, user.id))
      .orderBy(desc(aisSearchHistory.id))
      .limit(100),
  ]);

  return NextResponse.json({ saved, history });
}

export async function POST(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  await ensureTables(db);
  const body = await request.json().catch(() => ({}));
  const action = text(body?.action);

  if (action === "save") {
    const source = body?.vessel || body?.match || {};
    const key = vesselKey(source);
    if (!key) return NextResponse.json({ error: "Embarcação sem IMO/MMSI válido." }, { status: 400 });
    const now = new Date().toISOString();
    const values = {
      ownerId: user.id,
      vesselKey: key,
      name: text(source?.name) || text(source?.mmsi) || "Embarcação",
      mmsi: text(source?.mmsi) || null,
      imo: text(source?.imo) || null,
      country: text(source?.country) || null,
      vesselType: text(source?.vesselType || source?.typeSpecific || source?.shipType) || null,
      callsign: text(source?.callsign) || null,
      lastLatitude: numberOrNull(source?.lat),
      lastLongitude: numberOrNull(source?.lon),
      lastSog: numberOrNull(source?.sog),
      lastCog: numberOrNull(source?.cog),
      lastHeading: numberOrNull(source?.heading),
      lastDestination: text(source?.destination) || null,
      lastStatus: text(source?.navStatusText) || null,
      lastDataSource: text(source?.dataSource) || null,
      lastPositionReceived: text(source?.positionReceived) || null,
      lastUpdateTime: text(source?.updateTime) || null,
      updatedAt: now,
    };

    const [existing] = await db.select({ id: aisSavedVessels.id }).from(aisSavedVessels)
      .where(and(eq(aisSavedVessels.ownerId, user.id), eq(aisSavedVessels.vesselKey, key))).limit(1);
    let row;
    if (existing) {
      [row] = await db.update(aisSavedVessels).set(values)
        .where(and(eq(aisSavedVessels.id, existing.id), eq(aisSavedVessels.ownerId, user.id))).returning();
    } else {
      [row] = await db.insert(aisSavedVessels).values({ ...values, savedAt: now }).returning();
    }
    return NextResponse.json({ saved: row });
  }

  if (action === "history") {
    const vessel = body?.vessel || {};
    const key = vesselKey(vessel);
    const lat = numberOrNull(vessel?.lat);
    const lon = numberOrNull(vessel?.lon);
    if (!key || lat == null || lon == null) {
      return NextResponse.json({ error: "Dados AIS insuficientes para o histórico." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const [row] = await db.insert(aisSearchHistory).values({
      ownerId: user.id,
      vesselKey: key,
      name: text(vessel?.name) || text(vessel?.mmsi) || "Embarcação",
      mmsi: text(vessel?.mmsi) || null,
      imo: text(vessel?.imo) || null,
      latitude: lat,
      longitude: lon,
      sog: numberOrNull(vessel?.sog),
      cog: numberOrNull(vessel?.cog),
      heading: numberOrNull(vessel?.heading),
      destination: text(vessel?.destination) || null,
      navStatus: text(vessel?.navStatusText) || null,
      dataSource: text(vessel?.dataSource) || null,
      positionReceived: text(vessel?.positionReceived) || null,
      updateTime: text(vessel?.updateTime) || null,
      queriedAt: now,
    }).returning();

    // Se o barco já estiver salvo, atualiza automaticamente a última posição conhecida.
    await db.update(aisSavedVessels).set({
      lastLatitude: lat,
      lastLongitude: lon,
      lastSog: numberOrNull(vessel?.sog),
      lastCog: numberOrNull(vessel?.cog),
      lastHeading: numberOrNull(vessel?.heading),
      lastDestination: text(vessel?.destination) || null,
      lastStatus: text(vessel?.navStatusText) || null,
      lastDataSource: text(vessel?.dataSource) || null,
      lastPositionReceived: text(vessel?.positionReceived) || null,
      lastUpdateTime: text(vessel?.updateTime) || null,
      updatedAt: now,
    }).where(and(eq(aisSavedVessels.ownerId, user.id), eq(aisSavedVessels.vesselKey, key)));

    // Mantém no máximo os 100 registros mais recentes por conta.
    await db.execute(sql`
      delete from public.ais_search_history
      where owner_id = ${user.id}
        and id not in (
          select id from public.ais_search_history
          where owner_id = ${user.id}
          order by id desc
          limit 100
        )
    `);

    return NextResponse.json({ history: row });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  await ensureTables(db);
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "history";

  if (type === "history") {
    await db.delete(aisSearchHistory).where(eq(aisSearchHistory.ownerId, user.id));
    return NextResponse.json({ ok: true });
  }

  if (type === "saved") {
    const key = searchParams.get("key") || "";
    if (!key) return NextResponse.json({ error: "Barco não informado." }, { status: 400 });
    await db.delete(aisSavedVessels).where(and(eq(aisSavedVessels.ownerId, user.id), eq(aisSavedVessels.vesselKey, key)));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
}
