"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import CircleGeom from "ol/geom/Circle";
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text } from "ol/style";
import { fromLonLat, toLonLat } from "ol/proj";

const OCEAN_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}";
const OCEAN_REFERENCE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}";
const SEAMARK_TILES = "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png";
const DHN_TILE_BASE = (process.env.NEXT_PUBLIC_DHN_TILE_BASE_URL || "/cartas").replace(/\/$/, "");

type Vessel = {
  mmsi: string;
  name?: string;
  lat?: number;
  lon?: number;
  sog?: number | null;
  cog?: number | null;
  heading?: number | null;
  vesselType?: string;
  navStatusText?: string;
  destination?: string;
  receivedAt: number;
};

type Props = {
  defaultLat?: number | null;
  defaultLon?: number | null;
};

type FilterMode = "all" | "moving" | "stopped";
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
  return `${Math.round(seconds / 60)} min`;
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
  const oceanReferenceLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const streetLayerRef = useRef<TileLayer<OSM> | null>(null);
  const seamarkLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const dhnLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const searchAreaSourceRef = useRef<VectorSource | null>(null);
  const selectedRef = useRef<string | null>(null);
  const filterRef = useRef<FilterMode>("all");
  const searchRef = useRef("");

  const [vessels, setVessels] = useState<Record<string, Vessel>>({});
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [query, setQuery] = useState("");
  const [baseMode, setBaseMode] = useState<BaseMode>("nautical");
  const [dhnCharts, setDhnCharts] = useState<DhnChart[]>([]);
  const [dhnCatalogCount, setDhnCatalogCount] = useState(0);
  const [dhnAuto, setDhnAuto] = useState(true);
  const [selectedDhnChart, setSelectedDhnChart] = useState("");
  const [dhnLoadMessage, setDhnLoadMessage] = useState("Carregando catálogo DHN...");
  const [zoom, setZoom] = useState(10);
  const [center, setCenter] = useState({ lat: fallbackLat, lon: fallbackLon });
  const [devicePosition, setDevicePosition] = useState<{ lat: number; lon: number } | null>(null);
  const [status, setStatus] = useState<AisStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Data Docked pronto — clique atualizar AIS");
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(50);
  const [lastArea, setLastArea] = useState<{ lat: number; lon: number; radius: number } | null>(null);

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

  function drawSearchArea(lat: number, lon: number, radius: number) {
    const source = searchAreaSourceRef.current;
    if (!source) return;
    source.clear();
    const webMercatorRadius = (radius * 1000) / Math.max(0.3, Math.cos((lat * Math.PI) / 180));
    source.addFeature(new Feature({ geometry: new CircleGeom(fromLonLat([lon, lat]), webMercatorRadius) }));
  }

  function buildVesselStyle(vessel: Vessel, selected: boolean, currentZoom: number) {
    if (!featureVisible(vessel)) return [];
    const speed = Number(vessel.sog || 0);
    const fillColor = selected ? "#ffffff" : speed >= 2 ? "#22d3a6" : speed >= 0.5 ? "#e8bd54" : "#8aa4ab";
    const strokeColor = selected ? "#042c32" : "#061b21";
    const angle = Number.isFinite(vessel.heading) && Number(vessel.heading) < 511 ? Number(vessel.heading) : Number(vessel.cog || 0);
    return new Style({
      image: new RegularShape({
        points: 3,
        radius: selected ? 11 : 9,
        angle: 0,
        rotation: (angle * Math.PI) / 180,
        rotateWithView: true,
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({ color: strokeColor, width: selected ? 2.6 : 1.6 }),
      }),
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
    feature.setStyle(() => buildVesselStyle(vessel, selectedRef.current === vessel.mmsi, mapRef.current?.getView().getZoom() || 10));
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
      // O saldo é informativo; falhar aqui não bloqueia o mapa.
    }
  }

  async function fetchArea() {
    const map = mapRef.current;
    if (!map) return;
    const [lon, lat] = toLonLat(map.getView().getCenter() || fromLonLat([center.lon, center.lat]));
    setStatus("loading");
    setStatusMessage(`Consultando AIS em raio de ${radiusKm} km...`);
    drawSearchArea(lat, lon, radiusKm);

    try {
      const params = new URLSearchParams({
        action: "area",
        latitude: String(lat),
        longitude: String(lon),
        radius: String(radiusKm),
      });
      const response = await fetch(`/api/ais?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 503) setStatus("config");
        else setStatus("error");
        setStatusMessage(data?.error || "Falha ao consultar Data Docked.");
        return;
      }

      const rows = Array.isArray(data?.vessels) ? data.vessels : [];
      const next: Record<string, Vessel> = {};
      for (const raw of rows) {
        const vessel: Vessel = {
          mmsi: String(raw?.mmsi || ""),
          name: raw?.name || "",
          lat: Number(raw?.lat),
          lon: Number(raw?.lon),
          sog: raw?.sog == null ? null : Number(raw.sog),
          cog: raw?.cog == null ? null : Number(raw.cog),
          heading: raw?.heading == null ? null : Number(raw.heading),
          vesselType: raw?.vesselType || "",
          receivedAt: Number(raw?.receivedAt) || Date.now(),
        };
        if (!vessel.mmsi || !Number.isFinite(vessel.lat) || !Number.isFinite(vessel.lon)) continue;
        next[vessel.mmsi] = vessel;
      }

      vesselSourceRef.current?.clear();
      setVessels(next);
      Object.values(next).forEach(upsertFeature);
      setLastFetch(Date.now());
      setLastArea({ lat: Number(data?.queryCenter?.lat ?? lat), lon: Number(data?.queryCenter?.lon ?? lon), radius: Number(data?.radiusKm ?? radiusKm) });
      setStatus("ready");
      setStatusMessage(rows.length ? `${rows.length} embarcações encontradas` : "Consulta concluída — nenhuma embarcação nesta área");
      await refreshCredits();
    } catch {
      setStatus("error");
      setStatusMessage("Falha de rede ao consultar o AIS.");
    }
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
    const searchAreaSource = new VectorSource();
    const searchAreaLayer = new VectorLayer({
      source: searchAreaSource,
      style: new Style({
        fill: new Fill({ color: "rgba(32, 211, 170, 0.05)" }),
        stroke: new Stroke({ color: "rgba(32, 211, 170, 0.95)", width: 2, lineDash: [8, 7] }),
      }),
    });
    const positionSource = new VectorSource();
    const positionLayer = new VectorLayer({
      source: positionSource,
      style: new Style({
        image: new CircleStyle({ radius: 8, fill: new Fill({ color: "#2a92ff" }), stroke: new Stroke({ color: "#ffffff", width: 3 }) }),
      }),
    });
    const vesselSource = new VectorSource();
    const vesselLayer = new VectorLayer({ source: vesselSource, declutter: true });
    const view = new View({ center: fromLonLat([fallbackLon, fallbackLat]), zoom: 10.5, minZoom: 3, maxZoom: 18 });
    const map = new Map({
      target: hostRef.current,
      controls: [],
      layers: [ocean, street, dhn, oceanReference, seamarks, searchAreaLayer, vesselLayer, positionLayer],
      view,
    });

    mapRef.current = map;
    vesselLayerRef.current = vesselLayer;
    vesselSourceRef.current = vesselSource;
    positionSourceRef.current = positionSource;
    oceanLayerRef.current = ocean;
    oceanReferenceLayerRef.current = oceanReference;
    streetLayerRef.current = street;
    seamarkLayerRef.current = seamarks;
    dhnLayerRef.current = dhn;
    searchAreaSourceRef.current = searchAreaSource;

    const updateCenter = () => {
      const [lon, lat] = toLonLat(view.getCenter() || fromLonLat([fallbackLon, fallbackLat]));
      setCenter({ lat, lon });
      setZoom(Math.round(view.getZoom() || 10));
      drawSearchArea(lat, lon, radiusKm);
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
    setTimeout(() => drawSearchArea(fallbackLat, fallbackLon, radiusKm), 100);

    return () => {
      ro.disconnect();
      map.un("moveend", updateCenter);
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    drawSearchArea(center.lat, center.lon, radiusKm);
  }, [radiusKm]);

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
    refreshCredits();
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
    drawSearchArea(lat, lon, radiusKm);
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
        setStatusMessage("GPS localizado — clique atualizar AIS para consultar esta área");
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

  function selectVessel(vessel: Vessel) {
    if (vessel.lat == null || vessel.lon == null) return;
    setSelectedMmsi(vessel.mmsi);
    centerOn(vessel.lat, vessel.lon, Math.max(12, mapRef.current?.getView().getZoom() || 10));
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
      .slice(0, 50);
  }, [vessels, filter, query, center.lat, center.lon]);

  const visibleCount = list.length;
  const totalCount = Object.keys(vessels).length;

  return (
    <section className="ais-page">
      <div className="ais-topbar">
        <div>
          <small>MONITORAMENTO MARÍTIMO</small>
          <h2>AIS — Data Docked</h2>
          <p>Busca de embarcações por área sobre mapa oceânico ou Carta Raster oficial DHN/CHM.</p>
        </div>
        <div className="ais-live-box">
          <span className={`ais-live-dot ${status === "ready" ? "connected" : status === "loading" ? "connecting" : status}`} />
          <div>
            <b>{statusMessage}</b>
            <small>{credits != null ? `${credits} créditos restantes` : "Saldo não carregado"}{lastFetch ? ` · atualizado ${relativeTime(lastFetch)}` : ""}</small>
          </div>
        </div>
      </div>

      <div className="ais-shell">
        <div ref={hostRef} className="ais-map" aria-label="Mapa AIS de embarcações" />

        <div className="ais-map-tools ais-left-tools">
          <button type="button" onClick={() => zoomBy(1)} title="Aumentar zoom"><Plus /></button>
          <button type="button" onClick={() => zoomBy(-1)} title="Diminuir zoom"><Minus /></button>
          <button type="button" onClick={locateDevice} title="Minha localização"><LocateFixed /></button>
          <button type="button" onClick={() => centerOn(fallbackLat, fallbackLon, 11)} title="Voltar para a última posição"><Crosshair /></button>
          <button type="button" onClick={fetchArea} disabled={status === "loading"} title="Consultar barcos nesta área"><RefreshCw /></button>
        </div>

        <div className="ais-map-header-controls">
          <div className="ais-base-toggle">
            <button className={baseMode === "dhn" ? "active" : ""} onClick={() => setMapMode("dhn")} title="Carta Raster da Marinha"><MapPinned /> Marinha</button>
            <button className={baseMode === "nautical" ? "active" : ""} onClick={() => setMapMode("nautical")}><Waves /> Oceano</button>
            <button className={baseMode === "map" ? "active" : ""} onClick={() => setMapMode("map")}><Navigation /> Mapa</button>
          </div>
          <button className="ais-list-toggle" onClick={() => setPanelOpen((v) => !v)}><Ship /> {totalCount} barcos</button>
        </div>

        <div className="ais-provider-control">
          <div><b>Data Docked AIS</b><small>Área terrestre · cada busca por área custa 10 créditos</small></div>
          <label>
            <span>Raio</span>
            <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
              <option value={10}>10 km</option>
              <option value={25}>25 km</option>
              <option value={50}>50 km</option>
            </select>
          </label>
          <button type="button" onClick={fetchArea} disabled={status === "loading"}>
            <RefreshCw /> {status === "loading" ? "Consultando..." : "Buscar barcos"}
          </button>
        </div>

        {baseMode === "dhn" && (
          <div className="ais-dhn-control">
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
              <div className="ais-dhn-missing"><b>Cartas ainda não convertidas para o mapa</b><span>Rode os comandos de instalação da v58/v59 para gerar os tiles XYZ.</span></div>
            )}
          </div>
        )}

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
                  <span className="ais-vessel-name"><b>{vessel.name || `MMSI ${vessel.mmsi}`}</b><small>{vessel.vesselType || vessel.mmsi} · {vessel.distance < 10 ? vessel.distance.toFixed(1) : Math.round(vessel.distance)} km</small></span>
                  <span className="ais-speed"><b>{Number(vessel.sog || 0).toFixed(1)}</b><small>kn</small></span>
                </button>
              )) : (
                <div className="ais-list-empty"><Radio /><b>Nenhum barco carregado</b><span>Mova o mapa para a região desejada e toque em Buscar barcos. O círculo tracejado mostra a área consultada.</span></div>
              )}
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
              <span><small>TIPO</small><b>{selected.vesselType || "Não informado"}</b></span>
              <span><small>CONSULTA</small><b>{relativeTime(selected.receivedAt)}</b></span>
            </div>
            <p>{Math.abs(selected.lat).toFixed(5)}° {selected.lat < 0 ? "S" : "N"} · {Math.abs(selected.lon).toFixed(5)}° {selected.lon < 0 ? "W" : "E"}</p>
          </div>
        )}

        <div className="ais-bottom-status">
          <span><Anchor /> Zoom {zoom}</span>
          <span><Radio /> Raio {radiusKm} km</span>
          {lastArea && <span>Busca: {Math.abs(lastArea.lat).toFixed(1)}° {lastArea.lat < 0 ? "S" : "N"} · {Math.abs(lastArea.lon).toFixed(1)}° {lastArea.lon < 0 ? "W" : "E"}</span>}
          {baseMode === "dhn" && <span><MapPinned /> {selectedDhnChart ? `DHN ${selectedDhnChart}` : "DHN sem tiles"}</span>}
          <span>{Math.abs(center.lat).toFixed(3)}° {center.lat < 0 ? "S" : "N"} · {Math.abs(center.lon).toFixed(3)}° {center.lon < 0 ? "W" : "E"}</span>
          {devicePosition && <span className="ais-gps-ok"><LocateFixed /> GPS ativo</span>}
        </div>
      </div>

      <div className="ais-footnote">
        <b>Data Docked AIS + DHN/CHM Raster + Esri Ocean + OpenSeaMap</b>
        <span>A busca por área do Data Docked usa AIS terrestre e raio máximo de 50 km. Cada busca por área consome créditos. Não use o painel como única referência de navegação ou anticolisão.</span>
      </div>
    </section>
  );
}
