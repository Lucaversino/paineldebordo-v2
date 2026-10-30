import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../db";
import { fishingSets, trips } from "../../../db/schema";
import { and, eq } from "drizzle-orm";
import { getPanelUser } from "../../../lib/panelAuth";
import {
  captureEnvironmentalSnapshot,
  countEnvironmentalBackfillRemaining,
  getEnvironmentalBackfillCandidates,
  getEnvironmentalSnapshots,
} from "../../../lib/environmentalSnapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const tripIdValue = Number(new URL(request.url).searchParams.get("tripId"));
  const tripId = Number.isFinite(tripIdValue) && tripIdValue > 0 ? tripIdValue : undefined;
  const [snapshots, remaining] = await Promise.all([
    getEnvironmentalSnapshots(db, user.id, tripId),
    countEnvironmentalBackfillRemaining(db, user.id, tripId),
  ]);
  return NextResponse.json({ snapshots, remaining });
}

export async function POST(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "backfill");

  if (action === "single") {
    const fishingSetId = Number(body?.fishingSetId);
    if (!Number.isFinite(fishingSetId) || fishingSetId <= 0)
      return NextResponse.json({ error: "Largada inválida." }, { status: 400 });

    const [candidate] = await db
      .select({
        fishingSetId: fishingSets.id,
        tripId: fishingSets.tripId,
        referenceTime: fishingSets.startedAt,
        latitude: fishingSets.startLatitude,
        longitude: fishingSets.startLongitude,
      })
      .from(fishingSets)
      .innerJoin(trips, eq(fishingSets.tripId, trips.id))
      .where(and(eq(fishingSets.id, fishingSetId), eq(trips.ownerId, user.id)))
      .limit(1);

    if (!candidate)
      return NextResponse.json({ error: "Largada não encontrada nesta conta." }, { status: 404 });

    const snapshot = await captureEnvironmentalSnapshot(db, {
      ownerId: user.id,
      tripId: Number(candidate.tripId),
      fishingSetId: Number(candidate.fishingSetId),
      latitude: candidate.latitude == null ? null : Number(candidate.latitude),
      longitude: candidate.longitude == null ? null : Number(candidate.longitude),
      referenceTime: String(candidate.referenceTime),
      force: Boolean(body?.force),
    });

    if (!snapshot) {
      const snapshots = await getEnvironmentalSnapshots(db, user.id, Number(candidate.tripId));
      const saved = snapshots.find((item) => Number(item.fishingSetId) === fishingSetId) || null;
      if (saved) return NextResponse.json({ snapshot: saved });
      return NextResponse.json({ error: "Não foi possível gerar a meteorologia desta largada." }, { status: 502 });
    }

    return NextResponse.json({ snapshot });
  }

  if (action === "backfill") {
    const tripIdValue = Number(body?.tripId);
    const tripId = Number.isFinite(tripIdValue) && tripIdValue > 0 ? tripIdValue : undefined;
    const limit = Math.max(1, Math.min(6, Number(body?.limit) || 3));
    const candidates = await getEnvironmentalBackfillCandidates(db, user.id, limit, tripId);
    const results = await Promise.all(candidates.map(async (candidate) => {
      try {
        const snapshot = await captureEnvironmentalSnapshot(db, {
          ownerId: user.id,
          tripId: Number(candidate.tripId),
          fishingSetId: Number(candidate.fishingSetId),
          latitude: candidate.latitude == null ? null : Number(candidate.latitude),
          longitude: candidate.longitude == null ? null : Number(candidate.longitude),
          referenceTime: String(candidate.referenceTime),
          force: true,
        });
        return { fishingSetId: Number(candidate.fishingSetId), ok: Boolean(snapshot), status: snapshot?.status || "ERROR" };
      } catch (error) {
        console.error("environmental backfill set error", candidate.fishingSetId, error);
        return { fishingSetId: Number(candidate.fishingSetId), ok: false, status: "ERROR" };
      }
    }));
    const remaining = await countEnvironmentalBackfillRemaining(db, user.id, tripId);
    return NextResponse.json({ processed: results.length, results, remaining });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
