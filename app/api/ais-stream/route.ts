import { experimental_upgradeWebSocket, type WebSocketData } from "@vercel/functions";
import WebSocket from "ws";
import { getPanelUser } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AIS_URL = "wss://stream.aisstream.io/v0/stream";
const MESSAGE_TYPES = [
  "PositionReport",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
  "LongRangeAisBroadcastMessage",
  "ShipStaticData",
  "StaticDataReport",
];

type BoundingBox = [[number, number], [number, number]];
type ClientEvent = { type: "subscribe"; bbox: BoundingBox } | { type: "ping" };

function send(ws: any, payload: unknown) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(payload));
  } catch {}
}

function normalizeBBox(value: unknown): BoundingBox | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const a = value[0];
  const b = value[1];
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 2 || b.length !== 2) return null;
  let north = Number(a[0]);
  let west = Number(a[1]);
  let south = Number(b[0]);
  let east = Number(b[1]);
  if (![north, west, south, east].every(Number.isFinite)) return null;
  north = Math.max(-90, Math.min(90, north));
  south = Math.max(-90, Math.min(90, south));
  west = Math.max(-180, Math.min(180, west));
  east = Math.max(-180, Math.min(180, east));
  if (north < south) [north, south] = [south, north];
  if (east < west) [east, west] = [west, east];
  const maxSpan = 6;
  const centerLat = (north + south) / 2;
  const centerLon = (east + west) / 2;
  if (north - south > maxSpan) {
    north = Math.min(90, centerLat + maxSpan / 2);
    south = Math.max(-90, centerLat - maxSpan / 2);
  }
  if (east - west > maxSpan) {
    east = Math.min(180, centerLon + maxSpan / 2);
    west = Math.max(-180, centerLon - maxSpan / 2);
  }
  return [
    [Number(north.toFixed(5)), Number(west.toFixed(5))],
    [Number(south.toFixed(5)), Number(east.toFixed(5))],
  ];
}

function subscription(apiKey: string, bbox: BoundingBox) {
  return JSON.stringify({ APIKey: apiKey, BoundingBoxes: [bbox], FilterMessageTypes: MESSAGE_TYPES });
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeAisEvent(event: any) {
  const type = String(event?.MessageType || "");
  const meta = event?.MetaData || {};
  const body = event?.Message?.[type] || {};
  const mmsi = String(meta?.MMSI ?? body?.UserID ?? body?.SourceID ?? "").replace(/\D/g, "");
  if (!mmsi) return null;
  if (type === "ShipStaticData" || type === "StaticDataReport") {
    return {
      type: "vessel-static",
      vessel: {
        mmsi,
        name: textOrEmpty(meta?.ShipName || body?.Name),
        callSign: textOrEmpty(body?.CallSign),
        destination: textOrEmpty(body?.Destination),
        imo: numberOrNull(body?.ImoNumber ?? body?.IMO),
        shipType: numberOrNull(body?.Type ?? body?.ShipType),
        receivedAt: Date.now(),
      },
    };
  }
  const lat = numberOrNull(meta?.Latitude ?? body?.Latitude);
  const lon = numberOrNull(meta?.Longitude ?? body?.Longitude);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    type: "vessel",
    vessel: {
      mmsi,
      name: textOrEmpty(meta?.ShipName || body?.Name),
      lat,
      lon,
      sog: numberOrNull(body?.Sog),
      cog: numberOrNull(body?.Cog),
      heading: numberOrNull(body?.TrueHeading),
      navStatus: numberOrNull(body?.NavigationalStatus),
      messageType: type,
      receivedAt: Date.now(),
    },
  };
}

export async function GET() {
  const user = await getPanelUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  return experimental_upgradeWebSocket((client) => {
    const apiKey = process.env.AISSTREAM_API_KEY;
    let upstream: WebSocket | null = null;
    let currentBBox: BoundingBox | null = null;
    let lastSubscriptionAt = 0;
    let closed = false;

    send(client, { type: "proxy-ready", configured: Boolean(apiKey), provider: "AISStream.io" });

    const closeUpstream = () => {
      const socket = upstream;
      upstream = null;
      if (!socket) return;
      try {
        socket.removeAllListeners();
        socket.close();
      } catch {}
    };

    const pushSubscription = () => {
      if (!apiKey || !currentBBox || !upstream || upstream.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      const delay = Math.max(0, 1100 - (now - lastSubscriptionAt));
      setTimeout(() => {
        if (!upstream || upstream.readyState !== WebSocket.OPEN || !currentBBox) return;
        upstream.send(subscription(apiKey, currentBBox));
        lastSubscriptionAt = Date.now();
        send(client, { type: "area", bbox: currentBBox });
      }, delay);
    };

    const connectUpstream = () => {
      if (!apiKey) {
        send(client, { type: "config-error", message: "AISSTREAM_API_KEY não configurada na Vercel." });
        return;
      }
      if (upstream && [WebSocket.OPEN, WebSocket.CONNECTING].includes(upstream.readyState)) {
        pushSubscription();
        return;
      }
      send(client, { type: "source-status", status: "connecting" });
      upstream = new WebSocket(AIS_URL, { perMessageDeflate: true });
      upstream.on("open", () => {
        send(client, { type: "source-status", status: "connected" });
        pushSubscription();
      });
      upstream.on("message", (raw) => {
        let event: any;
        try { event = JSON.parse(raw.toString()); } catch { return; }
        if (event?.MessageType === "SubscriptionConfirmation") {
          send(client, { type: "subscription-confirmed", compressed: Boolean(event?.Message?.CompressionEnabled) });
          return;
        }
        const clean = sanitizeAisEvent(event);
        if (clean) send(client, clean);
      });
      upstream.on("error", (error) => {
        send(client, { type: "source-status", status: "error", message: error instanceof Error ? error.message : "Falha no AISStream." });
      });
      upstream.on("close", () => {
        upstream = null;
        if (!closed) send(client, { type: "source-status", status: "disconnected" });
      });
    };

    client.on("message", (raw: WebSocketData) => {
      let event: ClientEvent;
      try { event = JSON.parse(raw.toString()); } catch { return; }
      if (event.type === "ping") {
        send(client, { type: "pong", at: Date.now() });
        return;
      }
      if (event.type === "subscribe") {
        const bbox = normalizeBBox(event.bbox);
        if (!bbox) {
          send(client, { type: "client-error", message: "Área AIS inválida." });
          return;
        }
        currentBBox = bbox;
        connectUpstream();
        pushSubscription();
      }
    });

    const close = () => {
      closed = true;
      closeUpstream();
    };
    client.on("close", close);
    client.on("error", close);
  });
}
