"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  Crosshair,
  Filter,
  LocateFixed,
  Minus,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Ship,
  Waves,
  X,
} from "lucide-react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text } from "ol/style";
import { fromLonLat, toLonLat, transformExtent } from "ol/proj";

const OCEAN_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}";
const SEAMARK_TILES = "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png";

type Vessel = {
  mmsi: string;
  name?: string;
  lat?: number;
  lon?: number;
  sog?: number | null;
  cog?: number | null;
  heading?: number | null;
  navStatus?: number | null;
  callSign?: string;
  destination?: string;
  imo?: number | null;
  shipType?: number | null;
  receivedAt: number;
};

type Props = {
  defaultLat?: number | null;
  defaultLon?: number | null;
};

type FilterMode = "all" | "moving" | "stopped";
type BaseMode = "nautical" | "map";

function validCoordinate(value: unknown, max: number) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = 6371;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function relativeTime(ts: number) {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 10) return "agora";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

function navStatusName(value?: number | null) {
  const labels: Record<number, string> = {
    0: "Navegando a motor",
    1: "Fundeado",
    2: "Sem governo",
    3: "Manobra restrita",
    4: "Restrito pelo calado",
    5: "Atracado",
    6: "Encalhado",
    7: "Pescando",
    8: "À vela",
    14: "AIS-SART",
    15: "Não definido",
  };
  return value == null ? "Não informado" : labels[value] || `Status ${value}`;
}

function clampBBox(extent4326: number[]) {
  let [west, south, east, north] = extent4326;
  const maxSpan = 5;
  const cLat = (north + south) / 2;
  const cLon = (east + west) / 2;
  if (north - south > maxSpan) {
    north = cLat + maxSpan / 2;
    south = cLat - maxSpan / 2;
  }
  if (east - west > maxSpan) {
    east = cLon + maxSpan / 2;
    west = cLon - maxSpan / 2;
  }
  return [[north, west], [south, east]] as [[number, number], [number, number]];
}

