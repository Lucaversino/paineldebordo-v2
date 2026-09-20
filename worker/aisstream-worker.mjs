import http from "node:http";
import WebSocket from "ws";
import postgres from "postgres";

const AIS_URL = "wss://stream.aisstream.io/v0/stream";
const SERVICE = "aisstream-worker";
const MESSAGE_TYPES = [
  "PositionReport",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
  "LongRangeAisBroadcastMessage",
  "ShipStaticData",
  "StaticDataReport",
];

const DEFAULT_BOUNDING_BOXES = [
  [[-20.5, -46.5], [-25.8, -39.0]],
  [[-24.5, -52.5], [-30.5, -43.5]],
  [[-28.5, -55.0], [-35.5, -46.0]],
];

const apiKey = String(process.env.AISSTREAM_API_KEY || "").trim();
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const port = Math.max(1, Number(process.env.PORT || 3001) || 3001);
const flushMs = Math.max(500, Number(process.env.AISSTREAM_FLUSH_MS || 1500) || 1500);
const pruneHours = Math.max(1, Number(process.env.AISSTREAM_PRUNE_HOURS || 48) || 48);

if (!apiKey) {
  console.error("[AISStream worker] AISSTREAM_API_KEY ausente.");
  process.exit(1);
}
if (!databaseUrl) {
  console.error("[AISStream worker] DATABASE_URL ausente.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  prepare: false,
  max: 2,
  idle_timeout: 20,
  connect_timeout: 10,
});

function normalizeBoxes(raw) {
  if (!raw) return DEFAULT_BOUNDING_BOXES;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_BOUNDING_BOXES;
    const boxes = parsed.filter((box) =>
      Array.isArray(box) &&
      box.length === 2 &&
      box.every((point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
      )
    ).map((box) => [
      [Number(box[0][0]), Number(box[0][1])],
      [Number(box[1][0]), Number(box[1][1])],
    ]);
    return boxes.length ? boxes : DEFAULT_BOUNDING_BOXES;
  } catch {
    return DEFAULT_BOUNDING_BOXES;
  }
}

const boundingBoxes = normalizeBoxes(process.env.AISSTREAM_BOUNDING_BOXES_JSON);

const state = {
  connected: false,
  subscribed: false,
  reconnectAttempt: 0,
  lastMessageAt: null,
  lastPersistAt: null,
  lastError: null,
  startedAt: new Date(),
  vesselCount: 0,
};

const staticByMmsi = new Map();
const pendingPositions = new Map();
const pendingStatic = new Map();
let socket = null;
let reconnectTimer = null;
let pingTimer = null;
let flushTimer = null;
let heartbeatTimer = null;
let pruneTimer = null;
let shuttingDown = false;

