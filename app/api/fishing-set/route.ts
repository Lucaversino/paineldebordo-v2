import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { fishingSets, trips } from "../../../db/schema";
import { requirePanelUserResponse } from "../../../lib/panelAuth";
import { claimLegacyData } from "../../../lib/userData";

export async function GET(request: Request) {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const user = auth.user!;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id)
    return Response.json({ error: "Largada inválida." }, { status: 400 });

  const db = getDb();
  await claimLegacyData(db, user.id);
  const [row] = await db
    .select({
      id: fishingSets.id,
      tripId: fishingSets.tripId,
      setNumber: fishingSets.setNumber,
      startedAt: fishingSets.startedAt,
      finishedAt: fishingSets.finishedAt,
      startLatitude: fishingSets.startLatitude,
      startLongitude: fishingSets.startLongitude,
      endLatitude: fishingSets.endLatitude,
      endLongitude: fishingSets.endLongitude,
      depthMeters: fishingSets.depthMeters,
      netLengthMeters: fishingSets.netLengthMeters,
      netHeightMeters: fishingSets.netHeightMeters,
      meshSize: fishingSets.meshSize,
      netQuantity: fishingSets.netQuantity,
      soakTimeMinutes: fishingSets.soakTimeMinutes,
      waterTemperature: fishingSets.waterTemperature,
      notes: fishingSets.notes,
    })
    .from(fishingSets)
    .innerJoin(trips, eq(fishingSets.tripId, trips.id))
    .where(and(eq(fishingSets.id, id), eq(trips.ownerId, user.id)))
    .limit(1);
  return row
    ? Response.json(row)
    : Response.json({ error: "Largada não encontrada." }, { status: 404 });
}