export default function AISPage({ defaultLat, defaultLon }: Props) {
  const fallbackLat = validCoordinate(defaultLat, 90) ?? -27.15;
  const fallbackLon = validCoordinate(defaultLon, 180) ?? -48.55;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const vesselLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const vesselSourceRef = useRef<VectorSource | null>(null);
  const positionSourceRef = useRef<VectorSource | null>(null);
  const oceanLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const streetLayerRef = useRef<TileLayer<OSM> | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const subscribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const activeRef = useRef(true);
  const selectedRef = useRef<string | null>(null);
  const bboxRef = useRef<[[number, number], [number, number]] | null>(null);
  const filterRef = useRef<FilterMode>("all");
  const searchRef = useRef("");

  const [vessels, setVessels] = useState<Record<string, Vessel>>({});
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [query, setQuery] = useState("");
  const [baseMode, setBaseMode] = useState<BaseMode>("nautical");
  const [zoom, setZoom] = useState(9);
  const [center, setCenter] = useState({ lat: fallbackLat, lon: fallbackLon });
  const [devicePosition, setDevicePosition] = useState<{ lat: number; lon: number } | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error" | "config">("connecting");
  const [statusMessage, setStatusMessage] = useState("Conectando ao AIS...");
  const [lastSignal, setLastSignal] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  filterRef.current = filter;
  searchRef.current = query;
  selectedRef.current = selectedMmsi;

  function featureVisible(vessel: Vessel) {
    if (filterRef.current === "moving" && Number(vessel.sog || 0) < 0.5) return false;
    if (filterRef.current === "stopped" && Number(vessel.sog || 0) >= 0.5) return false;
    const q = searchRef.current.trim().toLowerCase();
    if (q && !(vessel.name || "").toLowerCase().includes(q) && !vessel.mmsi.includes(q)) return false;
    return true;
  }

  function buildVesselStyle(vessel: Vessel, selected: boolean, currentZoom: number) {
    if (!featureVisible(vessel)) return [];
    const speed = Number(vessel.sog || 0);
    const fillColor = selected ? "#ffffff" : speed >= 2 ? "#22d3a6" : speed >= 0.5 ? "#e8bd54" : "#8aa4ab";
    const strokeColor = selected ? "#042c32" : "#061b21";
    const angle = Number.isFinite(vessel.heading) && Number(vessel.heading) < 511 ? Number(vessel.heading) : Number(vessel.cog || 0);
    const shape = new RegularShape({
      points: 3,
      radius: selected ? 11 : 9,
      angle: 0,
      rotation: (angle * Math.PI) / 180,
      rotateWithView: true,
      fill: new Fill({ color: fillColor }),
      stroke: new Stroke({ color: strokeColor, width: selected ? 2.6 : 1.6 }),
    });
    return new Style({
      image: shape,
      text: currentZoom >= 10 && (selected || vessel.name)
        ? new Text({
            text: (vessel.name || vessel.mmsi).slice(0, 22),
            offsetY: 17,
            font: selected ? "700 11px system-ui" : "600 10px system-ui",
            fill: new Fill({ color: "#f4ffff" }),
            stroke: new Stroke({ color: "#062027", width: 3 }),
          })
        : undefined,
    });
  }

  function upsertFeature(vessel: Vessel) {
    const source = vesselSourceRef.current;
    if (!source || vessel.lat == null || vessel.lon == null) return;
    let feature = source.getFeatureById(vessel.mmsi) as Feature<Point> | null;
    if (!feature) {
      feature = new Feature({ geometry: new Point(fromLonLat([vessel.lon, vessel.lat])) });
      feature.setId(vessel.mmsi);
      source.addFeature(feature);
    } else {
      feature.getGeometry()?.setCoordinates(fromLonLat([vessel.lon, vessel.lat]));
    }
    feature.set("vessel", vessel);
    feature.setStyle(() => buildVesselStyle(vessel, selectedRef.current === vessel.mmsi, mapRef.current?.getView().getZoom() || 9));
  }

  function sendSubscription(force = false) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !bboxRef.current) return;
    if (subscribeTimerRef.current) clearTimeout(subscribeTimerRef.current);
    subscribeTimerRef.current = setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN && bboxRef.current) {
        socket.send(JSON.stringify({ type: "subscribe", bbox: bboxRef.current }));
      }
    }, force ? 0 : 1150);
  }

  function refreshAreaSubscription(force = false) {
    const map = mapRef.current;
    if (!map || !map.getSize()) return;
    const extent = transformExtent(map.getView().calculateExtent(map.getSize()), "EPSG:3857", "EPSG:4326");
    bboxRef.current = clampBBox(extent);
    sendSubscription(force);
  }

  function connectSocket() {
    if (typeof window === "undefined" || !activeRef.current) return;
    if (socketRef.current && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socketRef.current.readyState)) return;
    setStatus("connecting");
    setStatusMessage("Conectando ao AIS...");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/api/ais-stream`);
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectCountRef.current = 0;
      setStatus("connecting");
      setStatusMessage("Conectado ao servidor. Assinando área AIS...");
      refreshAreaSubscription(true);
    };

    socket.onmessage = (event) => {
      let payload: any;
      try { payload = JSON.parse(String(event.data)); } catch { return; }
      if (payload.type === "proxy-ready" && !payload.configured) {
        setStatus("config");
        setStatusMessage("Configure AISSTREAM_API_KEY na Vercel.");
        return;
      }
      if (payload.type === "config-error") {
        setStatus("config");
        setStatusMessage(payload.message || "AIS sem chave configurada.");
        return;
      }
      if (payload.type === "source-status") {
        if (payload.status === "connected") {
          setStatus("connected");
          setStatusMessage("AIS em tempo real");
        } else if (payload.status === "error") {
          setStatus("error");
          setStatusMessage(payload.message || "Falha na fonte AIS.");
        } else {
          setStatus(payload.status === "connecting" ? "connecting" : "disconnected");
          setStatusMessage(payload.status === "connecting" ? "Conectando à fonte AIS..." : "Fonte AIS desconectada");
        }
        return;
      }
      if (payload.type === "subscription-confirmed") {
        setStatus("connected");
        setStatusMessage("AIS ao vivo — área atual");
        return;
      }
      if (payload.type === "vessel-static") {
        const patch = payload.vessel as Vessel;
        setVessels((current) => {
          const old = current[patch.mmsi];
          if (!old) return current;
          const merged = { ...old, ...patch, lat: old.lat, lon: old.lon, receivedAt: Math.max(old.receivedAt, patch.receivedAt || 0) };
          queueMicrotask(() => upsertFeature(merged));
          return { ...current, [patch.mmsi]: merged };
        });
        return;
      }
      if (payload.type === "vessel") {
        const incoming = payload.vessel as Vessel;
        setLastSignal(Date.now());
        setVessels((current) => {
          const merged = { ...current[incoming.mmsi], ...incoming };
          queueMicrotask(() => upsertFeature(merged));
          return { ...current, [incoming.mmsi]: merged };
        });
      }
    };

    socket.onerror = () => {
      setStatus("error");
      setStatusMessage("Falha na conexão AIS.");
    };

    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null;
      if (!activeRef.current) return;
      if (status !== "config") {
        setStatus("disconnected");
        setStatusMessage("Reconectando AIS...");
      }
      const attempt = Math.min(6, reconnectCountRef.current++);
      reconnectTimerRef.current = setTimeout(connectSocket, Math.min(12000, 900 * 2 ** attempt));
    };
  }

  useEffect(() => {
    if (!hostRef.current) return;
    const ocean = new TileLayer({
      visible: true,
      source: new XYZ({
        url: OCEAN_TILES,
        crossOrigin: "anonymous",
        attributions: "Esri · GEBCO · NOAA",
      }),
    });
    const street = new TileLayer({ visible: false, source: new OSM() });
    const seamarks = new TileLayer({
      opacity: 0.96,
      source: new XYZ({ url: SEAMARK_TILES, crossOrigin: "anonymous", maxZoom: 18, attributions: "OpenSeaMap" }),
    });
    const positionSource = new VectorSource();
    const positionLayer = new VectorLayer({
      source: positionSource,
      style: new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: "#2a92ff" }),
          stroke: new Stroke({ color: "#ffffff", width: 3 }),
        }),
      }),
    });
    const vesselSource = new VectorSource();
    const vesselLayer = new VectorLayer({ source: vesselSource, declutter: true });
    const view = new View({ center: fromLonLat([fallbackLon, fallbackLat]), zoom: 9, minZoom: 3, maxZoom: 17 });
    const map = new Map({
      target: hostRef.current,
      controls: [],
      layers: [ocean, street, seamarks, vesselLayer, positionLayer],
      view,
    });

    mapRef.current = map;
    vesselLayerRef.current = vesselLayer;
    vesselSourceRef.current = vesselSource;
    positionSourceRef.current = positionSource;
    oceanLayerRef.current = ocean;
    streetLayerRef.current = street;

    const updateCenter = () => {
      const [lon, lat] = toLonLat(view.getCenter() || fromLonLat([fallbackLon, fallbackLat]));
      setCenter({ lat, lon });
      setZoom(Math.round(view.getZoom() || 9));
      refreshAreaSubscription();
    };
    map.on("moveend", updateCenter);
    map.on("singleclick", (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, (candidate, layer) => layer === vesselLayer ? candidate : undefined, { hitTolerance: 7 });
      if (feature) {
        const vessel = feature.get("vessel") as Vessel | undefined;
        if (vessel?.mmsi) setSelectedMmsi(vessel.mmsi);
      }
    });
    const ro = new ResizeObserver(() => map.updateSize());
    ro.observe(hostRef.current);
    setTimeout(() => refreshAreaSubscription(true), 100);

    return () => {
      ro.disconnect();
      map.un("moveend", updateCenter);
      map.setTarget(undefined);
      mapRef.current = null;
      vesselSourceRef.current = null;
      positionSourceRef.current = null;
    };
  }, []);

  useEffect(() => {
    activeRef.current = true;
    connectSocket();
    const heartbeat = setInterval(() => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
    }, 20000);
    const cleaner = setInterval(() => {
      const limit = Date.now() - 12 * 60 * 1000;
      setVessels((current) => {
        const next = { ...current };
        let changed = false;
        for (const [mmsi, vessel] of Object.entries(next)) {
          if (vessel.receivedAt < limit) {
            delete next[mmsi];
            const feature = vesselSourceRef.current?.getFeatureById(mmsi);
            if (feature) vesselSourceRef.current?.removeFeature(feature);
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 30000);
    return () => {
      activeRef.current = false;
      clearInterval(heartbeat);
      clearInterval(cleaner);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (subscribeTimerRef.current) clearTimeout(subscribeTimerRef.current);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, []);

  useEffect(() => {
    for (const vessel of Object.values(vessels)) upsertFeature(vessel);
    vesselLayerRef.current?.changed();
  }, [filter, query, selectedMmsi]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const mobile = window.matchMedia("(max-width: 900px)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (!mobile) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
        setDevicePosition(coords);
        centerOn(coords.lat, coords.lon, 11, true);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  function centerOn(lat: number, lon: number, targetZoom = 11, mark = false) {
    const map = mapRef.current;
    if (!map) return;
    map.getView().animate({ center: fromLonLat([lon, lat]), zoom: targetZoom, duration: 350 });
    if (mark) {
      const source = positionSourceRef.current;
      source?.clear();
      source?.addFeature(new Feature({ geometry: new Point(fromLonLat([lon, lat])) }));
    }
  }

  function locateDevice() {
    if (!navigator.geolocation) {
      setStatusMessage("Geolocalização não disponível neste dispositivo.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
        setDevicePosition(coords);
        centerOn(coords.lat, coords.lon, 12, true);
      },
      () => setStatusMessage("Localização não autorizada ou indisponível."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  function zoomBy(delta: number) {
    const view = mapRef.current?.getView();
    if (!view) return;
    view.animate({ zoom: Math.max(3, Math.min(17, (view.getZoom() || 9) + delta)), duration: 170 });
  }

  function setMapMode(mode: BaseMode) {
    setBaseMode(mode);
    oceanLayerRef.current?.setVisible(mode === "nautical");
    streetLayerRef.current?.setVisible(mode === "map");
  }

  function selectVessel(vessel: Vessel) {
    if (vessel.lat == null || vessel.lon == null) return;
    setSelectedMmsi(vessel.mmsi);
    centerOn(vessel.lat, vessel.lon, Math.max(12, mapRef.current?.getView().getZoom() || 9));
  }

  const selected = selectedMmsi ? vessels[selectedMmsi] : null;
  const list = useMemo(() => {
    return Object.values(vessels)
      .filter((v) => v.lat != null && v.lon != null)
      .filter((v) => {
        if (filter === "moving" && Number(v.sog || 0) < 0.5) return false;
        if (filter === "stopped" && Number(v.sog || 0) >= 0.5) return false;
        const q = query.trim().toLowerCase();
        return !q || (v.name || "").toLowerCase().includes(q) || v.mmsi.includes(q);
      })
      .map((v) => ({ ...v, distance: haversineKm(center.lat, center.lon, v.lat!, v.lon!) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 30);
  }, [vessels, filter, query, center.lat, center.lon]);

  const visibleCount = list.length;
  const totalCount = Object.keys(vessels).length;

  return (
    <section className="ais-page">
      <div className="ais-topbar">
        <div>
          <small>MONITORAMENTO MARÍTIMO</small>
          <h2>AIS — embarcações em tempo real</h2>
          <p>Carta náutica com posições AIS recebidas da área visível do mapa.</p>
        </div>
        <div className="ais-live-box">
          <span className={`ais-live-dot ${status}`} />
          <div><b>{statusMessage}</b><small>{lastSignal ? `Último sinal ${relativeTime(lastSignal)}` : "Aguardando sinais"}</small></div>
        </div>
      </div>

      <div className="ais-shell">
        <div ref={hostRef} className="ais-map" aria-label="Mapa AIS de embarcações" />

        <div className="ais-map-tools ais-left-tools">
          <button type="button" onClick={() => zoomBy(1)} title="Aumentar zoom"><Plus /></button>
          <button type="button" onClick={() => zoomBy(-1)} title="Diminuir zoom"><Minus /></button>
          <button type="button" onClick={locateDevice} title="Minha localização"><LocateFixed /></button>
          <button type="button" onClick={() => centerOn(fallbackLat, fallbackLon, 10)} title="Voltar para a última posição"><Crosshair /></button>
          <button type="button" onClick={() => refreshAreaSubscription(true)} title="Atualizar área AIS"><RefreshCw /></button>
        </div>

        <div className="ais-map-header-controls">
          <div className="ais-base-toggle">
            <button className={baseMode === "nautical" ? "active" : ""} onClick={() => setMapMode("nautical")}><Waves /> Carta</button>
            <button className={baseMode === "map" ? "active" : ""} onClick={() => setMapMode("map")}><Navigation /> Mapa</button>
          </div>
          <button className="ais-list-toggle" onClick={() => setPanelOpen((v) => !v)}><Ship /> {totalCount} barcos</button>
        </div>

        {panelOpen && (
          <aside className="ais-vessel-panel">
            <div className="ais-panel-head">
              <div><small>BARCOS NA ÁREA</small><b>{visibleCount} próximos</b></div>
              <button onClick={() => setPanelOpen(false)}><X /></button>
            </div>
            <label className="ais-search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou MMSI" /></label>
            <div className="ais-filter-row">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button>
              <button className={filter === "moving" ? "active" : ""} onClick={() => setFilter("moving")}>Em movimento</button>
              <button className={filter === "stopped" ? "active" : ""} onClick={() => setFilter("stopped")}>Parados</button>
            </div>
            <div className="ais-vessel-list">
              {list.length ? list.map((vessel) => (
                <button key={vessel.mmsi} className={selectedMmsi === vessel.mmsi ? "selected" : ""} onClick={() => selectVessel(vessel)}>
                  <span className={`ais-ship-state ${Number(vessel.sog || 0) >= 0.5 ? "moving" : "stopped"}`}><Ship /></span>
                  <span className="ais-vessel-name"><b>{vessel.name || `MMSI ${vessel.mmsi}`}</b><small>{vessel.mmsi} · {vessel.distance < 10 ? vessel.distance.toFixed(1) : Math.round(vessel.distance)} km</small></span>
                  <span className="ais-speed"><b>{Number(vessel.sog || 0).toFixed(1)}</b><small>kn</small></span>
                </button>
              )) : <div className="ais-list-empty"><Radio />Aguardando barcos nesta área. Aproximar o zoom pode melhorar a leitura.</div>}
            </div>
          </aside>
        )}

        {selected && selected.lat != null && selected.lon != null && (
          <div className="ais-vessel-card">
            <button className="ais-vessel-card-close" onClick={() => setSelectedMmsi(null)}><X /></button>
            <small>EMBARCAÇÃO SELECIONADA</small>
            <h3>{selected.name || `MMSI ${selected.mmsi}`}</h3>
            <div className="ais-detail-grid">
              <span><small>MMSI</small><b>{selected.mmsi}</b></span>
              <span><small>VELOCIDADE</small><b>{Number(selected.sog || 0).toFixed(1)} kn</b></span>
              <span><small>RUMO</small><b>{selected.cog != null ? `${Math.round(selected.cog)}°` : "—"}</b></span>
              <span><small>PROA</small><b>{selected.heading != null && selected.heading < 511 ? `${Math.round(selected.heading)}°` : "—"}</b></span>
              <span><small>STATUS</small><b>{navStatusName(selected.navStatus)}</b></span>
              <span><small>ÚLTIMO SINAL</small><b>{relativeTime(selected.receivedAt)}</b></span>
            </div>
            <p>{Math.abs(selected.lat).toFixed(5)}° {selected.lat < 0 ? "S" : "N"} · {Math.abs(selected.lon).toFixed(5)}° {selected.lon < 0 ? "W" : "E"}</p>
            {selected.destination && <p><b>Destino:</b> {selected.destination}</p>}
          </div>
        )}

        <div className="ais-bottom-status">
          <span><Anchor /> Zoom {zoom}</span>
          <span>{Math.abs(center.lat).toFixed(3)}° {center.lat < 0 ? "S" : "N"} · {Math.abs(center.lon).toFixed(3)}° {center.lon < 0 ? "W" : "E"}</span>
          {devicePosition && <span className="ais-gps-ok"><LocateFixed /> GPS do aparelho ativo</span>}
        </div>
      </div>

      <div className="ais-footnote">
        <b>AISStream.io + OpenSeaMap</b>
        <span>AIS é uma fonte de consciência situacional e pode ter atrasos, falhas de cobertura ou embarcações sem transmissão. Não usar como única referência de navegação ou anticolisão.</span>
      </div>
    </section>
  );
}
