"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  Bookmark,
  Crosshair,
  FolderHeart,
  History,
  LocateFixed,
  MapPinned,
  Minus,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Ship,
  Trash2,
} from "lucide-react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text } from "ol/style";
import { fromLonLat, toLonLat } from "ol/proj";

const DHN_WMS_URL = "https://idem.dhn.mar.mil.br/geoserver/wms";
const DHN_TILE_BASE = (process.env.NEXT_PUBLIC_DHN_TILE_BASE_URL || "/cartas").replace(/\/$/, "");

type Props = {
  defaultLat?: number | null;
  defaultLon?: number | null;
};

type BaseMode = "dhn" | "map";
type AisStatus = "idle" | "loading" | "ready" | "error" | "config";

type DhnChart = {
  number: string;
  title: string;
  groups?: string[];
  scale?: number | null;
  bounds?: [number, number, number, number] | null;
  files?: string[];
  layerName?: string;
  source?: "wms" | "local";
};

type VesselMatch = {
  name: string;
  mmsi: string;
  imo: string;
  country: string;
  countryIso: string;
  shipType: string;
  typeSpecific: string;
  callsign: string;
};

type Vessel = {
  mmsi: string;
  imo?: string;
  name?: string;
  lat: number;
  lon: number;
  sog?: number | null;
  cog?: number | null;
  heading?: number | null;
  draught?: string;
  destination?: string;
  lastPort?: string;
  callsign?: string;
  vesselType?: string;
  navStatusText?: string;
  dataSource?: string;
  positionReceived?: string;
  updateTime?: string;
  receivedAt: number;
};

type SavedVessel = {
  id: number;
  vesselKey: string;
  name: string;
  mmsi?: string | null;
  imo?: string | null;
  country?: string | null;
  vesselType?: string | null;
  callsign?: string | null;
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  lastSog?: number | null;
  lastCog?: number | null;
  lastHeading?: number | null;
  lastDestination?: string | null;
  lastStatus?: string | null;
  lastDataSource?: string | null;
  lastPositionReceived?: string | null;
  lastUpdateTime?: string | null;
  savedAt: string;
  updatedAt: string;
};

type AisHistoryItem = {
  id: number;
  vesselKey: string;
  name: string;
  mmsi?: string | null;
  imo?: string | null;
  latitude: number;
  longitude: number;
  sog?: number | null;
  cog?: number | null;
  heading?: number | null;
  destination?: string | null;
  navStatus?: string | null;
  dataSource?: string | null;
  positionReceived?: string | null;
  updateTime?: string | null;
  queriedAt: string;
};

