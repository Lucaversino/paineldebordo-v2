import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { getPanelUser } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  const user = await getPanelUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = getDb();
    const result = await db.execute(sql`
      select
        service, connected, subscribed, last_message_at, last_persist_at,
        vessel_count, reconnect_attempt, last_error, started_at, updated_at
      from public.ais_live_worker_status
      where service = 'aisstream-worker'
      limit 1
    `);
    const row = Array.isArray(result) ? (result as any[])[0] : null;
    if (!row) {
      return Response.json({
        provider: "AISStream.io",
        workerOnline: false,
        connected: false,
        subscribed: false,
        vesselCount: 0,
        message: "Worker AISStream ainda não publicou heartbeat.",
      });
    }

    const updatedAt = new Date(row.updated_at);
    const ageMs = Date.now() - updatedAt.getTime();
    const workerOnline = Number.isFinite(ageMs) && ageMs < 60_000;

    return Response.json({
      provider: "AISStream.io",
      workerOnline,
      connected: Boolean(row.connected),
      subscribed: Boolean(row.subscribed),
      vesselCount: Number(row.vessel_count || 0),
      reconnectAttempt: Number(row.reconnect_attempt || 0),
      lastMessageAt: row.last_message_at || null,
      lastPersistAt: row.last_persist_at || null,
      lastError: row.last_error || null,
      updatedAt: row.updated_at || null,
    });
  } catch (error) {
    return Response.json({
      provider: "AISStream.io",
      workerOnline: false,
      connected: false,
      subscribed: false,
      vesselCount: 0,
      error: error instanceof Error ? error.message : "Falha ao consultar status do worker AIS.",
    }, { status: 503 });
  }
}
