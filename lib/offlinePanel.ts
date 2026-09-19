type OfflineQueueItem = {
  id: string;
  url: string;
  method: "POST" | "PUT" | "DELETE";
  body: any;
  createdAt: string;
  localSetId?: number;
  lastError?: string;
};

const DASHBOARD_CACHE_KEY = "painel-bordo-offline-dashboard-v1";
const MANAGE_CACHE_KEY = "painel-bordo-offline-manage-v1";
const QUEUE_KEY = "painel-bordo-offline-queue-v1";
const SET_MAP_KEY = "painel-bordo-offline-set-map-v1";
export const OFFLINE_QUEUE_EVENT = "painel-offline-queue-changed";
export const OFFLINE_SYNC_EVENT = "painel-offline-sync-complete";

function browser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!browser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!browser()) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function emitQueueChange() {
  if (!browser()) return;
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT, { detail: { pending: getOfflineQueueCount() } }));
}

export function cacheOfflineDashboard(value: any) {
  if (value) writeJson(DASHBOARD_CACHE_KEY, value);
}

export function getOfflineDashboard() {
  return readJson<any | null>(DASHBOARD_CACHE_KEY, null);
}

export function cacheOfflineManage(value: any) {
  if (value) writeJson(MANAGE_CACHE_KEY, value);
}

export function getOfflineManage() {
  return readJson<any | null>(MANAGE_CACHE_KEY, null);
}

export function getOfflineQueueCount() {
  return readJson<OfflineQueueItem[]>(QUEUE_KEY, []).length;
}

export function clearOfflinePanelData() {
  if (!browser()) return;
  [DASHBOARD_CACHE_KEY, MANAGE_CACHE_KEY, QUEUE_KEY, SET_MAP_KEY].forEach((key) => {
    try { localStorage.removeItem(key); } catch {}
  });
  emitQueueChange();
}

function compactCoordinate(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(digits)) return null;
  const degrees = Number(digits.slice(0, 2));
  const minutes = Number(`${digits.slice(2, 4)}.${digits.slice(4)}`);
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || minutes >= 60) return null;
  return -(degrees + minutes / 60);
}

function localId() {
  return -(Date.now() * 1000 + Math.floor(Math.random() * 999));
}

function patchDaily(daily: any[], day: string, delta: number) {
  const rows = Array.isArray(daily) ? daily.map((row) => ({ ...row })) : [];
  const found = rows.find((row) => String(row.day).slice(0, 10) === day);
  if (found) found.kg = Number(found.kg || 0) + delta;
  else rows.push({ day, kg: delta });
  return rows.sort((a, b) => String(a.day).localeCompare(String(b.day)));
}

export function applyOfflineDashboardMutation(current: any, body: any, forcedLocalSetId?: number) {
  const next = current ? structuredClone(current) : null;
  if (!next?.trip || Number(next.trip.id) !== Number(body?.tripId)) return next || current;

  if (body.action === "set") {
    const setId = forcedLocalSetId ?? localId();
    const primary = Number(body.weightKg || 0);
    const mixture = Number(body.mixtureWeightKg || 0);
    const discard = Number(body.discardWeightKg || 0);
    const existing = Array.isArray(next.sets) ? next.sets : [];
    const setNumber = existing.reduce((max: number, item: any) => Math.max(max, Number(item.setNumber || 0)), 0) + 1;
    const startedAt = `${body.fishingDate}T${body.startTime}:00`;
    next.sets = [...existing, {
      id: setId,
      setNumber,
      startedAt,
      finishedAt: `${body.fishingDate}T${body.endTime}:00`,
      depthMeters: Number(body.depthMeters || 0),
      startLatitude: compactCoordinate(body.startLatitude),
      startLongitude: compactCoordinate(body.startLongitude),
      endLatitude: compactCoordinate(body.endLatitude),
      endLongitude: compactCoordinate(body.endLongitude),
      total: primary + mixture,
      offlinePending: true,
    }];
    next.corvinaTotal = Number(next.corvinaTotal || 0) + primary;
    next.total = Number(next.total || 0) + primary;
    next.mixtureTotal = Number(next.mixtureTotal || 0) + mixture;
    next.discardTotal = Number(next.discardTotal || 0) + discard;
    next.setCount = Number(next.setCount || 0) + 1;
    next.daily = patchDaily(next.daily, String(body.fishingDate), primary);
    return next;
  }

  const setId = Number(body.fishingSetId);
  const weight = Number(body.weightKg || 0);
  if (!weight) return next;

  if (body.action === "capture") {
    next.corvinaTotal = Number(next.corvinaTotal || 0) + weight;
    next.total = Number(next.total || 0) + weight;
    next.sets = (next.sets || []).map((item: any) => Number(item.id) === setId ? { ...item, total: Number(item.total || 0) + weight } : item);
    next.daily = patchDaily(next.daily, new Date().toISOString().slice(0, 10), weight);
  } else if (body.action === "categorizedCatch") {
    if (body.catchType === "MIXTURE") {
      next.mixtureTotal = Number(next.mixtureTotal || 0) + weight;
      next.sets = (next.sets || []).map((item: any) => Number(item.id) === setId ? { ...item, total: Number(item.total || 0) + weight } : item);
    } else if (body.catchType === "DISCARD") {
      next.discardTotal = Number(next.discardTotal || 0) + weight;
    }
  }
  return next;
}

