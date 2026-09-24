import { getDb } from "../../../db";
import {
  boats,
  catches,
  fishingSets,
  species,
  trips,
} from "../../../db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { requirePanelUserResponse } from "../../../lib/panelAuth";
import { claimLegacyData, ensureDefaultSpecies } from "../../../lib/userData";
import { captureEnvironmentalSnapshot } from "../../../lib/environmentalSnapshots";

function coordinate(value: unknown, latitude: boolean) {
  const raw = String(value || "").toUpperCase().replace(/[NSEW\s]/g, "");
  const compact = raw.match(/^(\d{2})[º°]?(\d{2})(\d{2})$/);
  if (!compact) return null;
  const degrees = Number(compact[1]);
  const minutes = Number(`${compact[2]}.${compact[3]}`);
  if (degrees > (latitude ? 90 : 180) || minutes >= 60) return null;
  return -(degrees + minutes / 60);
}

function discardConditionFromNotes(value: unknown) {
  const match = String(value || "").match(/^\[DESCARTE:(VIVO|MORTO)\](?:\n|$)/i);
  return match ? match[1].toUpperCase() : null;
}

function cleanDiscardNotes(value: unknown) {
  return String(value || "").replace(/^\[DESCARTE:(?:VIVO|MORTO)\](?:\n|$)/i, "").trim() || null;
}

function discardNotes(conditionValue: unknown, noteValue: unknown) {
  const condition = String(conditionValue || "").trim().toUpperCase();
  if (condition !== "VIVO" && condition !== "MORTO") return null;
  const note = cleanDiscardNotes(noteValue);
  return `[DESCARTE:${condition}]${note ? `\n${note}` : ""}`;
}

