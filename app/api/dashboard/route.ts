import { getDb } from "../../../db";
import { after } from "next/server";
import {
  boats,
  catches,
  fishingSets,
  species,
  trips,
} from "../../../db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { requirePanelUserResponse } from "../../../lib/panelAuth";
import { claimLegacyData } from "../../../lib/userData";
import { captureEnvironmentalSnapshot } from "../../../lib/environmentalSnapshots";

export const runtime = "nodejs";
export const maxDuration = 30;


function parseDmm(value: unknown, latitude: boolean) {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(",", ".");
  const direction = raw.match(/[NSEW]$/)?.[0] || (latitude ? "S" : "W");
  const clean = raw.replace(/[NSEW\s]/g, "");
  const compact = clean.match(/^(\d{2})[º°]?(\d{2})(\d{2})$/);
  const parts = compact
    ? [compact[0], compact[1], `${compact[2]}.${compact[3]}`]
    : clean.match(/^(\d{1,3})\s*[º°]\s*(\d{1,2}(?:\.\d+)?)$/);
  if (!parts || !direction) return null;
  const degrees = Number(parts[1]);
  const minutes = Number(parts[2]);
  const max = latitude ? 90 : 180;
  if (degrees > max || minutes >= 60) return null;
  if (latitude && !["N", "S"].includes(direction)) return null;
  if (!latitude && !["E", "W"].includes(direction)) return null;
  const decimal = degrees + minutes / 60;
  return ["S", "W"].includes(direction) ? -decimal : decimal;
}

function discardCondition(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "VIVO" || normalized === "MORTO" ? normalized : null;
}

function discardConditionNote(value: unknown) {
  const condition = discardCondition(value);
  return condition ? `[DESCARTE:${condition}]` : null;
}

async function resolveCategorySpecies(db: ReturnType<typeof getDb>, ownerId: string, speciesIdValue: unknown, newName: unknown) {
  const speciesId = Number(speciesIdValue || 0);
  const commonName = String(newName || "").trim();
  if (speciesId && commonName)
    return { error: "Selecione uma espécie cadastrada ou informe uma nova, não use os dois campos." };
  if (speciesId) {
    const [existing] = await db.select({ id: species.id }).from(species)
      .where(and(eq(species.id, speciesId), eq(species.ownerId, ownerId), eq(species.active, true))).limit(1);
    return existing ? { id: existing.id } : { error: "A espécie selecionada não foi encontrada." };
  }
  if (!commonName) return { error: "Selecione uma espécie cadastrada ou informe uma nova espécie." };
  const [duplicate] = await db.select({ id: species.id }).from(species)
    .where(and(eq(species.ownerId, ownerId), sql`lower(${species.commonName}) = lower(${commonName})`)).limit(1);
  if (duplicate) return { error: `A espécie “${commonName}” já está cadastrada. Selecione essa espécie na lista.` };
  const [created] = await db.insert(species).values({ ownerId, commonName, active: true }).returning({ id: species.id });
  return { id: created.id };
}