function patchManageMutation(body: any, localSetId?: number) {
  const manage = getOfflineManage();
  if (!manage) return;
  const next = structuredClone(manage);
  const trip = (next.trips || []).find((item: any) => Number(item.id) === Number(body.tripId));

  if (body.action === "set") {
    const id = localSetId ?? localId();
    const primary = Number(body.weightKg || 0);
    const mixture = Number(body.mixtureWeightKg || 0);
    const discard = Number(body.discardWeightKg || 0);
    const sameTrip = (next.sets || []).filter((item: any) => Number(item.tripId) === Number(body.tripId));
    const setNumber = sameTrip.reduce((max: number, item: any) => Math.max(max, Number(item.setNumber || 0)), 0) + 1;
    const startedAt = `${body.fishingDate}T${body.startTime}:00`;
    const finishedAt = `${body.fishingDate}T${body.endTime}:00`;
    next.sets = [{
      id,
      tripId: Number(body.tripId),
      setNumber,
      startedAt,
      finishedAt,
      depthMeters: Number(body.depthMeters || 0),
      startLatitude: compactCoordinate(body.startLatitude),
      startLongitude: compactCoordinate(body.startLongitude),
      endLatitude: compactCoordinate(body.endLatitude),
      endLongitude: compactCoordinate(body.endLongitude),
      total: primary + mixture,
      offlinePending: true,
    }, ...(next.sets || [])];

    const mainSpecies = (next.species || []).find((item: any) => Number(item.id) === Number(body.speciesId));
    const makeCatch = (type: string, speciesId: number, speciesName: string, weightKg: number) => ({
      id: localId(), tripId: Number(body.tripId), fishingSetId: id, speciesId, species: speciesName,
      catchType: type, weightKg, caughtAt: finishedAt, notes: "Aguardando sincronização", offlinePending: true,
    });
    const additions: any[] = [];
    if (primary > 0) additions.push(makeCatch("PRIMARY", Number(body.speciesId), mainSpecies?.commonName || "Corvina", primary));
    if (mixture > 0) {
      const sp = (next.species || []).find((item: any) => Number(item.id) === Number(body.mixtureSpeciesId));
      additions.push(makeCatch("MIXTURE", Number(body.mixtureSpeciesId || 0), String(body.mixtureSpeciesName || sp?.commonName || "Mistura"), mixture));
    }
    if (discard > 0) {
      const sp = (next.species || []).find((item: any) => Number(item.id) === Number(body.discardSpeciesId));
      additions.push(makeCatch("DISCARD", Number(body.discardSpeciesId || 0), String(body.discardSpeciesName || sp?.commonName || "Descarte"), discard));
    }
    next.catches = [...additions, ...(next.catches || [])];
    if (trip) {
      trip.total = Number(trip.total || 0) + primary + mixture;
      trip.corvinaTotal = Number(trip.corvinaTotal || 0) + primary;
      trip.mixtureTotal = Number(trip.mixtureTotal || 0) + mixture;
      trip.discardTotal = Number(trip.discardTotal || 0) + discard;
      trip.sets = Number(trip.sets || 0) + 1;
    }
    cacheOfflineManage(next);
    return;
  }

  const setId = Number(body.fishingSetId);
  const weight = Number(body.weightKg || 0);
  if (!weight) return;
  const targetSet = (next.sets || []).find((item: any) => Number(item.id) === setId);
  const catchType = body.action === "capture" ? "PRIMARY" : String(body.catchType || "");
  const speciesId = body.action === "capture" ? Number(body.speciesId) : Number(body.categorySpeciesId || 0);
  const sp = (next.species || []).find((item: any) => Number(item.id) === speciesId);
  next.catches = [{
    id: localId(), tripId: Number(body.tripId), fishingSetId: setId, speciesId,
    species: String(body.speciesName || sp?.commonName || (catchType === "PRIMARY" ? "Corvina" : "Espécie")),
    catchType, weightKg: weight, caughtAt: new Date().toISOString(), notes: "Aguardando sincronização", offlinePending: true,
  }, ...(next.catches || [])];
  if (targetSet && catchType !== "DISCARD") targetSet.total = Number(targetSet.total || 0) + weight;
  if (trip) {
    if (catchType === "PRIMARY") {
      trip.corvinaTotal = Number(trip.corvinaTotal || 0) + weight;
      trip.total = Number(trip.total || 0) + weight;
    } else if (catchType === "MIXTURE") {
      trip.mixtureTotal = Number(trip.mixtureTotal || 0) + weight;
      trip.total = Number(trip.total || 0) + weight;
    } else if (catchType === "DISCARD") {
      trip.discardTotal = Number(trip.discardTotal || 0) + weight;
    }
  }
  cacheOfflineManage(next);
}

