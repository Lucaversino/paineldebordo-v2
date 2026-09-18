"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  Crosshair,
  LocateFixed,
  MapPinned,
  Minus,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Ship,
  Waves,
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
import { fromLonLat, toLonLat } from "ol/proj";

const OCEAN_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}";
const OCEAN_REFERENCE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}";
const SEAMARK_TILES = "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png";
const DHN_TILE_BASE = (process.env.NEXT_PUBLIC_DHN_TILE_BASE_URL || "/cartas").replace(/\/$/, "");

type Props = {
  defaultLat?: number | null;
  defaultLon?: number | null;
};

type BaseMode = "dhn" | "nautical" | "map";
type AisStatus = "idle" | "loading" | "ready" | "error" | "config";

type DhnChart = {
  number: string;
  title: string;
  groups?: string[];
  scale?: number | null;
  bounds?: [number, number, number, number] | null;
  files?: string[];
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
  const oceanLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const oceanReferenceLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const streetLayerRef = useRef<TileLayer<OSM> | null>(null);
  const seamarkLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const dhnLayerRef = useRef<TileLayer<XYZ> | null>(null);
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
  const [baseMode, setBaseMode] = useState<BaseMode>("nautical");
  const [dhnCharts, setDhnCharts] = useState<DhnChart[]>([]);
  const [dhnCatalogCount, setDhnCatalogCount] = useState(0);
  const [dhnAuto, setDhnAuto] = useState(true);
  const [selectedDhnChart, setSelectedDhnChart] = useState("");
  const [dhnLoadMessage, setDhnLoadMessage] = useState("Carregando catálogo DHN...");
  const [clockNow, setClockNow] = useState(() => new Date());

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
      await refreshCredits();
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
    const hasDhn = dhnCharts.length > 0 && Boolean(selectedDhnChart);
    oceanLayerRef.current?.setVisible(mode === "nautical" || (mode === "dhn" && !hasDhn));
    oceanReferenceLayerRef.current?.setVisible(mode === "nautical");
    streetLayerRef.current?.setVisible(mode === "map");
    seamarkLayerRef.current?.setVisible(mode !== "dhn");
    dhnLayerRef.current?.setVisible(mode === "dhn" && hasDhn);
  }

  useEffect(() => {
    if (!hostRef.current) return;
    const ocean = new TileLayer({ visible: true, source: new XYZ({ url: OCEAN_TILES, attributions: "Esri · GEBCO · NOAA" }) });
    const oceanReference = new TileLayer({ visible: true, source: new XYZ({ url: OCEAN_REFERENCE_TILES, attributions: "Esri Ocean Reference" }) });
    const street = new TileLayer({ visible: false, source: new OSM() });
    const dhn = new TileLayer({
      visible: false,
      opacity: 1,
      source: new XYZ({
        url: `${DHN_TILE_BASE}/__nenhuma__/{z}/{x}/{y}.png`,
        attributions: "Carta Raster DHN/CHM",
        crossOrigin: "anonymous",
      }),
    });
    const seamarks = new TileLayer({ opacity: 1, source: new XYZ({ url: SEAMARK_TILES, maxZoom: 18, attributions: "OpenSeaMap" }) });
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
      layers: [ocean, street, dhn, oceanReference, seamarks, vesselLayer, positionLayer],
      view,
    });

    mapRef.current = map;
    vesselSourceRef.current = vesselSource;
    positionSourceRef.current = positionSource;
    oceanLayerRef.current = ocean;
    oceanReferenceLayerRef.current = oceanReference;
    streetLayerRef.current = street;
    seamarkLayerRef.current = seamarks;
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
      fetch("/cartas/catalogo.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : { charts: [] }).catch(() => ({ charts: [] })),
      fetch("/cartas/installed.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : { charts: [] }).catch(() => ({ charts: [] })),
    ]).then(([catalog, installed]) => {
      if (cancelled) return;
      const catalogList = Array.isArray(catalog?.charts) ? catalog.charts : [];
      const installedList = Array.isArray(installed?.charts) ? installed.charts : [];
      setDhnCatalogCount(catalogList.length);
      setDhnCharts(installedList);
      if (installedList.length) {
        const first = chooseDhnChart(installedList, fallbackLon, fallbackLat, 10.5) || installedList[0];
        setSelectedDhnChart(first.number);
        setDhnLoadMessage(`${installedList.length} cartas DHN instaladas`);
        setBaseMode("dhn");
      } else {
        setDhnLoadMessage(`Catálogo com ${catalogList.length || "várias"} cartas; tiles ainda não instalados`);
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
    layer.setSource(new XYZ({
      url: `${DHN_TILE_BASE}/${selectedDhnChart}/{z}/{x}/{y}.png`,
      attributions: `Carta Raster DHN/CHM ${selectedDhnChart}`,
      crossOrigin: "anonymous",
    }));
    layer.setVisible(baseMode === "dhn");
  }, [selectedDhnChart, baseMode]);

  useEffect(() => {
    const hasDhn = dhnCharts.length > 0 && Boolean(selectedDhnChart);
    oceanLayerRef.current?.setVisible(baseMode === "nautical" || (baseMode === "dhn" && !hasDhn));
    oceanReferenceLayerRef.current?.setVisible(baseMode === "nautical");
    streetLayerRef.current?.setVisible(baseMode === "map");
    seamarkLayerRef.current?.setVisible(baseMode !== "dhn");
    dhnLayerRef.current?.setVisible(baseMode === "dhn" && hasDhn);
  }, [baseMode, dhnCharts.length, selectedDhnChart]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    refreshCredits();
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
                const isTracked = Boolean(tracked && ((tracked.mmsi && tracked.mmsi === match.mmsi) || (tracked.imo && tracked.imo === match.imo)));
                return (
                  <article key={`${id}-${index}`} className={isTracked ? "active" : ""}>
                    <span className="ais-result-ship"><Ship /></span>
                    <div className="ais-result-main">
                      <b>{match.name || "Sem nome"}</b>
                      <small>{match.typeSpecific || match.shipType || "Tipo não informado"}{match.country ? ` · ${match.country}` : ""}</small>
                      <em>MMSI {match.mmsi || "—"} · IMO {match.imo || "—"}{match.callsign ? ` · ${match.callsign}` : ""}</em>
                    </div>
                    <button type="button" onClick={() => getVesselPosition(match)} disabled={status === "loading"}>
                      <MapPinned /> {isTracked ? "NO MAPA" : "VER POSIÇÃO · 1 CR"}
                    </button>
                  </article>
                );
              })}
            </div>
            {exactMatch && matches.length > 1 && <small className="ais-exact-hint">Correspondência exata encontrada: <b>{exactMatch.name}</b>.</small>}
          </div>
        )}
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
            <button className={baseMode === "dhn" ? "active" : ""} onClick={() => setMapMode("dhn")} title="Carta Raster da Marinha"><MapPinned /> Marinha</button>
            <button className={baseMode === "nautical" ? "active" : ""} onClick={() => setMapMode("nautical")}><Waves /> Oceano</button>
            <button className={baseMode === "map" ? "active" : ""} onClick={() => setMapMode("map")}><Navigation /> Mapa</button>
          </div>
        </div>

        {baseMode === "dhn" && (
          <div className="ais-dhn-control ais-v61-dhn">
            <div className="ais-dhn-head">
              <span><MapPinned /><b>Carta Raster Marinha</b></span>
              <em>{dhnCharts.length}/{dhnCatalogCount || "—"} instaladas</em>
            </div>
            {dhnCharts.length ? (
              <>
                <select value={selectedDhnChart} onChange={(e) => { setDhnAuto(false); setSelectedDhnChart(e.target.value); }} aria-label="Selecionar carta DHN">
                  {dhnCharts.map((chart) => (
                    <option key={chart.number} value={chart.number}>{chart.number} — {chart.title}{chart.scale ? ` · 1:${Number(chart.scale).toLocaleString("pt-BR")}` : ""}</option>
                  ))}
                </select>
                <label className="ais-dhn-auto"><input type="checkbox" checked={dhnAuto} onChange={(e) => setDhnAuto(e.target.checked)} /><span>Automática pela posição e zoom</span></label>
                <small>{dhnLoadMessage}</small>
              </>
            ) : (
              <div className="ais-dhn-missing"><b>Cartas ainda não convertidas para o mapa</b><span>Rode os comandos de instalação das cartas DHN para gerar os tiles XYZ.</span></div>
            )}
          </div>
        )}

        {tracked ? (
          <div className="ais-vessel-card ais-v61-vessel-card ais-v62-vessel-card">
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
          </div>
        ) : (
          <div className="ais-v61-map-empty"><Radio /><b>Nenhum barco selecionado</b><span>Procure o nome acima. Ao escolher a embarcação, a posição aparece aqui.</span></div>
        )}

        <div className="ais-bottom-status">
          <span><Anchor /> Zoom {zoom}</span>
          {baseMode === "dhn" && <span><MapPinned /> {selectedDhnChart ? `DHN ${selectedDhnChart}` : "DHN sem tiles"}</span>}
          <span>{formatCoord(center.lat, true)} · {formatCoord(center.lon, false)}</span>
          {devicePosition && <span className="ais-gps-ok"><LocateFixed /> GPS ativo</span>}
        </div>
      </div>

      <div className="ais-footnote ais-v61-footnote">
        <b>Data Docked: Vessel by Name + Vessel Location</b>
        <span>A primeira localização normalmente consome 2 créditos: 1 para identificar o barco pelo nome e 1 para obter sua posição. Atualizações posteriores da posição consomem 1 crédito cada. A chave da API permanece protegida no servidor.</span>
      </div>
    </section>
  );
}
