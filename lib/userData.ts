import { eq, isNull } from "drizzle-orm";
import { boats, species, trips } from "../db/schema";

export async function claimLegacyData(db: any, ownerId: string) {
  const configuredOwnerId = process.env.LEGACY_OWNER_ID;
  if (!configuredOwnerId || configuredOwnerId !== ownerId) return;
  const [legacyTrip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(isNull(trips.ownerId))
    .limit(1);
  if (!legacyTrip) return;

  const [claimedTrip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(eq(trips.ownerId, ownerId))
    .limit(1);
  if (claimedTrip) return;

  await db.update(boats).set({ ownerId }).where(isNull(boats.ownerId));
  await db.update(species).set({ ownerId }).where(isNull(species.ownerId));
  await db.update(trips).set({ ownerId }).where(isNull(trips.ownerId));
}