function text(value) {
  return value == null ? "" : String(value).trim();
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function navStatusText(value) {
  const n = Number(value);
  const labels = {
    0: "Em navegação a motor",
    1: "Fundeado",
    2: "Sem comando",
    3: "Manobra restrita",
    4: "Restrito pelo calado",
    5: "Atracado",
    6: "Encalhado",
    7: "Em pesca",
    8: "À vela",
    14: "AIS-SART",
    15: "Não definido",
  };
  return Number.isFinite(n) ? labels[n] || `Status AIS ${n}` : "";
}

function shipTypeText(value) {
  const raw = text(value);
  const n = Number(raw);
  if (Number.isFinite(n) && n === 30) return "Fishing vessel (30)";
  return raw;
}

function eventBody(event, type) {
  return event?.Message?.[type] || {};
}

function parseStatic(event) {
  const type = text(event?.MessageType);
  if (type !== "ShipStaticData" && type !== "StaticDataReport") return null;
  const meta = event?.MetaData || {};
  const payload = eventBody(event, type);
  const reportA = payload?.ReportA || payload?.reportA || {};
  const reportB = payload?.ReportB || payload?.reportB || {};
  const mmsi = text(meta?.MMSI ?? payload?.UserID ?? reportA?.UserID ?? reportB?.UserID).replace(/\D/g, "");
  if (!mmsi) return null;

  const info = {
    mmsi,
    name: text(meta?.ShipName || payload?.Name || payload?.ShipName || reportA?.Name || reportA?.ShipName),
    callsign: text(payload?.CallSign || reportB?.CallSign),
    destination: text(payload?.Destination || reportB?.Destination),
    imo: text(payload?.ImoNumber ?? payload?.IMO ?? reportB?.ImoNumber ?? reportB?.IMO).replace(/\D/g, ""),
    vessel_type: shipTypeText(payload?.Type ?? payload?.ShipType ?? payload?.TypeAndCargo ?? reportB?.Type ?? reportB?.ShipType ?? reportB?.TypeAndCargo),
    static_updated_at: new Date(),
  };
  return info;
}

function parsePosition(event) {
  const type = text(event?.MessageType);
  if (!["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport", "LongRangeAisBroadcastMessage"].includes(type)) {
    return null;
  }
  const meta = event?.MetaData || {};
  const payload = eventBody(event, type);
  const mmsi = text(meta?.MMSI ?? payload?.UserID ?? payload?.SourceID).replace(/\D/g, "");
  const lat = numberOrNull(meta?.Latitude ?? payload?.Latitude);
  const lon = numberOrNull(meta?.Longitude ?? payload?.Longitude);
  if (!mmsi || lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const staticInfo = staticByMmsi.get(mmsi) || {};
  const providerTime = text(meta?.time_utc ?? meta?.TimeUtc ?? meta?.TimeUTC ?? meta?.Timestamp ?? meta?.timestamp);
  const parsedProviderTime = providerTime && !Number.isNaN(new Date(providerTime).getTime())
    ? new Date(providerTime)
    : new Date();

  const heading = numberOrNull(payload?.TrueHeading ?? payload?.Heading);
  const navStatus = numberOrNull(payload?.NavigationalStatus ?? payload?.NavStatus);
  return {
    mmsi,
    imo: staticInfo.imo || "",
    name: text(meta?.ShipName) || staticInfo.name || `MMSI ${mmsi}`,
    callsign: staticInfo.callsign || "",
    vessel_type: staticInfo.vessel_type || "",
    destination: staticInfo.destination || "",
    lat,
    lon,
    sog: numberOrNull(payload?.Sog ?? payload?.Speed ?? payload?.SpeedOverGround),
    cog: numberOrNull(payload?.Cog ?? payload?.Course ?? payload?.CourseOverGround),
    heading: heading != null && heading < 511 ? heading : null,
    nav_status: navStatus,
    nav_status_text: navStatusText(navStatus),
    message_type: type,
    source: "AISStream",
    position_received: parsedProviderTime,
    last_seen_at: new Date(),
    static_updated_at: staticInfo.static_updated_at || null,
    updated_at: new Date(),
  };
}

async function persistStatus() {
  try {
    await sql`
      insert into public.ais_live_worker_status (
        service, connected, subscribed, last_message_at, last_persist_at,
        vessel_count, reconnect_attempt, last_error, started_at, updated_at
      ) values (
        ${SERVICE}, ${state.connected}, ${state.subscribed}, ${state.lastMessageAt},
        ${state.lastPersistAt}, ${state.vesselCount}, ${state.reconnectAttempt},
        ${state.lastError}, ${state.startedAt}, now()
      )
      on conflict (service) do update set
        connected = excluded.connected,
        subscribed = excluded.subscribed,
        last_message_at = excluded.last_message_at,
        last_persist_at = excluded.last_persist_at,
        vessel_count = excluded.vessel_count,
        reconnect_attempt = excluded.reconnect_attempt,
        last_error = excluded.last_error,
        started_at = excluded.started_at,
        updated_at = now()
    `;
  } catch (error) {
    console.error("[AISStream worker] falha ao persistir status:", error?.message || error);
  }
}

async function flush() {
  if (pendingPositions.size === 0 && pendingStatic.size === 0) return;

  const positions = [...pendingPositions.values()];
  const staticUpdates = [...pendingStatic.values()];
  pendingPositions.clear();
  pendingStatic.clear();

  try {
    await sql.begin(async (tx) => {
      if (positions.length) {
        const columns = [
          "mmsi", "imo", "name", "callsign", "vessel_type", "destination",
          "lat", "lon", "sog", "cog", "heading", "nav_status", "nav_status_text",
          "message_type", "source", "position_received", "last_seen_at",
          "static_updated_at", "updated_at",
        ];
        await tx`
          insert into public.ais_live_vessels ${tx(positions, ...columns)}
          on conflict (mmsi) do update set
            imo = coalesce(nullif(excluded.imo, ''), public.ais_live_vessels.imo),
            name = coalesce(nullif(excluded.name, ''), public.ais_live_vessels.name),
            callsign = coalesce(nullif(excluded.callsign, ''), public.ais_live_vessels.callsign),
            vessel_type = coalesce(nullif(excluded.vessel_type, ''), public.ais_live_vessels.vessel_type),
            destination = coalesce(nullif(excluded.destination, ''), public.ais_live_vessels.destination),
            lat = excluded.lat,
            lon = excluded.lon,
            sog = excluded.sog,
            cog = excluded.cog,
            heading = excluded.heading,
            nav_status = excluded.nav_status,
            nav_status_text = excluded.nav_status_text,
            message_type = excluded.message_type,
            source = excluded.source,
            position_received = excluded.position_received,
            last_seen_at = excluded.last_seen_at,
            static_updated_at = coalesce(excluded.static_updated_at, public.ais_live_vessels.static_updated_at),
            updated_at = now()
        `;
      }

      for (const item of staticUpdates) {
        await tx`
          update public.ais_live_vessels set
            imo = coalesce(nullif(${item.imo}, ''), imo),
            name = coalesce(nullif(${item.name}, ''), name),
            callsign = coalesce(nullif(${item.callsign}, ''), callsign),
            vessel_type = coalesce(nullif(${item.vessel_type}, ''), vessel_type),
            destination = coalesce(nullif(${item.destination}, ''), destination),
            static_updated_at = ${item.static_updated_at},
            updated_at = now()
          where mmsi = ${item.mmsi}
        `;
      }
    });

    state.lastPersistAt = new Date();
    const [{ count }] = await sql`select count(*)::int as count from public.ais_live_vessels`;
    state.vesselCount = Number(count || 0);
  } catch (error) {
    for (const row of positions) pendingPositions.set(row.mmsi, row);
    for (const item of staticUpdates) pendingStatic.set(item.mmsi, item);
    state.lastError = error?.message || String(error);
    console.error("[AISStream worker] falha ao gravar lote:", state.lastError);
  }
}

async function pruneOldRows() {
  try {
    await sql`
      delete from public.ais_live_vessels
      where last_seen_at < now() - (${pruneHours}::text || ' hours')::interval
    `;
  } catch (error) {
    console.error("[AISStream worker] falha ao limpar posições antigas:", error?.message || error);
  }
}

function subscriptionPayload() {
  return JSON.stringify({
    APIKey: apiKey,
    BoundingBoxes: boundingBoxes,
    FilterMessageTypes: MESSAGE_TYPES,
  });
}

function clearSocketTimers() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;
  const exponent = Math.min(5, state.reconnectAttempt);
  const delay = Math.min(30000, 1000 * (2 ** exponent)) + Math.floor(Math.random() * 600);
  state.reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
  console.warn(`[AISStream worker] reconectando em ${Math.ceil(delay / 1000)}s`);
}

function connect() {
  if (shuttingDown) return;
  clearSocketTimers();
  state.connected = false;
  state.subscribed = false;

  const ws = new WebSocket(AIS_URL, {
    perMessageDeflate: true,
    handshakeTimeout: 10000,
  });
  socket = ws;

  ws.on("open", () => {
    state.connected = true;
    state.subscribed = false;
    state.reconnectAttempt = 0;
    state.lastError = null;

    // AISStream exige uma assinatura completa logo após abrir a conexão.
    ws.send(subscriptionPayload());

    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.ping(); } catch {}
      }
    }, 20000);

    void persistStatus();
    console.info("[AISStream worker] conexão aberta e assinatura enviada.");
  });

  ws.on("message", (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return;
    }

    state.lastMessageAt = new Date();
    if (event?.MessageType === "SubscriptionConfirmation") {
      state.subscribed = true;
      console.info("[AISStream worker] assinatura confirmada.", {
        compression: Boolean(event?.Message?.CompressionEnabled),
        boxes: boundingBoxes.length,
      });
      void persistStatus();
      return;
    }

    const staticInfo = parseStatic(event);
    if (staticInfo) {
      const previous = staticByMmsi.get(staticInfo.mmsi) || {};
      const merged = { ...previous, ...staticInfo };
      staticByMmsi.set(staticInfo.mmsi, merged);
      pendingStatic.set(staticInfo.mmsi, merged);
      return;
    }

    const position = parsePosition(event);
    if (position) {
      pendingPositions.set(position.mmsi, position);
    }
  });

  ws.on("error", (error) => {
    state.lastError = error?.message || String(error);
    console.error("[AISStream worker] websocket:", state.lastError);
  });

  ws.on("close", (code, reason) => {
    if (socket === ws) socket = null;
    clearSocketTimers();
    state.connected = false;
    state.subscribed = false;
    if (reason?.length) state.lastError = `close ${code}: ${reason.toString()}`;
    void persistStatus();
    if (!shuttingDown) scheduleReconnect();
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    const healthy = state.connected && state.subscribed;
    res.writeHead(healthy ? 200 : 503, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: healthy,
      service: SERVICE,
      connected: state.connected,
      subscribed: state.subscribed,
      lastMessageAt: state.lastMessageAt,
      lastPersistAt: state.lastPersistAt,
      vesselCount: state.vesselCount,
      reconnectAttempt: state.reconnectAttempt,
      lastError: state.lastError,
      boundingBoxes,
    }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("PAINEL DE BORDO · AISStream worker");
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[AISStream worker] encerrando por ${signal}...`);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (flushTimer) clearInterval(flushTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (pruneTimer) clearInterval(pruneTimer);
  clearSocketTimers();
  try { socket?.close(); } catch {}
  await flush().catch(() => null);
  state.connected = false;
  state.subscribed = false;
  await persistStatus().catch(() => null);
  await sql.end({ timeout: 5 }).catch(() => null);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

server.listen(port, "0.0.0.0", () => {
  console.info(`[AISStream worker] health server em :${port}`);
});

flushTimer = setInterval(() => void flush(), flushMs);
heartbeatTimer = setInterval(() => void persistStatus(), 15000);
pruneTimer = setInterval(() => void pruneOldRows(), 60 * 60 * 1000);

void pruneOldRows();
void persistStatus();
connect();