export async function GET() {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const user = auth.user!;
  const db = getDb();
  await claimLegacyData(db, user.id);
  const [trip] = await db
    .select({
      id: trips.id,
      name: trips.name,
      targetKg: trips.targetKg,
      departureDate: trips.departureDate,
      expectedReturnDate: trips.expectedReturnDate,
      captain: trips.captain,
      departurePort: trips.departurePort,
      primarySpeciesId: trips.primarySpeciesId,
      boatName: boats.name,
    })
    .from(trips)
    .innerJoin(boats, eq(trips.boatId, boats.id))
    .where(and(eq(trips.status, "IN_PROGRESS"), eq(trips.ownerId, user.id)))
    .limit(1);
  if (!trip) return Response.json({ trip: null, total: 0, corvinaTotal: 0, mixtureTotal: 0, discardTotal: 0, discardAliveTotal: 0, discardDeadTotal: 0, setCount: 0, sets: [], daily: [], speciesOptions: [] });
  const [totalsRows, sets, daily, speciesOptions] = await Promise.all([
    db
      .select({
        corvinaTotal: sql<number>`coalesce(sum(case when ${catches.catchType} = 'PRIMARY' then ${catches.weightKg} else 0 end),0)`,
        mixtureTotal: sql<number>`coalesce(sum(case when ${catches.catchType} = 'MIXTURE' then ${catches.weightKg} else 0 end),0)`,
        discardTotal: sql<number>`coalesce(sum(case when ${catches.catchType} = 'DISCARD' then ${catches.weightKg} else 0 end),0)`,
        discardAliveTotal: sql<number>`coalesce(sum(case when ${catches.catchType} = 'DISCARD' and ${catches.notes} like '[DESCARTE:VIVO]%' then ${catches.weightKg} else 0 end),0)`,
        discardDeadTotal: sql<number>`coalesce(sum(case when ${catches.catchType} = 'DISCARD' and ${catches.notes} like '[DESCARTE:MORTO]%' then ${catches.weightKg} else 0 end),0)`,
        count: sql<number>`count(distinct ${fishingSets.id})`,
      })
      .from(fishingSets)
      .leftJoin(catches, eq(catches.fishingSetId, fishingSets.id))
      .where(eq(fishingSets.tripId, trip.id)),
    db
      .select({
        id: fishingSets.id,
        setNumber: fishingSets.setNumber,
        startedAt: fishingSets.startedAt,
        startLatitude: fishingSets.startLatitude,
        startLongitude: fishingSets.startLongitude,
        endLatitude: fishingSets.endLatitude,
        endLongitude: fishingSets.endLongitude,
        total: sql<number>`coalesce(sum(case when ${catches.catchType} != 'DISCARD' then ${catches.weightKg} else 0 end),0)`,
      })
      .from(fishingSets)
      .leftJoin(catches, eq(catches.fishingSetId, fishingSets.id))
      .where(eq(fishingSets.tripId, trip.id))
      .groupBy(fishingSets.id)
      .orderBy(asc(fishingSets.setNumber)),
    db
      .select({
        day: sql<string>`date(${catches.caughtAt})`,
        kg: sql<number>`sum(case when ${catches.catchType} = 'PRIMARY' then ${catches.weightKg} else 0 end)`,
      })
      .from(catches)
      .where(eq(catches.tripId, trip.id))
      .groupBy(sql`date(${catches.caughtAt})`)
      .orderBy(sql`date(${catches.caughtAt})`),
    db
      .select({ id: species.id, name: species.commonName })
      .from(species)
      .where(and(eq(species.ownerId, user.id), eq(species.active, true)))
      .orderBy(asc(species.commonName)),
  ]);
  const totals = totalsRows[0];
  const payload = {
    trip,
    total: Number(totals?.corvinaTotal || 0),
    corvinaTotal: Number(totals?.corvinaTotal || 0),
    mixtureTotal: Number(totals?.mixtureTotal || 0),
    discardTotal: Number(totals?.discardTotal || 0),
    discardAliveTotal: Number(totals?.discardAliveTotal || 0),
    discardDeadTotal: Number(totals?.discardDeadTotal || 0),
    setCount: Number(totals?.count || 0),
    sets,
    daily,
    speciesOptions,
  };
  return Response.json(payload);
}

