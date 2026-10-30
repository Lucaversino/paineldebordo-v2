import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { forecastHistory, savedForecasts } from "../../../db/schema";
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

function parsePayload(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function ensureTables(db: ReturnType<typeof getDb>) {
  await db.execute(sql`
    create table if not exists public.forecast_history (
      id serial primary key,
      owner_id text not null,
      title text,
      latitude double precision not null,
      longitude double precision not null,
      latitude_raw text,
      longitude_raw text,
      position_label text,
      payload_json text not null,
      source text,
      created_at text not null default CURRENT_TIMESTAMP::text
    )
  `);
  await db.execute(sql`create index if not exists idx_forecast_history_owner_time on public.forecast_history(owner_id, id desc)`);
  await db.execute(sql`
    create table if not exists public.saved_forecasts (
      id serial primary key,
      owner_id text not null,
      title text not null,
      latitude double precision not null,
      longitude double precision not null,
      latitude_raw text,
      longitude_raw text,
      position_label text,
      payload_json text not null,
      source text,
      created_at text not null default CURRENT_TIMESTAMP::text,
      updated_at text not null default CURRENT_TIMESTAMP::text
    )
  `);
  await db.execute(sql`create index if not exists idx_saved_forecasts_owner_time on public.saved_forecasts(owner_id, id desc)`);
  await db.execute(sql`alter table public.forecast_history enable row level security`);
  await db.execute(sql`alter table public.saved_forecasts enable row level security`);
}

function shapeRow(row: any) {
  return {
    ...row,
    payload: parsePayload(row.payloadJson),
    payloadJson: undefined,
  };
}

export async function GET() {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  await ensureTables(db);

  const [saved, history] = await Promise.all([
    db.select().from(savedForecasts)
      .where(eq(savedForecasts.ownerId, user.id))
      .orderBy(desc(savedForecasts.id))
      .limit(100),
    db.select().from(forecastHistory)
      .where(eq(forecastHistory.ownerId, user.id))
      .orderBy(desc(forecastHistory.id))
      .limit(20),
  ]);

  return NextResponse.json({
    saved: saved.map(shapeRow),
    history: history.map(shapeRow),
  });
}

export async function POST(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  await ensureTables(db);
  const body = await request.json().catch(() => ({}));
  const action = text(body?.action);
  const payload = body?.payload;
  const lat = numberOrNull(body?.latitude ?? payload?.position?.lat);
  const lon = numberOrNull(body?.longitude ?? payload?.position?.lon);

  if ((action === "history" || action === "save") && (lat == null || lon == null || !payload)) {
    return NextResponse.json({ error: "Previsão incompleta para salvar." }, { status: 400 });
  }

  const common = {
    ownerId: user.id,
    latitude: lat!,
    longitude: lon!,
    latitudeRaw: text(body?.latitudeRaw) || null,
    longitudeRaw: text(body?.longitudeRaw) || null,
    positionLabel: text(body?.positionLabel) || null,
    payloadJson: JSON.stringify(payload),
    source: text(body?.source) || "position-forecast",
  };

  if (action === "history") {
    const [row] = await db.insert(forecastHistory).values({
      ...common,
      title: text(body?.title) || null,
      createdAt: new Date().toISOString(),
    }).returning();

    await db.execute(sql`
      delete from public.forecast_history
      where owner_id = ${user.id}
        and id not in (
          select id from public.forecast_history
          where owner_id = ${user.id}
          order by id desc
          limit 20
        )
    `);

    return NextResponse.json({ history: shapeRow(row) });
  }

  if (action === "save") {
    const title = text(body?.title);
    if (!title) return NextResponse.json({ error: "Informe um nome para a previsão." }, { status: 400 });
    const now = new Date().toISOString();
    const [row] = await db.insert(savedForecasts).values({
      ...common,
      title,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return NextResponse.json({ saved: shapeRow(row) });
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
  const id = Number(searchParams.get("id"));

  if (type === "history") {
    if (Number.isFinite(id) && id > 0) {
      await db.delete(forecastHistory).where(and(eq(forecastHistory.ownerId, user.id), eq(forecastHistory.id, id)));
    } else {
      await db.delete(forecastHistory).where(eq(forecastHistory.ownerId, user.id));
    }
    return NextResponse.json({ ok: true });
  }

  if (type === "saved") {
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Previsão não informada." }, { status: 400 });
    await db.delete(savedForecasts).where(and(eq(savedForecasts.ownerId, user.id), eq(savedForecasts.id, id)));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
}