export function queueDashboardMutation(body: any, currentDashboard: any) {
  const queue = readJson<OfflineQueueItem[]>(QUEUE_KEY, []);
  const mutationId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const localSetId = body.action === "set" ? localId() : undefined;
  const entry: OfflineQueueItem = {
    id: mutationId,
    url: "/api/dashboard",
    method: "POST",
    body: { ...body, _offlineMutationId: mutationId },
    createdAt: new Date().toISOString(),
    localSetId,
  };
  queue.push(entry);
  writeJson(QUEUE_KEY, queue);
  const patched = applyOfflineDashboardMutation(currentDashboard, body, localSetId);
  cacheOfflineDashboard(patched);
  patchManageMutation(body, localSetId);
  emitQueueChange();
  return { queued: true, localSetId, pending: queue.length, dashboard: patched };
}

export async function flushOfflineQueue() {
  if (!browser() || !navigator.onLine) return { synced: 0, failed: 0, pending: getOfflineQueueCount() };
  let queue = readJson<OfflineQueueItem[]>(QUEUE_KEY, []);
  const setMap = readJson<Record<string, number>>(SET_MAP_KEY, {});
  let synced = 0;
  let failed = 0;

  for (const original of [...queue]) {
    const item = { ...original, body: { ...original.body } };
    if (Number(item.body?.fishingSetId) < 0) {
      const mapped = setMap[String(item.body.fishingSetId)];
      if (!mapped) {
        failed++;
        continue;
      }
      item.body.fishingSetId = mapped;
    }

    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: { "content-type": "application/json", "x-offline-sync": "1" },
        body: JSON.stringify(item.body),
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) break;
      if (!response.ok) {
        failed++;
        queue = queue.map((queued) => queued.id === original.id ? { ...queued, lastError: result.error || `HTTP ${response.status}` } : queued);
        writeJson(QUEUE_KEY, queue);
        continue;
      }

      if (item.body?.action === "set" && original.localSetId && Number(result?.id) > 0) {
        setMap[String(original.localSetId)] = Number(result.id);
        writeJson(SET_MAP_KEY, setMap);
      }
      queue = queue.filter((queued) => queued.id !== original.id);
      writeJson(QUEUE_KEY, queue);
      synced++;
      emitQueueChange();
    } catch {
      break;
    }
  }

  const pending = queue.length;
  if (synced > 0 && browser()) {
    window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_EVENT, { detail: { synced, pending } }));
  }
  emitQueueChange();
  return { synced, failed, pending };
}