export async function GET() {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const user = auth.user!;
  const db = getDb();
  await claimLegacyData(db, user.id);
  await ensureDefaultSpecies(db, user.id);
  const [bs, sp, ts, fs, cs] = await Promise.all([
    db.select().from(boats).where(and(eq(boats.ownerId, user.id), eq(boats.active, true))).orderBy(desc(boats.id)),
    db.select().from(species).where(and(eq(species.ownerId, user.id), eq(species.active, true))).orderBy(desc(species.id)),
    db
      .select({
        id: trips.id,
        name: trips.name,
        boatId: trips.boatId,
        boatName: boats.name,
        departureDate: trips.departureDate,
        expectedReturnDate: trips.expectedReturnDate,
        returnDate: trips.returnDate,
        targetKg: trips.targetKg,
        status: trips.status,
        captain: trips.captain,
        crewCount: trips.crewCount,
        departurePort: trips.departurePort,
        returnPort: trips.returnPort,
        primarySpeciesId: trips.primarySpeciesId,
        fishingType: trips.fishingType,
        notes: trips.notes,
        total: sql<number>`coalesce((select sum(c.weight_kg) from catches c where c.trip_id = ${trips.id} and c.catch_type != 'DISCARD'), 0)`,
        corvinaTotal: sql<number>`coalesce((select sum(c.weight_kg) from catches c where c.trip_id = ${trips.id} and c.catch_type = 'PRIMARY'), 0)`,
        mixtureTotal: sql<number>`coalesce((select sum(c.weight_kg) from catches c where c.trip_id = ${trips.id} and c.catch_type = 'MIXTURE'), 0)`,
        discardTotal: sql<number>`coalesce((select sum(c.weight_kg) from catches c where c.trip_id = ${trips.id} and c.catch_type = 'DISCARD'), 0)`,
        sets: sql<number>`(select count(*) from fishing_sets fs where fs.trip_id = ${trips.id})`,
      })
      .from(trips)
      .innerJoin(boats, eq(trips.boatId, boats.id))
      .where(and(eq(trips.ownerId, user.id), sql`${trips.deletedAt} is null`))
      .orderBy(desc(trips.id)),
    db
      .select({
        id: fishingSets.id,
        tripId: fishingSets.tripId,
        setNumber: fishingSets.setNumber,
        startedAt: fishingSets.startedAt,
        finishedAt: fishingSets.finishedAt,
        depthMeters: fishingSets.depthMeters,
        netLengthMeters: fishingSets.netLengthMeters,
        startLatitude: fishingSets.startLatitude,
        startLongitude: fishingSets.startLongitude,
        endLatitude: fishingSets.endLatitude,
        endLongitude: fishingSets.endLongitude,
        total: sql<number>`coalesce(sum(case when ${catches.catchType} != 'DISCARD' then ${catches.weightKg} else 0 end),0)`,
      })
      .from(fishingSets)
      .leftJoin(catches, eq(catches.fishingSetId, fishingSets.id))
      .innerJoin(trips, eq(fishingSets.tripId, trips.id))
      .where(eq(trips.ownerId, user.id))
      .groupBy(fishingSets.id)
      .orderBy(desc(fishingSets.id)),
    db
      .select({
        id: catches.id,
        tripId: catches.tripId,
        fishingSetId: catches.fishingSetId,
        speciesId: catches.speciesId,
        species: species.commonName,
        catchType: catches.catchType,
        weightKg: catches.weightKg,
        caughtAt: catches.caughtAt,
        notes: catches.notes,
      })
      .from(catches)
      .innerJoin(species, eq(catches.speciesId, species.id))
      .innerJoin(trips, eq(catches.tripId, trips.id))
      .where(eq(trips.ownerId, user.id))
      .orderBy(desc(catches.id)),
  ]);
  return Response.json({
    boats: bs,
    species: sp,
    trips: ts,
    sets: fs,
    catches: cs.map((item) => ({
      ...item,
      discardCondition: item.catchType === "DISCARD" ? discardConditionFromNotes(item.notes) : null,
      notes: item.catchType === "DISCARD" ? cleanDiscardNotes(item.notes) : item.notes,
    })),
  });
}
export async function POST(r: Request) {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const user = auth.user!;
  const b = (await r.json()) as any,
    db = getDb();
  await claimLegacyData(db, user.id);
  if (b.type === "boat") {
    if (!b.name?.trim())
      return Response.json(
        { error: "Informe o nome da embarcação." },
        { status: 400 },
      );

    const registrations = await db.select({ registration: boats.registration }).from(boats).where(eq(boats.ownerId, user.id));
    const highestNumericRegistration = registrations.reduce((highest, item) => {
      const value = String(item.registration || "").trim();
      return /^\d+$/.test(value) ? Math.max(highest, Number(value)) : highest;
    }, 0);
    const automaticRegistration = String(highestNumericRegistration + 1).padStart(2, "0");
    const normalizedRegistration = String(b.registration || automaticRegistration).trim();
    const [duplicate] = await db.select({ id: boats.id, active: boats.active }).from(boats)
      .where(and(eq(boats.ownerId, user.id), eq(boats.registration, normalizedRegistration))).limit(1);
    if (duplicate?.active)
      return Response.json(
        { error: "Já existe uma embarcação com esta matrícula." },
        { status: 409 },
      );
    if (duplicate && !duplicate.active) {
      const [restored] = await db.update(boats).set({
        name: b.name.trim(),
        owner: b.owner || null,
        homePort: b.homePort || null,
        storageCapacityKg: Number(b.capacity) || null,
        active: true,
      }).where(and(eq(boats.id, duplicate.id), eq(boats.ownerId, user.id))).returning();
      return Response.json(restored);
    }
    return Response.json(
      (
        await db
          .insert(boats)
          .values({
            ownerId: user.id,
            name: b.name.trim(),
            registration: normalizedRegistration,
            owner: b.owner,
            homePort: b.homePort,
            storageCapacityKg: Number(b.capacity) || null,
            active: true,
          })
          .returning()
      )[0],
    );
  }
  if (b.type === "species") {
    const commonName = String(b.name || "").trim();
    if (!commonName)
      return Response.json({ error: "Nome obrigatório." }, { status: 400 });
    const [duplicate] = await db.select({ id: species.id, active: species.active, commonName: species.commonName }).from(species)
      .where(and(eq(species.ownerId, user.id), sql`lower(trim(${species.commonName})) = lower(trim(${commonName}))`)).limit(1);
    if (duplicate?.active)
      return Response.json({ error: `A espécie “${duplicate.commonName}” já está cadastrada. Selecione-a na lista.` }, { status: 409 });
    if (duplicate && !duplicate.active) {
      const [restored] = await db.update(species).set({
        commonName,
        scientificName: b.scientificName || null,
        code: b.code || null,
        active: true,
      }).where(and(eq(species.id, duplicate.id), eq(species.ownerId, user.id))).returning();
      return Response.json(restored);
    }
    return Response.json(
      (
        await db
          .insert(species)
          .values({
            ownerId: user.id,
            commonName,
            scientificName: b.scientificName || null,
            code: b.code || null,
            active: true,
          })
          .returning()
      )[0],
    );
  }
  if (b.type === "trip") {
    const target = Number(b.target);
    if (
      !b.name ||
      !b.boatId ||
      !b.departureDate ||
      !b.expectedReturnDate ||
      !b.departurePort?.trim() ||
      !b.returnPort?.trim() ||
      target <= 0
    )
      return Response.json(
        { error: "Preencha os campos obrigatórios e uma meta válida." },
        { status: 400 },
      );
    if (new Date(b.expectedReturnDate) <= new Date(b.departureDate))
      return Response.json(
        { error: "O retorno previsto deve ser posterior à data de saída." },
        { status: 400 },
      );
    const requestedSpeciesId = Number(b.speciesId || 0);
    const requestedSpeciesName = String(b.speciesName || "").trim();
    if (requestedSpeciesId && requestedSpeciesName)
      return Response.json({ error: "Selecione uma espécie cadastrada OU informe uma nova espécie." }, { status: 400 });

    let speciesId = requestedSpeciesId;
    if (requestedSpeciesName) {
      const [duplicateSpecies] = await db.select({ id: species.id, active: species.active }).from(species)
        .where(and(eq(species.ownerId, user.id), sql`lower(trim(${species.commonName})) = lower(trim(${requestedSpeciesName}))`)).limit(1);
      if (duplicateSpecies?.active) {
        speciesId = duplicateSpecies.id;
      } else if (duplicateSpecies) {
        await db.update(species).set({ active: true, commonName: requestedSpeciesName }).where(eq(species.id, duplicateSpecies.id));
        speciesId = duplicateSpecies.id;
      } else {
        const [createdSpecies] = await db.insert(species).values({ ownerId: user.id, commonName: requestedSpeciesName, active: true }).returning({ id: species.id });
        speciesId = createdSpecies.id;
      }
    }
    if (!Number.isSafeInteger(speciesId) || speciesId <= 0)
      return Response.json({ error: "Selecione a espécie principal ou cadastre uma nova espécie." }, { status: 400 });

    const [ownedBoat] = await db.select({ id: boats.id }).from(boats)
      .where(and(eq(boats.id, Number(b.boatId)), eq(boats.ownerId, user.id), eq(boats.active, true))).limit(1);
    const [ownedSpecies] = await db.select({ id: species.id }).from(species)
      .where(and(eq(species.id, speciesId), eq(species.ownerId, user.id), eq(species.active, true))).limit(1);
    if (!ownedBoat)
      return Response.json({ error: "Selecione uma embarcação ativa da sua conta." }, { status: 400 });
    if (!ownedSpecies)
      return Response.json({ error: "Selecione uma espécie válida." }, { status: 400 });
    if (b.status === "IN_PROGRESS") {
      const active = await db
        .select()
        .from(trips)
        .where(
          sql`${trips.boatId}=${Number(b.boatId)} and ${trips.ownerId}=${user.id} and ${trips.status}='IN_PROGRESS' and ${trips.deletedAt} is null`,
        )
        .limit(1);
      if (active.length)
        return Response.json(
          { error: "Esta embarcação já possui uma viagem em andamento." },
          { status: 409 },
        );
    }
    return Response.json(
      (
        await db
          .insert(trips)
          .values({
            ownerId: user.id,
            name: b.name,
            boatId: Number(b.boatId),
            departureDate: b.departureDate,
            expectedReturnDate: b.expectedReturnDate,
            departurePort: b.departurePort.trim(),
            returnPort: b.returnPort.trim(),
            captain: b.captain || "Não informado",
            crewCount: Number(b.crewCount) || 1,
            targetKg: target * (b.unit === "t" ? 1000 : 1),
            primarySpeciesId: speciesId,
            status: b.status || "PLANNED",
            fishingType: b.fishingType || "Rede de emalhe",
            createdBy: user.id,
            updatedBy: user.id,
          })
          .returning()
      )[0],
    );
  }
  if (b.type === "finish") {
    await db
      .update(trips)
      .set({
        status: "FINISHED",
        returnDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(trips.id, Number(b.id)), eq(trips.ownerId, user.id)));
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Operação inválida." }, { status: 400 });
}
export async function DELETE(r: Request) {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const user = auth.user!;
  const { id, type } = (await r.json()) as any,
    db = getDb(),
    n = Number(id);
  await claimLegacyData(db, user.id);
  if (type === "trip") {
    const [owned] = await db.select({ id: trips.id }).from(trips)
      .where(and(eq(trips.id, n), eq(trips.ownerId, user.id))).limit(1);
    if (!owned) return Response.json({ error: "Viagem não encontrada." }, { status: 404 });
    await db
      .update(trips)
      .set({ deletedAt: new Date().toISOString(), status: "CANCELLED" })
      .where(eq(trips.id, n));
    return Response.json({ ok: true });
  }
  if (type === "boat") {
    const [owned] = await db.select({ id: boats.id }).from(boats)
      .where(and(eq(boats.id, n), eq(boats.ownerId, user.id))).limit(1);
    if (!owned) return Response.json({ error: "Embarcação não encontrada." }, { status: 404 });
    const [activeTrip] = await db.select({ id: trips.id }).from(trips)
      .where(and(
        eq(trips.boatId, n),
        eq(trips.ownerId, user.id),
        eq(trips.status, "IN_PROGRESS"),
        sql`${trips.deletedAt} is null`,
      )).limit(1);
    if (activeTrip) {
      return Response.json(
        { error: "Esta embarcação possui uma viagem em andamento. Finalize ou exclua essa viagem primeiro." },
        { status: 409 },
      );
    }
    // Arquiva a embarcação para preservar nomes e dados de viagens antigas.
    await db.update(boats).set({ active: false })
      .where(and(eq(boats.id, n), eq(boats.ownerId, user.id)));
    return Response.json({ ok: true });
  }
  if (type === "species") {
    const [owned] = await db.select({ id: species.id, name: species.commonName }).from(species)
      .where(and(eq(species.id, n), eq(species.ownerId, user.id))).limit(1);
    if (!owned) return Response.json({ error: "Espécie não encontrada." }, { status: 404 });
    if (owned.name.trim().toLowerCase() === "corvina")
      return Response.json(
        { error: "Corvina é a espécie padrão do sistema e não pode ser excluída." },
        { status: 409 },
      );
    await db.update(species).set({ active: false })
      .where(and(eq(species.id, n), eq(species.ownerId, user.id)));
    return Response.json({ ok: true });
  }
  if (type === "catch") {
    const [owned] = await db.select({ id: catches.id }).from(catches)
      .innerJoin(trips, eq(catches.tripId, trips.id))
      .where(and(eq(catches.id, n), eq(trips.ownerId, user.id))).limit(1);
    if (!owned) return Response.json({ error: "Captura não encontrada." }, { status: 404 });
    await db.delete(catches).where(eq(catches.id, n));
    return Response.json({ ok: true });
  }
  if (type === "set") {
    const [owned] = await db.select({ id: fishingSets.id }).from(fishingSets)
      .innerJoin(trips, eq(fishingSets.tripId, trips.id))
      .where(and(eq(fishingSets.id, n), eq(trips.ownerId, user.id))).limit(1);
    if (!owned) return Response.json({ error: "Largada não encontrada." }, { status: 404 });
    await db.delete(catches).where(eq(catches.fishingSetId, n));
    await db.delete(fishingSets).where(eq(fishingSets.id, n));
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Operação inválida." }, { status: 400 });
}
export async function PUT(r: Request) {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const user = auth.user!;
  const b = (await r.json()) as any,
    db = getDb(),
    id = Number(b.id);
  await claimLegacyData(db, user.id);
  if (!id)
    return Response.json({ error: "Registro inválido." }, { status: 400 });
  if (b.type === "species") {
    const name = String(b.name || "").trim();
    if (!name)
      return Response.json({ error: "O nome da espécie é obrigatório." }, { status: 400 });
    const [row] = await db.update(species).set({
      commonName: name,
      scientificName: String(b.scientificName || "").trim() || null,
      code: String(b.code || "").trim() || null,
    }).where(and(eq(species.id, id), eq(species.ownerId, user.id))).returning();
    return row
      ? Response.json(row)
      : Response.json({ error: "Espécie não encontrada." }, { status: 404 });
  }
  if (b.type === "tripDates") {
    const [trip] = await db.select().from(trips)
      .where(and(eq(trips.id, id), eq(trips.ownerId, user.id))).limit(1);
    if (!trip) return Response.json({ error: "Viagem não encontrada." }, { status: 404 });
    const departureDate = b.departureDate;
    const returnDate = b.returnDate || null;
    if (typeof departureDate !== "string" || !Number.isFinite(new Date(departureDate).getTime()))
      return Response.json({ error: "Informe uma data de saída válida." }, { status: 400 });
    if (trip.status === "FINISHED" && !returnDate)
      return Response.json({ error: "Informe a data de chegada da viagem finalizada." }, { status: 400 });
    if (returnDate && (typeof returnDate !== "string" || !Number.isFinite(new Date(returnDate).getTime()) || new Date(returnDate) < new Date(departureDate)))
      return Response.json({ error: "A chegada deve ser igual ou posterior à saída." }, { status: 400 });
    const [updated] = await db.update(trips).set({ departureDate, returnDate })
      .where(and(eq(trips.id, id), eq(trips.ownerId, user.id))).returning();
    return Response.json(updated);
  }
  if (b.type === "trip") {
    const [ownedTrip] = await db.select({ id: trips.id, returnDate: trips.returnDate }).from(trips)
      .where(and(eq(trips.id, id), eq(trips.ownerId, user.id))).limit(1);
    if (!ownedTrip) return Response.json({ error: "Viagem não encontrada." }, { status: 404 });
    const returnDate = b.returnDate === undefined ? ownedTrip.returnDate : (b.returnDate || null);
    if (b.status === "FINISHED" && !returnDate)
      return Response.json({ error: "Informe a data de chegada ao porto para a viagem finalizada." }, { status: 400 });
    if (returnDate && (
      typeof returnDate !== "string" ||
      !Number.isFinite(new Date(returnDate).getTime()) ||
      !Number.isFinite(new Date(b.departureDate).getTime()) ||
      new Date(returnDate) < new Date(b.departureDate)
    ))
      return Response.json({ error: "A chegada ao porto deve ser uma data válida, igual ou posterior à saída." }, { status: 400 });
    const target = Number(b.target);
    if (
      !b.name ||
      !b.boatId ||
      !b.departureDate ||
      !b.expectedReturnDate ||
      !b.departurePort?.trim() ||
      !b.returnPort?.trim() ||
      target <= 0
    )
      return Response.json(
        { error: "Preencha os campos obrigatórios e uma meta válida." },
        { status: 400 },
      );
    const [ownedBoat] = await db.select({ id: boats.id }).from(boats)
      .where(and(eq(boats.id, Number(b.boatId)), eq(boats.ownerId, user.id))).limit(1);
    const [ownedSpecies] = b.speciesId
      ? await db.select({ id: species.id }).from(species)
          .where(and(eq(species.id, Number(b.speciesId)), eq(species.ownerId, user.id))).limit(1)
      : [];
    if (!ownedBoat || (b.speciesId && !ownedSpecies))
      return Response.json({ error: "Embarcação ou espécie não pertence a esta conta." }, { status: 403 });
    if (b.status === "IN_PROGRESS") {
      const active = await db
        .select({ id: trips.id })
        .from(trips)
        .where(
          sql`${trips.boatId}=${Number(b.boatId)} and ${trips.ownerId}=${user.id} and ${trips.status}='IN_PROGRESS' and ${trips.deletedAt} is null and ${trips.id}<>${id}`,
        )
        .limit(1);
      if (active.length)
        return Response.json(
          { error: "Esta embarcação já possui outra viagem em andamento." },
          { status: 409 },
        );
    }
    const [row] = await db
      .update(trips)
      .set({
        name: b.name,
        boatId: Number(b.boatId),
        departureDate: b.departureDate,
        expectedReturnDate: b.expectedReturnDate,
        returnDate,
        departurePort: b.departurePort.trim(),
        returnPort: b.returnPort.trim(),
        captain: b.captain,
        crewCount: Number(b.crewCount) || 1,
        targetKg: target * (b.unit === "t" ? 1000 : 1),
        primarySpeciesId: Number(b.speciesId) || null,
        status: b.status,
        fishingType: b.fishingType || "Rede de emalhe",
        notes: b.notes || null,
        updatedBy: user.id,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(trips.id, id), eq(trips.ownerId, user.id)))
      .returning();
    return Response.json(row);
  }
  if (b.type === "catch") {
    const [ownedCatch] = await db.select({ id: catches.id, catchType: catches.catchType }).from(catches)
      .innerJoin(trips, eq(catches.tripId, trips.id))
      .where(and(eq(catches.id, id), eq(trips.ownerId, user.id))).limit(1);
    if (!ownedCatch) return Response.json({ error: "Captura não encontrada." }, { status: 404 });
    const [ownedSpecies] = await db.select({ id: species.id }).from(species)
      .where(and(eq(species.id, Number(b.speciesId)), eq(species.ownerId, user.id))).limit(1);
    if (!ownedSpecies)
      return Response.json({ error: "Espécie não pertence a esta conta." }, { status: 403 });
    const weight = Number(b.weightKg);
    if (!b.speciesId || weight <= 0)
      return Response.json(
        { error: "Espécie e peso maior que zero são obrigatórios." },
        { status: 400 },
      );
    const condition = ownedCatch.catchType === "DISCARD" ? String(b.discardCondition || "").trim().toUpperCase() : null;
    if (ownedCatch.catchType === "DISCARD" && condition !== "VIVO" && condition !== "MORTO")
      return Response.json({ error: "Marque se o descarte estava vivo ou morto." }, { status: 400 });
    const [row] = await db
      .update(catches)
      .set({
        speciesId: Number(b.speciesId),
        weightKg: weight,
        caughtAt: b.caughtAt,
        notes: ownedCatch.catchType === "DISCARD" ? discardNotes(condition, b.notes) : b.notes || null,
      })
      .where(eq(catches.id, id))
      .returning();
    return Response.json(row);
  }
  const num = (v: any) => (v === "" || v == null ? null : Number(v));
  const [ownedSet] = await db.select({ id: fishingSets.id }).from(fishingSets)
    .innerJoin(trips, eq(fishingSets.tripId, trips.id))
    .where(and(eq(fishingSets.id, id), eq(trips.ownerId, user.id))).limit(1);
  if (!ownedSet) return Response.json({ error: "Largada não encontrada." }, { status: 404 });
  if (b.finishedAt && new Date(b.finishedAt) < new Date(b.startedAt))
    return Response.json(
      { error: "O recolhimento não pode ser anterior à largada." },
      { status: 400 },
    );
  const [row] = await db
    .update(fishingSets)
    .set({
      startedAt: b.startedAt,
      finishedAt: b.finishedAt || null,
      startLatitude: coordinate(b.startLatitude, true),
      startLongitude: coordinate(b.startLongitude, false),
      endLatitude: coordinate(b.endLatitude, true),
      endLongitude: coordinate(b.endLongitude, false),
      depthMeters: num(b.depthMeters),
      netLengthMeters: num(b.netLengthMeters),
      netHeightMeters: num(b.netHeightMeters),
      meshSize: num(b.meshSize),
      netQuantity: num(b.netQuantity),
      soakTimeMinutes: num(b.soakTimeMinutes),
      waterTemperature: num(b.waterTemperature),
      notes: b.notes || null,
    })
    .where(eq(fishingSets.id, id))
    .returning();
  if (!row)
    return Response.json({ error: "Largada não encontrada." }, { status: 404 });
  try {
    await captureEnvironmentalSnapshot(db, {
      ownerId: user.id,
      tripId: Number(row.tripId),
      fishingSetId: Number(row.id),
      latitude: row.startLatitude == null ? null : Number(row.startLatitude),
      longitude: row.startLongitude == null ? null : Number(row.startLongitude),
      referenceTime: String(row.startedAt),
      force: true,
    });
  } catch (error) {
    console.error("environmental snapshot on set update", error);
  }
  return Response.json(row);
}