export async function POST(req: Request) {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const user = auth.user!;
  const body = (await req.json()) as {
    action: string;
    tripId: number;
    fishingSetId?: number;
    weightKg?: number;
    speciesId?: number;
    notes?: string;
    fishingDate?: string;
    startTime?: string;
    endTime?: string;
    depthMeters?: number;
    startLatitude?: string;
    startLongitude?: string;
    endLatitude?: string;
    endLongitude?: string;
    speciesName?: string;
    categorySpeciesId?: number;
    catchType?: string;
    mixtureSpeciesName?: string;
    mixtureSpeciesId?: number;
    mixtureWeightKg?: number;
    discardSpeciesName?: string;
    discardSpeciesId?: number;
    discardWeightKg?: number;
    discardCondition?: string;
  };
  const db = getDb();
  await claimLegacyData(db, user.id);
  const [ownedTrip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, Number(body.tripId)), eq(trips.ownerId, user.id)))
    .limit(1);
  if (!ownedTrip)
    return Response.json({ error: "Viagem não encontrada para este usuário." }, { status: 404 });
  if (body.action === "capture") {
    if (
      !body.tripId ||
      !body.fishingSetId ||
      !body.speciesId ||
      !body.weightKg ||
      body.weightKg <= 0
    )
      return Response.json(
        {
          error:
            "A viagem precisa ter espécie principal, largada e peso válido.",
        },
        { status: 400 },
      );
    const [ownedSet] = await db.select({ id: fishingSets.id }).from(fishingSets)
      .where(and(eq(fishingSets.id, body.fishingSetId), eq(fishingSets.tripId, body.tripId))).limit(1);
    const [ownedSpecies] = await db.select({ id: species.id }).from(species)
      .where(and(eq(species.id, body.speciesId), eq(species.ownerId, user.id))).limit(1);
    if (!ownedSet || !ownedSpecies)
      return Response.json({ error: "Largada ou espécie não pertence a esta conta." }, { status: 403 });
    const [row] = await db
      .insert(catches)
      .values({
        tripId: body.tripId,
        fishingSetId: body.fishingSetId,
        speciesId: body.speciesId,
        catchType: "PRIMARY",
        weightKg: Number(body.weightKg),
        caughtAt: new Date().toISOString(),
        notes: body.notes,
        createdBy: user.id,
      })
      .returning();
    return Response.json(row, { status: 201 });
  }
  if (body.action === "categorizedCatch") {
    const catchType = String(body.catchType || "");
    const weightKg = Number(body.weightKg);
    if (!["MIXTURE", "DISCARD"].includes(catchType) || !body.fishingSetId || weightKg <= 0)
      return Response.json({ error: "Informe a largada, a espécie e um peso maior que zero." }, { status: 400 });
    const [ownedSet] = await db.select({ id: fishingSets.id }).from(fishingSets)
      .where(and(eq(fishingSets.id, body.fishingSetId), eq(fishingSets.tripId, body.tripId))).limit(1);
    if (!ownedSet) return Response.json({ error: "Largada não encontrada nesta viagem." }, { status: 404 });
    const resolved = await resolveCategorySpecies(db, user.id, body.categorySpeciesId, body.speciesName);
    if (!resolved.id) return Response.json({ error: resolved.error }, { status: 409 });
    const condition = catchType === "DISCARD" ? discardCondition(body.discardCondition) : null;
    if (catchType === "DISCARD" && !condition)
      return Response.json({ error: "Marque se o descarte estava vivo ou morto." }, { status: 400 });
    const [row] = await db.insert(catches).values({ tripId: body.tripId, fishingSetId: body.fishingSetId, speciesId: resolved.id, catchType, weightKg, caughtAt: new Date().toISOString(), notes: discardConditionNote(condition), createdBy: user.id }).returning();
    return Response.json(row, { status: 201 });
  }
  if (body.action === "set") {
    const startLatitude = parseDmm(body.startLatitude, true);
    const startLongitude = parseDmm(body.startLongitude, false);
    const endLatitude = parseDmm(body.endLatitude, true);
    const endLongitude = parseDmm(body.endLongitude, false);
    const startedAt = `${body.fishingDate}T${body.startTime}:00`;
    const finishedAt = `${body.fishingDate}T${body.endTime}:00`;
    if (
      !body.tripId ||
      !body.speciesId ||
      !body.fishingDate ||
      !body.startTime ||
      !body.endTime ||
      body.depthMeters == null ||
      body.depthMeters < 0 ||
      !body.weightKg ||
      body.weightKg <= 0 ||
      startLatitude == null ||
      startLongitude == null ||
      endLatitude == null ||
      endLongitude == null
    )
      return Response.json(
        { error: "Preencha todos os dados. Use coordenadas como 027º09.123 S e 048º32.456 W." },
        { status: 400 },
      );
    const [ownedSpecies] = await db.select({ id: species.id }).from(species)
      .where(and(eq(species.id, body.speciesId), eq(species.ownerId, user.id))).limit(1);
    if (!ownedSpecies)
      return Response.json({ error: "Espécie não pertence a esta conta." }, { status: 403 });
    if (new Date(finishedAt) < new Date(startedAt))
      return Response.json(
        { error: "O horário final não pode ser anterior ao inicial." },
        { status: 400 },
      );
    const requestedExtras = [
      { type: "MIXTURE", label: "a mistura", id: body.mixtureSpeciesId, name: body.mixtureSpeciesName, weight: Number(body.mixtureWeightKg || 0), condition: null },
      { type: "DISCARD", label: "o descarte", id: body.discardSpeciesId, name: body.discardSpeciesName, weight: Number(body.discardWeightKg || 0), condition: discardCondition(body.discardCondition) },
    ];
    const preparedExtras: Array<{ type: string; speciesId: number; weight: number; condition: string | null }> = [];
    for (const extra of requestedExtras) {
      if (((extra.name || extra.id) && !extra.weight) || (!extra.name && !extra.id && extra.weight > 0) || extra.weight < 0)
        return Response.json({ error: `Informe espécie e peso válidos para ${extra.label}.` }, { status: 400 });
      if (!extra.name && !extra.id && !extra.weight) continue;
      if (extra.type === "DISCARD" && !extra.condition)
        return Response.json({ error: "Marque se o descarte estava vivo ou morto." }, { status: 400 });
      const resolved = await resolveCategorySpecies(db, user.id, extra.id, extra.name);
      if (!resolved.id) return Response.json({ error: resolved.error }, { status: 409 });
      preparedExtras.push({ type: extra.type, speciesId: resolved.id, weight: extra.weight, condition: extra.condition });
    }
    const [{ next }] = await db
      .select({
        next: sql<number>`coalesce(max(${fishingSets.setNumber}),0)+1`,
      })
      .from(fishingSets)
      .where(eq(fishingSets.tripId, body.tripId));
    const [row] = await db
      .insert(fishingSets)
      .values({
        tripId: body.tripId,
        setNumber: Number(next),
        startedAt,
        finishedAt,
        depthMeters: Number(body.depthMeters),
        startLatitude,
        startLongitude,
        endLatitude,
        endLongitude,
        notes: body.notes,
      })
      .returning();
    const [catchRow] = await db
      .insert(catches)
      .values({
        tripId: body.tripId,
        fishingSetId: row.id,
        speciesId: body.speciesId,
        catchType: "PRIMARY",
        weightKg: Number(body.weightKg),
        caughtAt: finishedAt,
        notes: "Captura informada no registro da largada",
        createdBy: user.id,
      })
      .returning();
    const extraCatches = [];
    for (const extra of preparedExtras) {
      const [saved] = await db.insert(catches).values({ tripId: body.tripId, fishingSetId: row.id, speciesId: extra.speciesId, catchType: extra.type, weightKg: extra.weight, caughtAt: finishedAt, notes: extra.type === "DISCARD" ? discardConditionNote(extra.condition) : null, createdBy: user.id }).returning();
      extraCatches.push(saved);
    }

    // V80: salva a largada primeiro e coleta vento/mar/lua em segundo plano.
    // O usuário não fica esperando APIs externas para concluir o registro operacional.
    after(async () => {
      try {
        await captureEnvironmentalSnapshot(getDb(), {
          ownerId: user.id,
          tripId: body.tripId,
          fishingSetId: row.id,
          latitude: startLatitude,
          longitude: startLongitude,
          referenceTime: startedAt,
        });
      } catch (error) {
        console.error("environmental snapshot on set create", error);
      }
    });
    return Response.json({ ...row, catch: catchRow, extraCatches, environmentSnapshot: { status: "QUEUED" } }, { status: 201 });
  }
  return Response.json({ error: "Ação inválida." }, { status: 400 });
}
