import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { boats, catches, fishingSets, species, trips } from "../../../db/schema";
import { requirePanelUserResponse } from "../../../lib/panelAuth";

export const runtime = "nodejs";

const MAX_RECORDS = 12000;

type AnyRow = Record<string, any>;

type NormalizedBackup = {
  boats: AnyRow[];
  species: AnyRow[];
  trips: AnyRow[];
  sets: AnyRow[];
  catches: AnyRow[];
};

function arr(root: AnyRow, ...names: string[]) {
  for (const name of names) if (Array.isArray(root?.[name])) return root[name] as AnyRow[];
  return [];
}

function normalizeRoot(input: unknown): NormalizedBackup {
  const raw = (input && typeof input === "object" ? input : {}) as AnyRow;
  const root = raw.backup && typeof raw.backup === "object" ? raw.backup : raw.data && typeof raw.data === "object" ? raw.data : raw;
  return {
    boats: arr(root, "boats", "embarcacoes", "vessels"),
    species: arr(root, "species", "especies"),
    trips: arr(root, "trips", "viagens"),
    sets: arr(root, "sets", "fishingSets", "largadas"),
    catches: arr(root, "catches", "capturas"),
  };
}

function key(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function first(row: AnyRow, ...names: string[]) {
  for (const name of names) {
    const value = row?.[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function text(row: AnyRow, names: string[], fallback = "") {
  const value = first(row, ...names);
  return value == null ? fallback : String(value).trim();
}

function numValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value).trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s.replace(/[^0-9+\-.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function num(row: AnyRow, names: string[], fallback: number | null = null) {
  const value = first(row, ...names);
  return numValue(value) ?? fallback;
}

function bool(row: AnyRow, names: string[], fallback = true) {
  const value = first(row, ...names);
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  return !["0", "false", "nao", "não", "inativo"].includes(String(value).toLowerCase());
}

function iso(value: unknown, fallback?: string | null) {
  if (value == null || value === "") return fallback ?? null;
  const raw = String(value).trim();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const candidate = br
    ? `${br[3]}-${br[2]}-${br[1]}T${String(br[4] || "00").padStart(2, "0")}:${br[5] || "00"}:${br[6] || "00"}`
    : raw;
  const date = new Date(candidate);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback ?? null;
}

function status(value: unknown) {
  const s = String(value || "").trim().toUpperCase();
  if (["FINISHED", "FINALIZADA", "FINALIZADO", "CONCLUIDA", "CONCLUÍDA"].includes(s)) return "FINISHED";
  if (["IN_PROGRESS", "EM ANDAMENTO", "ANDAMENTO", "ATIVA"].includes(s)) return "IN_PROGRESS";
  if (["CANCELLED", "CANCELADA", "CANCELADO"].includes(s)) return "CANCELLED";
  return "PLANNED";
}

function catchType(value: unknown) {
  const s = String(value || "").trim().toUpperCase();
  if (["MIXTURE", "MISTURA"].includes(s)) return "MIXTURE";
  if (["DISCARD", "DESCARTE"].includes(s)) return "DISCARD";
  return "PRIMARY";
}

function ref(row: AnyRow, ...names: string[]) {
  return key(first(row, ...names));
}

function totalRecords(b: NormalizedBackup) {
  return b.boats.length + b.species.length + b.trips.length + b.sets.length + b.catches.length;
}

function getSetSyntheticWeight(row: AnyRow) {
  return num(row, ["total", "weightKg", "pesoKg", "capturaKg", "dailyCatchKg", "capture", "captura"], 0) || 0;
}

function preview(backup: NormalizedBackup) {
  const issues: string[] = [];
  const boatIds = new Set(backup.boats.map((x) => ref(x, "id", "boatId", "legacyId")).filter(Boolean));
  const speciesIds = new Set(backup.species.map((x) => ref(x, "id", "speciesId", "legacyId")).filter(Boolean));
  const tripIds = new Set(backup.trips.map((x) => ref(x, "id", "tripId", "legacyId")).filter(Boolean));
  const setIds = new Set(backup.sets.map((x) => ref(x, "id", "fishingSetId", "setId", "legacyId")).filter(Boolean));

  for (const trip of backup.trips) {
    const boat = ref(trip, "boatId", "boat_id", "embarcacaoId", "vesselId");
    if (boat && !boatIds.has(boat)) issues.push(`Viagem ${text(trip, ["name", "nome"], "sem nome")}: embarcação ${boat} não está no backup.`);
    const sp = ref(trip, "primarySpeciesId", "primary_species_id", "speciesId", "especieId");
    if (sp && !speciesIds.has(sp)) issues.push(`Viagem ${text(trip, ["name", "nome"], "sem nome")}: espécie ${sp} não está no backup.`);
  }
  for (const set of backup.sets) {
    const trip = ref(set, "tripId", "trip_id", "viagemId");
    if (trip && !tripIds.has(trip)) issues.push(`Largada #${text(set, ["setNumber", "numero", "number"], "?")}: viagem ${trip} não está no backup.`);
  }
  for (const item of backup.catches) {
    const set = ref(item, "fishingSetId", "fishing_set_id", "setId", "largadaId");
    if (set && !setIds.has(set)) issues.push(`Captura: largada ${set} não está no backup.`);
  }

  const explicitSetRefs = new Set(backup.catches.map((x) => ref(x, "fishingSetId", "fishing_set_id", "setId", "largadaId")).filter(Boolean));
  const synthetic = backup.sets.filter((row) => {
    const id = ref(row, "id", "fishingSetId", "setId", "legacyId");
    return getSetSyntheticWeight(row) > 0 && (!id || !explicitSetRefs.has(id));
  }).length;

  return {
    counts: {
      boats: backup.boats.length,
      species: backup.species.length,
      trips: backup.trips.length,
      sets: backup.sets.length,
      catches: backup.catches.length,
      syntheticCatches: synthetic,
      total: totalRecords(backup),
    },
    issues: issues.slice(0, 30),
    valid: totalRecords(backup) > 0 && issues.length === 0,
  };
}

async function ensureCorvina(tx: any, ownerId: string) {
  const [existing] = await tx.select({ id: species.id }).from(species)
    .where(and(eq(species.ownerId, ownerId), sql`lower(${species.commonName}) = 'corvina'`)).limit(1);
  if (existing) return existing.id;
  const [created] = await tx.insert(species).values({ ownerId, commonName: "Corvina", code: "CORVINA", active: true }).returning({ id: species.id });
  return created.id;
}

export async function POST(request: Request) {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const user = auth.user!;

  let body: AnyRow;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "O arquivo JSON é inválido." }, { status: 400 });
  }

  const backup = normalizeRoot(body.backup ?? body);
  if (totalRecords(backup) === 0) return Response.json({ error: "Nenhum dado reconhecido no backup." }, { status: 400 });
  if (totalRecords(backup) > MAX_RECORDS) return Response.json({ error: `Backup muito grande. Limite: ${MAX_RECORDS} registros.` }, { status: 413 });

  const checked = preview(backup);
  if (body.mode === "preview") return Response.json(checked);
  if (checked.issues.length) return Response.json({ error: "O backup possui referências quebradas.", ...checked }, { status: 400 });

  const db = getDb();
  const summary = await db.transaction(async (tx) => {
    const boatMap = new Map<string, number>();
    const speciesMap = new Map<string, number>();
    const tripMap = new Map<string, number>();
    const setMap = new Map<string, number>();
    const result = {
      boats: { imported: 0, reused: 0 },
      species: { imported: 0, reused: 0 },
      trips: { imported: 0, reused: 0 },
      sets: { imported: 0, reused: 0 },
      catches: { imported: 0, reused: 0, synthesized: 0 },
    };

    const corvinaId = await ensureCorvina(tx, user.id);

    for (const row of backup.boats) {
      const oldId = ref(row, "id", "boatId", "legacyId");
      const name = text(row, ["name", "nome"], "Embarcação importada") || "Embarcação importada";
      const registration = text(row, ["registration", "matricula", "registro", "registrationNumber"], oldId ? `LEGACY-${oldId}` : `LEGACY-${crypto.randomUUID().slice(0, 8)}`);
      const [existing] = await tx.select({ id: boats.id }).from(boats)
        .where(and(eq(boats.ownerId, user.id), eq(boats.registration, registration))).limit(1);
      let id: number;
      if (existing) {
        id = existing.id;
        result.boats.reused++;
      } else {
        const [created] = await tx.insert(boats).values({
          ownerId: user.id,
          name,
          registration,
          owner: text(row, ["owner", "proprietario"], "") || null,
          homePort: text(row, ["homePort", "home_port", "portoBase", "porto"], "") || null,
          storageCapacityKg: num(row, ["storageCapacityKg", "storage_capacity_kg", "capacity", "capacidadeKg"]),
          lengthMeters: num(row, ["lengthMeters", "length_meters", "comprimentoMetros"]),
          active: bool(row, ["active", "ativo"], true),
          notes: text(row, ["notes", "observacoes"], "") || null,
        }).returning({ id: boats.id });
        id = created.id;
        result.boats.imported++;
      }
      if (oldId) boatMap.set(oldId, id);
    }

    for (const row of backup.species) {
      const oldId = ref(row, "id", "speciesId", "legacyId");
      const name = text(row, ["commonName", "common_name", "name", "nome"], "");
      if (!name) continue;
      const [existing] = await tx.select({ id: species.id }).from(species)
        .where(and(eq(species.ownerId, user.id), sql`lower(${species.commonName}) = ${name.toLowerCase()}`)).limit(1);
      let id: number;
      if (existing) {
        id = existing.id;
        result.species.reused++;
      } else {
        const [created] = await tx.insert(species).values({
          ownerId: user.id,
          commonName: name,
          scientificName: text(row, ["scientificName", "scientific_name", "nomeCientifico"], "") || null,
          code: text(row, ["code", "codigo"], "") || null,
          active: bool(row, ["active", "ativo"], true),
        }).returning({ id: species.id });
        id = created.id;
        result.species.imported++;
      }
      if (oldId) speciesMap.set(oldId, id);
    }

    const defaultBoatId = boatMap.values().next().value as number | undefined;
    for (const row of backup.trips) {
      const oldId = ref(row, "id", "tripId", "legacyId");
      const boatLegacy = ref(row, "boatId", "boat_id", "embarcacaoId", "vesselId");
      const boatId = boatMap.get(boatLegacy) ?? defaultBoatId;
      if (!boatId) throw new Error(`A viagem ${text(row, ["name", "nome"], "sem nome")} não possui embarcação válida.`);
      const speciesLegacy = ref(row, "primarySpeciesId", "primary_species_id", "speciesId", "especieId");
      const primarySpeciesId = speciesMap.get(speciesLegacy) ?? corvinaId;
      const departureDate = iso(first(row, "departureDate", "departure_date", "dataSaida"), new Date().toISOString())!;
      const expectedReturnDate = iso(first(row, "expectedReturnDate", "expected_return_date", "retornoPrevisto", "dataRetornoPrevista"), departureDate)!;
      const tripName = text(row, ["name", "nome"], oldId ? `Viagem ${oldId}` : "Viagem importada");
      const [existing] = await tx.select({ id: trips.id }).from(trips)
        .where(and(eq(trips.ownerId, user.id), eq(trips.boatId, boatId), eq(trips.name, tripName), eq(trips.departureDate, departureDate))).limit(1);
      let id: number;
      if (existing) {
        id = existing.id;
        result.trips.reused++;
      } else {
        const normalizedStatus = status(first(row, "status", "situacao"));
        const [created] = await tx.insert(trips).values({
          ownerId: user.id,
          name: tripName,
          boatId,
          departureDate,
          expectedReturnDate,
          returnDate: iso(first(row, "returnDate", "return_date", "dataRetorno", "dataChegada")),
          departurePort: text(row, ["departurePort", "departure_port", "portoSaida"], "Não informado") || "Não informado",
          returnPort: text(row, ["returnPort", "return_port", "portoRetorno"], "Não informado") || "Não informado",
          captain: text(row, ["captain", "mestre", "capitao"], "Não informado") || "Não informado",
          crewCount: Math.max(1, Math.round(num(row, ["crewCount", "crew_count", "tripulantes"], 1) || 1)),
          targetKg: Math.max(1, num(row, ["targetKg", "target_kg", "target", "metaKg", "meta"], 1) || 1),
          primarySpeciesId,
          fishingType: text(row, ["fishingType", "fishing_type", "tipoPesca"], "Rede de emalhe") || "Rede de emalhe",
          status: normalizedStatus,
          notes: text(row, ["notes", "observacoes"], "") || null,
          createdBy: user.id,
          updatedBy: user.id,
          createdAt: iso(first(row, "createdAt", "created_at"), new Date().toISOString())!,
          updatedAt: iso(first(row, "updatedAt", "updated_at"), new Date().toISOString())!,
        }).returning({ id: trips.id });
        id = created.id;
        result.trips.imported++;
      }
      if (oldId) tripMap.set(oldId, id);
    }

    const tripPrimary = new Map<number, number>();
    const importedTripIds = [...new Set(tripMap.values())];
    for (const id of importedTripIds) {
      const [row] = await tx.select({ id: trips.id, primarySpeciesId: trips.primarySpeciesId }).from(trips).where(eq(trips.id, id)).limit(1);
      if (row) tripPrimary.set(id, row.primarySpeciesId || corvinaId);
    }

    for (const row of backup.sets) {
      const oldId = ref(row, "id", "fishingSetId", "setId", "legacyId");
      const tripLegacy = ref(row, "tripId", "trip_id", "viagemId");
      const tripId = tripMap.get(tripLegacy);
      if (!tripId) throw new Error(`Largada ${oldId || "sem id"} sem viagem correspondente.`);
      const setNumber = Math.max(1, Math.round(num(row, ["setNumber", "set_number", "number", "numero", "largada"], 1) || 1));
      const fallbackDate = first(row, "date", "data", "fishingDate");
      const startTime = text(row, ["startTime", "horaInicial", "horarioInicial"], "00:00");
      const endTime = text(row, ["endTime", "horaFinal", "horarioFinal"], "");
      const startedAt = iso(first(row, "startedAt", "started_at"), fallbackDate ? iso(`${fallbackDate} ${startTime}`) : new Date().toISOString())!;
      const finishedAt = iso(first(row, "finishedAt", "finished_at"), fallbackDate && endTime ? iso(`${fallbackDate} ${endTime}`) : null);
      const [existing] = await tx.select({ id: fishingSets.id }).from(fishingSets)
        .where(and(eq(fishingSets.tripId, tripId), eq(fishingSets.setNumber, setNumber))).limit(1);
      let id: number;
      if (existing) {
        id = existing.id;
        result.sets.reused++;
      } else {
        const [created] = await tx.insert(fishingSets).values({
          tripId,
          setNumber,
          startedAt,
          finishedAt,
          startLatitude: num(row, ["startLatitude", "start_latitude", "latitudeInicial", "latInicial"]),
          startLongitude: num(row, ["startLongitude", "start_longitude", "longitudeInicial", "lonInicial", "lngInicial"]),
          endLatitude: num(row, ["endLatitude", "end_latitude", "latitudeFinal", "latFinal"]),
          endLongitude: num(row, ["endLongitude", "end_longitude", "longitudeFinal", "lonFinal", "lngFinal"]),
          depthMeters: num(row, ["depthMeters", "depth_meters", "profundidade", "profundidadeMetros"]),
          netLengthMeters: num(row, ["netLengthMeters", "net_length_meters", "metrosRede", "comprimentoRede"]),
          netHeightMeters: num(row, ["netHeightMeters", "net_height_meters", "alturaRede"]),
          meshSize: num(row, ["meshSize", "mesh_size", "malha"]),
          netQuantity: num(row, ["netQuantity", "net_quantity", "quantidadeRedes"]),
          soakTimeMinutes: num(row, ["soakTimeMinutes", "soak_time_minutes", "tempoImersaoMin"]),
          waterTemperature: num(row, ["waterTemperature", "water_temperature", "temperaturaAgua"]),
          notes: text(row, ["notes", "observacoes"], "") || null,
          createdAt: iso(first(row, "createdAt", "created_at"), new Date().toISOString())!,
        }).returning({ id: fishingSets.id });
        id = created.id;
        result.sets.imported++;
      }
      if (oldId) setMap.set(oldId, id);
    }

    const explicitSetRefs = new Set(backup.catches.map((x) => ref(x, "fishingSetId", "fishing_set_id", "setId", "largadaId")).filter(Boolean));

    async function insertCatch(row: AnyRow, synthesized = false) {
      const tripLegacy = ref(row, "tripId", "trip_id", "viagemId");
      const setLegacy = ref(row, "fishingSetId", "fishing_set_id", "setId", "largadaId");
      const fishingSetId = setMap.get(setLegacy);
      let tripId = tripMap.get(tripLegacy);
      if (!fishingSetId) throw new Error(`Captura sem largada correspondente (${setLegacy || "sem id"}).`);
      if (!tripId) {
        const [setRow] = await tx.select({ tripId: fishingSets.tripId }).from(fishingSets).where(eq(fishingSets.id, fishingSetId)).limit(1);
        tripId = setRow?.tripId;
      }
      if (!tripId) throw new Error("Captura sem viagem correspondente.");
      const speciesLegacy = ref(row, "speciesId", "species_id", "especieId");
      const speciesId = speciesMap.get(speciesLegacy) ?? tripPrimary.get(tripId) ?? corvinaId;
      const weightKg = Math.max(0, num(row, ["weightKg", "weight_kg", "pesoKg", "peso", "total"], 0) || 0);
      if (weightKg <= 0) return;
      const type = catchType(first(row, "catchType", "catch_type", "tipo", "categoria"));
      const caughtAt = iso(first(row, "caughtAt", "caught_at", "dataCaptura"), new Date().toISOString())!;
      const [existing] = await tx.select({ id: catches.id }).from(catches).where(and(
        eq(catches.tripId, tripId),
        eq(catches.fishingSetId, fishingSetId),
        eq(catches.speciesId, speciesId),
        eq(catches.catchType, type),
        eq(catches.weightKg, weightKg),
        eq(catches.caughtAt, caughtAt),
      )).limit(1);
      if (existing) {
        result.catches.reused++;
        return;
      }
      await tx.insert(catches).values({
        tripId,
        fishingSetId,
        speciesId,
        catchType: type,
        weightKg,
        caughtAt,
        notes: text(row, ["notes", "observacoes"], synthesized ? "Captura criada automaticamente a partir do total da largada no backup." : "") || null,
        createdBy: user.id,
        createdAt: iso(first(row, "createdAt", "created_at"), new Date().toISOString())!,
      });
      result.catches.imported++;
      if (synthesized) result.catches.synthesized++;
    }

    for (const row of backup.catches) await insertCatch(row, false);

    for (const setRow of backup.sets) {
      const legacySetId = ref(setRow, "id", "fishingSetId", "setId", "legacyId");
      const weight = getSetSyntheticWeight(setRow);
      if (weight <= 0 || (legacySetId && explicitSetRefs.has(legacySetId))) continue;
      await insertCatch({
        tripId: first(setRow, "tripId", "trip_id", "viagemId"),
        fishingSetId: first(setRow, "id", "fishingSetId", "setId", "legacyId"),
        weightKg: weight,
        catchType: "PRIMARY",
        caughtAt: first(setRow, "finishedAt", "finished_at", "startedAt", "started_at", "date", "data"),
      }, true);
    }

    return result;
  });

  return Response.json({ ok: true, message: "Backup importado com sucesso.", summary });
}