function chartContains(chart: DhnChart, lon: number, lat: number) {
  if (!chart.bounds || chart.bounds.length !== 4) return false;
  const [west, south, east, north] = chart.bounds;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

function idealScaleForZoom(zoom: number) {
  if (zoom <= 6) return 2500000;
  if (zoom <= 7) return 1500000;
  if (zoom <= 8) return 750000;
  if (zoom <= 9) return 350000;
  if (zoom <= 10) return 180000;
  if (zoom <= 11) return 90000;
  if (zoom <= 12) return 45000;
  if (zoom <= 13) return 25000;
  return 12000;
}

function chooseDhnChart(charts: DhnChart[], lon: number, lat: number, zoom: number) {
  const covering = charts.filter((chart) => chartContains(chart, lon, lat));
  if (!covering.length) return null;
  const ideal = idealScaleForZoom(zoom);
  return [...covering].sort((a, b) => {
    const as = Number(a.scale || 9999999);
    const bs = Number(b.scale || 9999999);
    return Math.abs(Math.log(as / ideal)) - Math.abs(Math.log(bs / ideal));
  })[0];
}

function validCoordinate(value: unknown, max: number) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

function relativeTime(ts: number) {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 10) return "agora";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

function vesselIdentifier(match: VesselMatch) {
  if (match.imo && match.imo !== "0") return match.imo;
  return match.mmsi;
}

function formatCoord(value: number, latitude = true) {
  const letter = latitude ? (value < 0 ? "S" : "N") : (value < 0 ? "W" : "E");
  return `${Math.abs(value).toFixed(5)}° ${letter}`;
}

function formatCoordMarine(value: number, latitude = true) {
  const hemisphere = latitude ? (value < 0 ? "S" : "N") : (value < 0 ? "W" : "E");
  const absolute = Math.abs(value);
  let degrees = Math.floor(absolute);
  let minutes = (absolute - degrees) * 60;
  // Evita exibir 60.00' por arredondamento.
  if (Number(minutes.toFixed(2)) >= 60) {
    degrees += 1;
    minutes = 0;
  }
  const degreeText = latitude ? String(degrees).padStart(2, "0") : String(degrees).padStart(3, "0");
  const minuteText = minutes.toFixed(2).padStart(5, "0");
  return `${degreeText}º ${minuteText}' ${hemisphere}`;
}

function parseProviderTime(value?: string) {
  if (!value) return null;
  const normalized = /UTC$/i.test(value.trim()) ? value.trim().replace(/ UTC$/i, " GMT") : value.trim();
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalDateTime(date: Date) {
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
  const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  return sameDay ? `Hoje · ${time}` : `${day} · ${time}`;
}

function positionAgeLabel(value?: string) {
  const date = parseProviderTime(value);
  if (!date) return { label: "HORÁRIO NÃO INFORMADO", className: "unknown" };
  const ageMinutes = Math.max(0, (Date.now() - date.getTime()) / 60000);
  if (ageMinutes <= 10) return { label: "POSIÇÃO MUITO RECENTE", className: "fresh" };
  if (ageMinutes <= 60) return { label: `POSIÇÃO DE ${Math.round(ageMinutes)} MIN ATRÁS`, className: "fresh" };
  if (ageMinutes <= 24 * 60) return { label: `POSIÇÃO DE ${Math.round(ageMinutes / 60)} H ATRÁS`, className: "warning" };
  return { label: `POSIÇÃO DE ${Math.max(1, Math.round(ageMinutes / 1440))} DIA(S) ATRÁS`, className: "stale" };
}

function sourceInfo(dataSource?: string) {
  const source = (dataSource || "").trim();
  if (/satellite|s-ais/i.test(source)) {
    return { title: "AIS POR SATÉLITE", short: "S-AIS", className: "satellite" };
  }
  if (/terrestrial|t-ais/i.test(source)) {
    return { title: "AIS TERRESTRE", short: "T-AIS", className: "terrestrial" };
  }
  return { title: source ? `AIS · ${source}` : "FONTE AIS", short: "AIS", className: "unknown" };
}

export default function AISPage({ defaultLat, defaultLon }: Props) {
  const fallbackLat = validCoordinate(defaultLat, 90) ?? -27.15;
  const fallbackLon = validCoordinate(defaultLon, 180) ?? -48.55;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const vesselSourceRef = useRef<VectorSource | null>(null);
  const positionSourceRef = useRef<VectorSource | null>(null);
  const streetLayerRef = useRef<TileLayer<OSM> | null>(null);
  const dhnLayerRef = useRef<TileLayer<XYZ | TileWMS> | null>(null);
  const nameCacheRef = useRef<Map<string, VesselMatch[]>>(new Map());
  const positionCacheRef = useRef<Map<string, Vessel>>(new Map());

  const [nameQuery, setNameQuery] = useState("");
  const [matches, setMatches] = useState<VesselMatch[]>([]);
  const [matchTotal, setMatchTotal] = useState(0);
  const [tracked, setTracked] = useState<Vessel | null>(null);
  const [status, setStatus] = useState<AisStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Digite o nome do barco para localizar");
  const [credits, setCredits] = useState<number | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [center, setCenter] = useState({ lat: fallbackLat, lon: fallbackLon });
  const [devicePosition, setDevicePosition] = useState<{ lat: number; lon: number } | null>(null);
  const [zoom, setZoom] = useState(10);
  const [baseMode, setBaseMode] = useState<BaseMode>("dhn");
  const [dhnCharts, setDhnCharts] = useState<DhnChart[]>([]);
  const [dhnAuto, setDhnAuto] = useState(true);
  const [selectedDhnChart, setSelectedDhnChart] = useState("");
  const [dhnLoadMessage, setDhnLoadMessage] = useState("Conectando ao serviço oficial IDEM-DHN...");
  const [clockNow, setClockNow] = useState(() => new Date());
  const [savedVessels, setSavedVessels] = useState<SavedVessel[]>([]);
  const [historyItems, setHistoryItems] = useState<AisHistoryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  function buildVesselStyle(vessel: Vessel, currentZoom: number) {
    const speed = Number(vessel.sog || 0);
    const angle = Number.isFinite(vessel.heading) && Number(vessel.heading) < 511
      ? Number(vessel.heading)
      : Number(vessel.cog || 0);
    return new Style({
      image: new RegularShape({
        points: 3,
        radius: 12,
        angle: 0,
        rotation: (angle * Math.PI) / 180,
        rotateWithView: true,
        fill: new Fill({ color: speed >= 0.5 ? "#25d4aa" : "#f0c65b" }),
        stroke: new Stroke({ color: "#05252b", width: 2.4 }),
      }),
      text: currentZoom >= 8
        ? new Text({
            text: (vessel.name || vessel.mmsi).slice(0, 26),
            offsetY: 20,
            font: "800 11px system-ui",
            fill: new Fill({ color: "#f4ffff" }),
            stroke: new Stroke({ color: "#062027", width: 3 }),
          })
        : undefined,
    });
  }

  function drawVessel(vessel: Vessel) {
    const source = vesselSourceRef.current;
    if (!source) return;
    source.clear();
    const feature = new Feature({ geometry: new Point(fromLonLat([vessel.lon, vessel.lat])) });
    feature.set("vessel", vessel);
    feature.setStyle(() => buildVesselStyle(vessel, mapRef.current?.getView().getZoom() || 10));
    source.addFeature(feature);
  }

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

  async function refreshCredits() {
    try {
      const response = await fetch("/api/ais?action=credits", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 503) {
          setStatus("config");
          setStatusMessage(data?.error || "Configure DATADOCKED_API_KEY na Vercel.");
        }
        return;
      }
      if (Number.isFinite(Number(data?.credits))) setCredits(Number(data.credits));
      if (status === "config") setStatus("idle");
    } catch {
      // Saldo é informativo e não deve bloquear o mapa.
    }
  }

  function vesselKeyFrom(source: { imo?: string | null; mmsi?: string | null }) {
    const imo = String(source?.imo || "").replace(/\D/g, "");
    const mmsi = String(source?.mmsi || "").replace(/\D/g, "");
    if (imo && imo !== "0") return `imo:${imo}`;
    if (mmsi) return `mmsi:${mmsi}`;
    return "";
  }

  async function loadAisLibrary() {
    setLibraryLoading(true);
    try {
      const response = await fetch("/api/ais-library", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) return;
      setSavedVessels(Array.isArray(data?.saved) ? data.saved : []);
      setHistoryItems(Array.isArray(data?.history) ? data.history : []);
    } catch {
      // A biblioteca AIS é auxiliar e não bloqueia as consultas ao provedor.
    } finally {
      setLibraryLoading(false);
    }
  }

  async function saveVessel(source: VesselMatch | Vessel) {
    const key = vesselKeyFrom(source);
    if (!key) {
      setStatusMessage("Este barco não possui IMO/MMSI válido para salvar.");
      return;
    }
    try {
      const response = await fetch("/api/ais-library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", vessel: source }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatusMessage(data?.error || "Não foi possível salvar o barco.");
        return;
      }
      await loadAisLibrary();
      setStatusMessage(`${source.name || "Embarcação"} salva na pasta de barcos`);
    } catch {
      setStatusMessage("Falha ao salvar a embarcação.");
    }
  }

  async function removeSavedVessel(key: string) {
    try {
      const response = await fetch(`/api/ais-library?type=saved&key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!response.ok) return;
      setSavedVessels((current) => current.filter((item) => item.vesselKey !== key));
      setStatusMessage("Barco removido da pasta de salvos.");
    } catch {
      setStatusMessage("Não foi possível remover o barco salvo.");
    }
  }

  async function clearAisHistory() {
    if (!window.confirm("Limpar todo o histórico de consultas AIS desta conta?")) return;
    try {
      const response = await fetch("/api/ais-library?type=history", { method: "DELETE" });
      if (!response.ok) return;
      setHistoryItems([]);
      setStatusMessage("Histórico AIS limpo.");
    } catch {
      setStatusMessage("Não foi possível limpar o histórico AIS.");
    }
  }

  async function recordHistory(vessel: Vessel) {
    try {
      await fetch("/api/ais-library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "history", vessel }),
      });
      await loadAisLibrary();
    } catch {
      // O histórico não pode impedir a exibição da posição já obtida.
    }
  }

  function showVesselFromLibrary(vessel: Vessel, message: string) {
    const id = vessel.imo && vessel.imo !== "0" ? vessel.imo : vessel.mmsi;
    if (id) positionCacheRef.current.set(id, vessel);
    setTracked(vessel);
    drawVessel(vessel);
    centerOn(vessel.lat, vessel.lon, 12);
    setStatus("ready");
    setStatusMessage(message);
  }

  function openSavedVessel(item: SavedVessel) {
    if (item.lastLatitude == null || item.lastLongitude == null) {
      setNameQuery(item.name);
      setStatusMessage("Barco salvo sem posição armazenada. Use ATUALIZAR para consultar a posição.");
      return;
    }
    showVesselFromLibrary({
      mmsi: item.mmsi || "",
      imo: item.imo || "",
      name: item.name,
      lat: Number(item.lastLatitude),
      lon: Number(item.lastLongitude),
      sog: item.lastSog,
      cog: item.lastCog,
      heading: item.lastHeading,
      destination: item.lastDestination || "",
      callsign: item.callsign || "",
      vesselType: item.vesselType || "",
      navStatusText: item.lastStatus || "",
      dataSource: item.lastDataSource || "",
      positionReceived: item.lastPositionReceived || "",
      updateTime: item.lastUpdateTime || "",
      receivedAt: Date.now(),
    }, `${item.name} aberto da pasta de salvos — 0 créditos`);
  }

  function openHistoryItem(item: AisHistoryItem) {
    showVesselFromLibrary({
      mmsi: item.mmsi || "",
      imo: item.imo || "",
      name: item.name,
      lat: Number(item.latitude),
      lon: Number(item.longitude),
      sog: item.sog,
      cog: item.cog,
      heading: item.heading,
      destination: item.destination || "",
      navStatusText: item.navStatus || "",
      dataSource: item.dataSource || "",
      positionReceived: item.positionReceived || "",
      updateTime: item.updateTime || "",
      receivedAt: new Date(item.queriedAt).getTime() || Date.now(),
    }, `${item.name} aberto do histórico — 0 créditos`);
  }

  async function getVesselPosition(match: VesselMatch, force = false) {
    const id = vesselIdentifier(match);
    if (!id) {
      setStatus("error");
      setStatusMessage("Este resultado não possui IMO ou MMSI válido.");
      return;
    }

    const cached = positionCacheRef.current.get(id);
    if (cached && !force) {
      setTracked(cached);
      drawVessel(cached);
      centerOn(cached.lat, cached.lon, 12);
      setStatus("ready");
      setStatusMessage(`${cached.name || "Embarcação"} localizada do cache — 0 créditos`);
      return;
    }

    setStatus("loading");
    setStatusMessage(force ? "Atualizando posição — custo 1 crédito..." : "Consultando posição — custo 1 crédito...");
    try {
      const response = await fetch(`/api/ais?action=vessel&id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 503) setStatus("config");
        else setStatus("error");
        setStatusMessage(data?.error || "Não foi possível localizar a embarcação.");
        return;
      }
      const raw = data?.vessel;
      const vessel: Vessel = {
        mmsi: String(raw?.mmsi || match.mmsi || ""),
        imo: String(raw?.imo || match.imo || ""),
        name: raw?.name || match.name,
        lat: Number(raw?.lat),
        lon: Number(raw?.lon),
        sog: raw?.sog == null ? null : Number(raw.sog),
        cog: raw?.cog == null ? null : Number(raw.cog),
        heading: raw?.heading == null ? null : Number(raw.heading),
        draught: raw?.draught || "",
        destination: raw?.destination || "",
        lastPort: raw?.lastPort || "",
        callsign: raw?.callsign || match.callsign || "",
        vesselType: raw?.vesselType || match.typeSpecific || match.shipType || "",
        navStatusText: raw?.navStatusText || "",
        dataSource: raw?.dataSource || "",
        positionReceived: raw?.positionReceived || "",
        updateTime: raw?.updateTime || "",
        receivedAt: Number(raw?.receivedAt) || Date.now(),
      };
      if (!Number.isFinite(vessel.lat) || !Number.isFinite(vessel.lon)) {
        setStatus("error");
        setStatusMessage("A API retornou o barco sem uma posição válida.");
        return;
      }
      positionCacheRef.current.set(id, vessel);
      setTracked(vessel);
      drawVessel(vessel);
      centerOn(vessel.lat, vessel.lon, 12);
      setLastFetch(Date.now());
      setStatus("ready");
      setStatusMessage(`${vessel.name || "Embarcação"} localizada`);
      await Promise.all([refreshCredits(), recordHistory(vessel)]);
    } catch {
      setStatus("error");
      setStatusMessage("Falha de rede ao consultar a posição AIS.");
    }
  }

  async function searchByName(event?: FormEvent) {
    event?.preventDefault();
    const cleanName = nameQuery.trim();
    if (cleanName.length < 2) {
      setStatus("error");
      setStatusMessage("Digite pelo menos 2 caracteres do nome do barco.");
      return;
    }

    const cacheKey = cleanName.toLowerCase().replace(/\s+/g, " ");
    const cached = nameCacheRef.current.get(cacheKey);
    if (cached) {
      setMatches(cached);
      setMatchTotal(cached.length);
      setStatus("ready");
      setStatusMessage(`${cached.length} resultado(s) do cache — 0 créditos`);
      if (cached.length === 1) await getVesselPosition(cached[0]);
      return;
    }

    setStatus("loading");
    setStatusMessage("Buscando barco pelo nome — custo 1 crédito...");
    setMatches([]);
    setMatchTotal(0);
    try {
      const response = await fetch(`/api/ais?action=name&name=${encodeURIComponent(cleanName)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 503) setStatus("config");
        else setStatus("error");
        setStatusMessage(data?.error || "Falha ao buscar embarcação pelo nome.");
        return;
      }

      const rows = (Array.isArray(data?.items) ? data.items : []) as VesselMatch[];
      nameCacheRef.current.set(cacheKey, rows);
      setMatches(rows);
      setMatchTotal(Number(data?.total) || rows.length);
      await refreshCredits();

      if (!rows.length) {
        setStatus("ready");
        setStatusMessage("Nenhuma embarcação encontrada com esse nome.");
        return;
      }

      if (rows.length === 1) {
        setStatusMessage("1 barco encontrado — consultando posição (+1 crédito)...");
        await getVesselPosition(rows[0]);
        return;
      }

      setStatus("ready");
      setStatusMessage(`${rows.length} resultados — escolha o barco para ver a posição (+1 crédito)`);
    } catch {
      setStatus("error");
      setStatusMessage("Falha de rede ao consultar o Data Docked.");
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
        setStatusMessage("GPS localizado — mapa centralizado na sua posição.");
      },
      () => setStatusMessage("Localização não autorizada ou indisponível."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  function zoomBy(delta: number) {
    const view = mapRef.current?.getView();
    if (!view) return;
    view.animate({ zoom: Math.max(3, Math.min(18, (view.getZoom() || 10) + delta)), duration: 170 });
  }

  function setMapMode(mode: BaseMode) {
    setBaseMode(mode);
    streetLayerRef.current?.setVisible(mode === "map" || mode === "dhn");
    dhnLayerRef.current?.setVisible(mode === "dhn" && Boolean(selectedDhnChart));
  }

  useEffect(() => {
    if (!hostRef.current) return;
    const street = new TileLayer({ visible: true, source: new OSM() });
    const dhn = new TileLayer({
      visible: false,
      opacity: 1,
      source: new XYZ({
        url: `${DHN_TILE_BASE}/__nenhuma__/{z}/{x}/{y}.png`,
        attributions: "Carta Raster DHN/CHM",
        crossOrigin: "anonymous",
      }),
    });
    const vesselSource = new VectorSource();
    const vesselLayer = new VectorLayer({ source: vesselSource, declutter: true });
    const positionSource = new VectorSource();
    const positionLayer = new VectorLayer({
      source: positionSource,
      style: new Style({
        image: new CircleStyle({ radius: 8, fill: new Fill({ color: "#2a92ff" }), stroke: new Stroke({ color: "#ffffff", width: 3 }) }),
      }),
    });
    const view = new View({ center: fromLonLat([fallbackLon, fallbackLat]), zoom: 10.5, minZoom: 3, maxZoom: 18 });
    const map = new Map({
      target: hostRef.current,
      controls: [],
      layers: [street, dhn, vesselLayer, positionLayer],
      view,
    });

    mapRef.current = map;
    vesselSourceRef.current = vesselSource;
    positionSourceRef.current = positionSource;
    streetLayerRef.current = street;
    dhnLayerRef.current = dhn;

    const updateCenter = () => {
      const [lon, lat] = toLonLat(view.getCenter() || fromLonLat([fallbackLon, fallbackLat]));
      setCenter({ lat, lon });
      setZoom(Math.round(view.getZoom() || 10));
      vesselSource.getFeatures().forEach((feature) => {
        const vessel = feature.get("vessel") as Vessel | undefined;
        if (vessel) feature.setStyle(() => buildVesselStyle(vessel, view.getZoom() || 10));
      });
    };
    map.on("moveend", updateCenter);
    const ro = new ResizeObserver(() => map.updateSize());
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      map.un("moveend", updateCenter);
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/dhn/charts", { cache: "no-store" }).then((r) => r.ok ? r.json() : { charts: [], error: `HTTP ${r.status}` }).catch((error) => ({ charts: [], error: String(error) })),
      fetch("/cartas/installed.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : { charts: [] }).catch(() => ({ charts: [] })),
    ]).then(([official, installed]) => {
      if (cancelled) return;
      const localList = Array.isArray(installed?.charts) ? installed.charts.map((item: DhnChart) => ({ ...item, source: "local" as const })) : [];
      const officialList = Array.isArray(official?.charts) ? official.charts.map((item: DhnChart) => ({ ...item, source: "wms" as const })) : [];
      const mergedMap = new Map<string, DhnChart>();
      for (const chart of officialList) mergedMap.set(chart.number, chart);
      for (const chart of localList) mergedMap.set(chart.number, { ...mergedMap.get(chart.number), ...chart, source: "local" });
      const merged = [...mergedMap.values()].sort((a, b) => Number(a.number.replace(/\D/g, "")) - Number(b.number.replace(/\D/g, "")));
      setDhnCharts(merged);
      if (merged.length) {
        const first = chooseDhnChart(merged, fallbackLon, fallbackLat, 10.5) || merged.find((c) => c.number.startsWith("1841")) || merged[0];
        setSelectedDhnChart(first.number);
        const wmsCount = officialList.length;
        const localCount = localList.length;
        setDhnLoadMessage(wmsCount
          ? `Serviço oficial IDEM-DHN online · ${wmsCount} carta(s) encontrada(s)${localCount ? ` · ${localCount} local(is)` : ""}`
          : `Serviço oficial indisponível · ${localCount} carta(s) local(is) carregada(s)`);
        setBaseMode("dhn");
      } else {
        setDhnLoadMessage(official?.error ? `IDEM-DHN indisponível: ${official.error}` : "Nenhuma carta DHN disponível no momento");
        setBaseMode("map");
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (baseMode !== "dhn" || !dhnAuto || !dhnCharts.length) return;
    const chosen = chooseDhnChart(dhnCharts, center.lon, center.lat, zoom);
    if (chosen && chosen.number !== selectedDhnChart) setSelectedDhnChart(chosen.number);
  }, [baseMode, dhnAuto, dhnCharts, center.lat, center.lon, zoom, selectedDhnChart]);

  useEffect(() => {
    const layer = dhnLayerRef.current;
    if (!layer || !selectedDhnChart) return;
    const chart = dhnCharts.find((item) => item.number === selectedDhnChart);
    if (!chart) return;
    if (chart.source === "local") {
      layer.setSource(new XYZ({
        url: `${DHN_TILE_BASE}/${selectedDhnChart}/{z}/{x}/{y}.png`,
        attributions: `Carta Raster DHN/CHM ${selectedDhnChart}`,
        crossOrigin: "anonymous",
      }));
    } else if (chart.layerName) {
      layer.setSource(new TileWMS({
        url: DHN_WMS_URL,
        params: {
          LAYERS: chart.layerName,
          TILED: true,
          FORMAT: "image/png",
          TRANSPARENT: true,
        },
        serverType: "geoserver",
        attributions: `Carta Náutica Raster — DHN/CHM · IDEM-DHN · ${selectedDhnChart}`,
      }));
    }
    layer.setVisible(baseMode === "dhn");
  }, [selectedDhnChart, baseMode, dhnCharts]);

  useEffect(() => {
    streetLayerRef.current?.setVisible(true);
    dhnLayerRef.current?.setVisible(baseMode === "dhn" && Boolean(selectedDhnChart));
  }, [baseMode, selectedDhnChart]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    refreshCredits();
    loadAisLibrary();
  }, []);

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

  const exactMatch = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return matches.find((m) => m.name.toLowerCase() === q) || null;
  }, [matches, nameQuery]);

  const trackedSource = tracked ? sourceInfo(tracked.dataSource) : null;
  const trackedAge = tracked ? positionAgeLabel(tracked.positionReceived || tracked.updateTime) : null;
  const trackedProviderDate = tracked ? parseProviderTime(tracked.positionReceived || tracked.updateTime) : null;
  const savedKeys = useMemo(() => new Set(savedVessels.map((item) => item.vesselKey)), [savedVessels]);
  const trackedKey = tracked ? vesselKeyFrom(tracked) : "";

  return (
    <section className="ais-page ais-v61-page ais-v62-page">
      <div className="ais-topbar">
        <div>
          <small>MONITORAMENTO MARÍTIMO</small>
          <h2>AIS — posição do barco</h2>
          <p>Busca pelo nome e posição AIS individual, com horário e origem do sinal bem destacados.</p>
        </div>
        <div className="ais-live-box">
          <span className={`ais-live-dot ${status === "ready" ? "connected" : status === "loading" ? "connecting" : status}`} />
          <div>
            <b>{statusMessage}</b>
            <small>{credits != null ? `${credits} créditos restantes` : "Saldo não carregado"}{lastFetch ? ` · atualizado ${relativeTime(lastFetch)}` : ""}</small>
          </div>
        </div>
      </div>

      <div className="ais-name-search-card">
        <div className="ais-name-search-head">
          <div className="ais-name-title"><Ship /><span><b>LOCALIZAR EMBARCAÇÃO</b><small>1 crédito para procurar o nome + 1 crédito para buscar a posição</small></span></div>
          <div className="ais-credit-flow"><span>1 CR</span><em>Nome</em><i>→</i><span>1 CR</span><em>Posição</em><strong>= 2 créditos</strong></div>
        </div>
        <form className="ais-name-form" onSubmit={searchByName}>
          <label>
            <span>Nome do barco</span>
            <div><Search /><input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="Ex.: ASTRO SOL I" autoComplete="off" /></div>
          </label>
          <button type="submit" disabled={status === "loading"}>
            {status === "loading" ? <RefreshCw className="spin" /> : <Search />}
            {status === "loading" ? "CONSULTANDO..." : "BUSCAR BARCO"}
          </button>
        </form>

        {matches.length > 0 && (
          <div className="ais-name-results">
            <div className="ais-name-results-head"><span><b>{matchTotal}</b> resultado(s)</span><small>Escolha o barco certo para gastar apenas +1 crédito na posição</small></div>
            <div className="ais-name-results-grid">
              {matches.slice(0, 12).map((match, index) => {
                const id = vesselIdentifier(match) || `${match.name}-${index}`;
                const key = vesselKeyFrom(match);
                const isSaved = key ? savedKeys.has(key) : false;
                const isTracked = Boolean(tracked && ((tracked.mmsi && tracked.mmsi === match.mmsi) || (tracked.imo && tracked.imo === match.imo)));
                return (
                  <article key={`${id}-${index}`} className={isTracked ? "active" : ""}>
                    <span className="ais-result-ship"><Ship /></span>
                    <div className="ais-result-main">
                      <b>{match.name || "Sem nome"}</b>
                      <small>{match.typeSpecific || match.shipType || "Tipo não informado"}{match.country ? ` · ${match.country}` : ""}</small>
                      <em>MMSI {match.mmsi || "—"} · IMO {match.imo || "—"}{match.callsign ? ` · ${match.callsign}` : ""}</em>
                    </div>
                    <div className="ais-result-actions">
                      <button type="button" onClick={() => getVesselPosition(match)} disabled={status === "loading"}>
                        <MapPinned /> {isTracked ? "NO MAPA" : "VER POSIÇÃO · 1 CR"}
                      </button>
                      <button type="button" className={isSaved ? "saved" : ""} onClick={() => isSaved ? removeSavedVessel(key) : saveVessel(match)}>
                        <Bookmark /> {isSaved ? "SALVO" : "SALVAR"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {exactMatch && matches.length > 1 && <small className="ais-exact-hint">Correspondência exata encontrada: <b>{exactMatch.name}</b>.</small>}
          </div>
        )}
      </div>

      <div className="ais-library-grid">
        <section className="ais-saved-folder">
          <div className="ais-library-head">
            <div><FolderHeart /><span><small>PASTA</small><b>Barcos salvos</b><em>{savedVessels.length} embarcação(ões)</em></span></div>
            {libraryLoading && <RefreshCw className="spin" />}
          </div>
          {savedVessels.length ? (
            <div className="ais-saved-list">
              {savedVessels.slice(0, 12).map((item) => {
                const hasPosition = item.lastLatitude != null && item.lastLongitude != null;
                return (
                  <article key={item.vesselKey}>
                    <button className="ais-saved-main" type="button" onClick={() => openSavedVessel(item)} disabled={!hasPosition}>
                      <span><Ship /></span>
                      <div><b>{item.name}</b><small>MMSI {item.mmsi || "—"} · IMO {item.imo || "—"}</small><em>{item.lastPositionReceived || item.lastUpdateTime || "Posição ainda não consultada"}</em></div>
                    </button>
                    <div className="ais-saved-actions">
                      <button type="button" title="Atualizar posição · 1 crédito" onClick={() => getVesselPosition({ name: item.name, mmsi: item.mmsi || "", imo: item.imo || "", country: item.country || "", countryIso: "", shipType: item.vesselType || "", typeSpecific: item.vesselType || "", callsign: item.callsign || "" }, true)}><RefreshCw /></button>
                      <button type="button" className="danger" title="Remover dos salvos" onClick={() => removeSavedVessel(item.vesselKey)}><Trash2 /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="ais-library-empty"><Bookmark /><span>Salve os barcos que você consulta com frequência. Abrir um barco salvo não gasta créditos.</span></div>
          )}
        </section>

        <section className="ais-history-panel">
          <div className="ais-library-head">
            <div><History /><span><small>CONSULTAS</small><b>Histórico AIS</b><em>{historyItems.length} posição(ões) registradas</em></span></div>
            <button type="button" className="ais-clear-history" onClick={clearAisHistory} disabled={!historyItems.length}><Trash2 /> Limpar histórico</button>
          </div>
          {historyItems.length ? (
            <div className="ais-history-list">
              {historyItems.slice(0, 14).map((item) => (
                <button type="button" key={item.id} onClick={() => openHistoryItem(item)}>
                  <span className="ais-history-icon"><History /></span>
                  <div><b>{item.name}</b><small>{formatCoordMarine(Number(item.latitude), true)} · {formatCoordMarine(Number(item.longitude), false)}</small></div>
                  <em>{formatLocalDateTime(new Date(item.queriedAt))}</em>
                </button>
              ))}
            </div>
          ) : (
            <div className="ais-library-empty"><History /><span>As posições consultadas aparecerão aqui automaticamente. O histórico não consome créditos para abrir.</span></div>
          )}
        </section>
      </div>

      <div className="ais-shell ais-v61-shell">
        <div ref={hostRef} className="ais-map" aria-label="Mapa da posição AIS da embarcação" />

        <div className="ais-map-tools ais-left-tools">
          <button type="button" onClick={() => zoomBy(1)} title="Aumentar zoom"><Plus /></button>
          <button type="button" onClick={() => zoomBy(-1)} title="Diminuir zoom"><Minus /></button>
          <button type="button" onClick={locateDevice} title="Minha localização"><LocateFixed /></button>
          <button type="button" onClick={() => centerOn(fallbackLat, fallbackLon, 11)} title="Voltar para a última largada"><Crosshair /></button>
          {tracked && <button type="button" onClick={() => centerOn(tracked.lat, tracked.lon, 12)} title="Centralizar no barco"><Ship /></button>}
        </div>

        <div className="ais-map-header-controls">
          <div className="ais-base-toggle">
            <button className={baseMode === "dhn" ? "active" : ""} onClick={() => setMapMode("dhn")} title="Carta Náutica Raster oficial da Marinha"><MapPinned /> Marinha</button>
            <button className={baseMode === "map" ? "active" : ""} onClick={() => setMapMode("map")}><Navigation /> Mapa</button>
          </div>
        </div>

        {baseMode === "dhn" && (
          <div className="ais-dhn-control ais-v61-dhn">
            <div className="ais-dhn-head">
              <span><MapPinned /><b>Carta Náutica da Marinha</b></span>
              <em>{dhnCharts.length} disponíveis</em>
            </div>
            {dhnCharts.length ? (
              <>
                <select value={selectedDhnChart} onChange={(e) => { setDhnAuto(false); setSelectedDhnChart(e.target.value); }} aria-label="Selecionar carta DHN">
                  {dhnCharts.map((chart) => (
                    <option key={chart.number} value={chart.number}>{chart.number} — {chart.title}{chart.scale ? ` · 1:${Number(chart.scale).toLocaleString("pt-BR")}` : ""}{chart.source === "wms" ? " · OFICIAL ONLINE" : " · LOCAL"}</option>
                  ))}
                </select>
                <label className="ais-dhn-auto"><input type="checkbox" checked={dhnAuto} onChange={(e) => setDhnAuto(e.target.checked)} /><span>Automática pela posição e zoom</span></label>
                <small>{dhnLoadMessage}</small>
              </>
            ) : (
              <div className="ais-dhn-missing"><b>Serviço de cartas da Marinha indisponível</b><span>O painel tentará novamente ao recarregar. O mapa comum continua disponível.</span></div>
            )}
          </div>
        )}

        {!tracked && (
          <div className="ais-v61-map-empty"><Radio /><b>Nenhum barco selecionado</b><span>Procure o nome acima. Ao escolher a embarcação, a posição aparece aqui.</span></div>
        )}

        <div className="ais-bottom-status">
          <span><Anchor /> Zoom {zoom}</span>
          {baseMode === "dhn" && <span><MapPinned /> {selectedDhnChart ? `DHN ${selectedDhnChart}` : "DHN"}</span>}
          <span>{formatCoord(center.lat, true)} · {formatCoord(center.lon, false)}</span>
          {devicePosition && <span className="ais-gps-ok"><LocateFixed /> GPS ativo</span>}
        </div>
      </div>

      {tracked && (
        <div className="ais-v63-result-wrap">
          <div className="ais-vessel-card ais-v61-vessel-card ais-v62-vessel-card ais-v63-below-card">
            <div className="ais-v62-card-head">
              <div>
                <small>EMBARCAÇÃO LOCALIZADA</small>
                <h3>{tracked.name || `MMSI ${tracked.mmsi}`}</h3>
                <em>MMSI {tracked.mmsi || "—"}{tracked.imo ? ` · IMO ${tracked.imo}` : ""}</em>
              </div>
              {trackedSource && (
                <div className={`ais-v62-source-badge ${trackedSource.className}`}>
                  <Radio />
                  <span>FONTE DA POSIÇÃO</span>
                  <b>{trackedSource.title}</b>
                  <small>{trackedSource.short}</small>
                </div>
              )}
            </div>

            <div className="ais-v62-position-hero">
              <small>POSIÇÃO AIS RECEBIDA</small>
              <strong>{formatCoordMarine(tracked.lat, true)}</strong>
              <strong>{formatCoordMarine(tracked.lon, false)}</strong>
              <span>WGS84 · graus e minutos decimais</span>
            </div>

            <div className="ais-v62-time-row">
              <div>
                <small>HORÁRIO DA POSIÇÃO</small>
                <b>{trackedProviderDate ? formatLocalDateTime(trackedProviderDate) : (tracked.positionReceived || "Não informado")}</b>
                {tracked.positionReceived && <em>{tracked.positionReceived}</em>}
                {trackedAge && <strong className={trackedAge.className}>{trackedAge.label}</strong>}
              </div>
              <div>
                <small>CONSULTA REALIZADA AGORA</small>
                <b>{formatLocalDateTime(clockNow)}</b>
                <em>Horário local deste dispositivo</em>
                <strong className="fresh">CONSULTA ONLINE</strong>
              </div>
            </div>

            <div className="ais-detail-grid ais-v62-detail-grid">
              <span><small>VELOCIDADE</small><b>{tracked.sog != null ? `${Number(tracked.sog).toFixed(1)} kn` : "—"}</b></span>
              <span><small>RUMO</small><b>{tracked.cog != null ? `${Math.round(tracked.cog)}°` : "—"}</b></span>
              <span><small>PROA</small><b>{tracked.heading != null && tracked.heading < 511 ? `${Math.round(tracked.heading)}°` : "—"}</b></span>
              <span><small>STATUS</small><b>{tracked.navStatusText || "Não informado"}</b></span>
              <span><small>DESTINO</small><b>{tracked.destination || "—"}</b></span>
              <span><small>DADOS ATUALIZADOS</small><b>{tracked.updateTime || "—"}</b></span>
            </div>

            <div className="ais-v62-source-note">
              <b>{trackedSource?.className === "satellite" ? "Posição recebida por AIS via satélite." : trackedSource?.className === "terrestrial" ? "Esta posição foi informada pela API como AIS terrestre." : "Origem AIS conforme informada pelo provedor."}</b>
              <span>O painel identifica como satélite somente quando a Data Docked devolve a fonte como Satellite/S-AIS.</span>
            </div>

            <div className="ais-v64-card-actions">
              <button className="ais-refresh-position" type="button" onClick={() => getVesselPosition({
                name: tracked.name || "",
                mmsi: tracked.mmsi,
                imo: tracked.imo || "",
                country: "",
                countryIso: "",
                shipType: "",
                typeSpecific: tracked.vesselType || "",
                callsign: tracked.callsign || "",
              }, true)} disabled={status === "loading"}>
                <RefreshCw /> ATUALIZAR POSIÇÃO · 1 CRÉDITO
              </button>
              <button className={`ais-save-current ${trackedKey && savedKeys.has(trackedKey) ? "saved" : ""}`} type="button" onClick={() => trackedKey && savedKeys.has(trackedKey) ? removeSavedVessel(trackedKey) : saveVessel(tracked)}>
                <Bookmark /> {trackedKey && savedKeys.has(trackedKey) ? "SALVO NA PASTA" : "SALVAR BARCO"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="ais-footnote ais-v61-footnote">
        <b>Data Docked: Vessel by Name + Vessel Location</b>
        <span>A primeira localização normalmente consome 2 créditos: 1 para identificar o barco pelo nome e 1 para obter sua posição. Atualizações posteriores da posição consomem 1 crédito cada. A chave da API permanece protegida no servidor.</span>
      </div>
    </section>
  );
}
