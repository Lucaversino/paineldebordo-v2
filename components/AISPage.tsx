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
  WalletCards,
} from "lucide-react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import Translate from "ol/interaction/Translate";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import CircleGeom from "ol/geom/Circle";
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text } from "ol/style";
import { fromLonLat, toLonLat } from "ol/proj";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

const DHN_WMS_URL = "https://idem.dhn.mar.mil.br/geoserver/wms";
const DHN_TILE_BASE = (process.env.NEXT_PUBLIC_DHN_TILE_BASE_URL || "/cartas").replace(/\/$/, "");

type Props = {
  defaultLat?: number | null;
  defaultLon?: number | null;
};

type BaseMode = "dhn" | "map";
type AisStatus = "idle" | "loading" | "ready" | "error" | "config";
type SearchMode = "vessel" | "area";
type MobilePanel = "search" | "areaSearch" | "saved" | "areaSaved" | "history" | null;
type SearchProvider = "premium" | "marinesia";

const MARINESIA_COOLDOWN_KEY = "painel-marinesia-cooldown-until";
const MARINESIA_AREA_CACHE_KEY = "painel-marinesia-area-cache-v1";

function readMarinesiaCooldown() {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(MARINESIA_COOLDOWN_KEY) || 0);
  return Number.isFinite(value) ? value : 0;
}

function writeMarinesiaCooldown(seconds = 1800) {
  if (typeof window === "undefined") return 0;
  const until = Date.now() + Math.max(1, seconds) * 1000;
  window.localStorage.setItem(MARINESIA_COOLDOWN_KEY, String(until));
  return until;
}

function readMarinesiaAreaCache(center: { lat: number; lon: number }) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MARINESIA_AREA_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.createdAt || Date.now() - Number(cached.createdAt) > 30 * 60_000) return null;
    const dLat = Math.abs(Number(cached.lat) - center.lat);
    const dLon = Math.abs(Number(cached.lon) - center.lon);
    if (dLat > 0.45 || dLon > 0.55) return null;
    return Array.isArray(cached.vessels) ? cached.vessels : null;
  } catch {
    return null;
  }
}

function writeMarinesiaAreaCache(center: { lat: number; lon: number }, vessels: unknown[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MARINESIA_AREA_CACHE_KEY, JSON.stringify({
      lat: center.lat,
      lon: center.lon,
      createdAt: Date.now(),
      vessels,
    }));
  } catch {}
}

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
  folder?: string | null;
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
  creditsUsed?: number | null;
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

function formatCoordOperational(value: number, latitude = true) {
  const hemisphere = latitude ? (value < 0 ? "S" : "N") : (value < 0 ? "W" : "E");
  const absolute = Math.abs(value);
  let degrees = Math.floor(absolute);
  let minutes = (absolute - degrees) * 60;
  if (Number(minutes.toFixed(2)) >= 60) {
    degrees += 1;
    minutes = 0;
  }
  const minuteDigits = minutes.toFixed(2).replace(".", "").padStart(4, "0");
  return `${degrees}º ${minuteDigits} ${hemisphere}`;
}

function isFishingVessel(vessel: Vessel) {
  const type = String(vessel.vesselType || "").toLowerCase();
  const status = String(vessel.navStatusText || "").toLowerCase();
  return /fishing|pesca|pesqueir/.test(type) || /(^|\D)30(\D|$)/.test(type) || /em pesca|engaged in fishing|fishing/.test(status);
}

function trackedDateParts(value?: string) {
  const date = parseProviderTime(value);
  if (!date) return { date: "DATA NÃO INFORMADA", time: "HORA —" };
  return {
    date: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date),
  };
}

function coordinateDigitsToDecimal(raw: string, latitude: boolean) {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length < 4) return null;
  const degreeDigits = latitude ? 2 : (digits.length >= 7 ? 3 : 2);
  const degrees = Number(digits.slice(0, degreeDigits));
  const minuteDigits = digits.slice(degreeDigits);
  if (!minuteDigits) return null;
  const wholeMinutes = Number(minuteDigits.slice(0, 2));
  const decimalMinutes = minuteDigits.slice(2) ? Number(`0.${minuteDigits.slice(2)}`) : 0;
  const minutes = wholeMinutes + decimalMinutes;
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || minutes >= 60) return null;
  const max = latitude ? 90 : 180;
  const value = degrees + minutes / 60;
  if (value > max) return null;
  return -value; // Painel operacional usa Sul/Oeste automaticamente.
}

function coordinateDigitsDisplay(raw: string, direction: "S" | "W") {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (!digits) return "";
  const degrees = digits.slice(0, 2);
  const minutes = digits.slice(2);
  return `${degrees}${minutes ? "º" : ""}${minutes}${digits ? ` ${direction}` : ""}`;
}

function parseProviderTime(value?: string) {
  if (!value) return null;
  const normalized = /UTC$/i.test(value.trim()) ? value.trim().replace(/ UTC$/i, " GMT") : value.trim();
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
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
  if (/marinesia/i.test(source)) {
    return { title: "AIS Free · Marinesia", short: "AIS FREE", className: "marinesia" };
  }
  if (/premium/i.test(source) || /aprs\.fi|aprsfi/i.test(source)) {
    return { title: "AIS Premium", short: "PREMIUM", className: "premium" };
  }
  if (/aisstream/i.test(source)) {
    return { title: "AISStream", short: "STREAM", className: "terrestrial" };
  }
  if (/vesselapi/i.test(source)) {
    return { title: "VesselAPI Free", short: "VESSEL FREE", className: "free" };
  }
  if (/kpler/i.test(source)) {
    return { title: "Kpler · camada automática", short: "AUTO", className: "free" };
  }
  return { title: source ? `AIS · ${source}` : "FONTE AIS", short: "AIS", className: "unknown" };
}

export default function AISPage({ defaultLat, defaultLon }: Props) {
  const fallbackLat = validCoordinate(defaultLat, 90) ?? -27.15;
  const fallbackLon = validCoordinate(defaultLon, 180) ?? -48.55;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  async function aisFetch(input: string, init: RequestInit = {}) {
    const makeRequest = async (token?: string | null) => {
      const headers = new Headers(init.headers || {});
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(input, {
        ...init,
        headers,
        credentials: "include",
        cache: "no-store",
        signal: init.signal || AbortSignal.timeout(input.startsWith("/api/ais-map") ? 20_000 : 16_000),
      });
    };

    const { data: sessionData } = await supabase.auth.getSession();
    let response = await makeRequest(sessionData.session?.access_token || null);
    if (response.status !== 401) return response;

    // Em PWA/mobile o cookie pode renovar alguns instantes depois da tela abrir.
    // Renova explicitamente a sessão uma vez e repete a chamada AIS.
    const { data: refreshed } = await supabase.auth.refreshSession();
    const token = refreshed.session?.access_token;
    if (!token) return response;
    response = await makeRequest(token);
    return response;
  }
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const vesselSourceRef = useRef<VectorSource | null>(null);
  const freeVesselSourceRef = useRef<VectorSource | null>(null);
  const positionSourceRef = useRef<VectorSource | null>(null);
  const areaSourceRef = useRef<VectorSource | null>(null);
  const streetLayerRef = useRef<TileLayer<OSM> | null>(null);
  const dhnLayerRef = useRef<TileLayer<XYZ | TileWMS> | null>(null);
  const nameCacheRef = useRef<Map<string, VesselMatch[]>>(new Map());
  const positionCacheRef = useRef<Map<string, Vessel>>(new Map());
  const mapVesselRegistryRef = useRef<Map<string, Vessel>>(new Map());
  const trackedRef = useRef<Vessel | null>(null);
  const searchModeRef = useRef<SearchMode>("vessel");
  const areaRadiusRef = useRef<50>(50);
  const freeLayerTimerRef = useRef<number | null>(null);
  const freeLayerRequestRef = useRef({ key: "", at: 0, seq: 0 });

  const [nameQuery, setNameQuery] = useState("");
  const [premiumQuery, setPremiumQuery] = useState("");
  const [freeQuery, setFreeQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("vessel");
  const [searchProvider, setSearchProvider] = useState<SearchProvider>("premium");
  const [marinesiaCooldownUntil, setMarinesiaCooldownUntil] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [areaRadius] = useState<50>(50);
  const [areaCenter, setAreaCenter] = useState<{ lat: number; lon: number } | null>({ lat: fallbackLat, lon: fallbackLon });
  const [manualLatDigits, setManualLatDigits] = useState("");
  const [manualLonDigits, setManualLonDigits] = useState("");
  const [manualCoordError, setManualCoordError] = useState("");
  const [mobileAreaAdvanced, setMobileAreaAdvanced] = useState(false);
  const [areaVessels, setAreaVessels] = useState<Vessel[]>([]);
  const [areaCost, setAreaCost] = useState<number | null>(null);
  const [freeMapVessels, setFreeMapVessels] = useState<Vessel[]>([]);
  const [freeMapSource, setFreeMapSource] = useState("AIS automático");
  const [freeMapStatus, setFreeMapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [freeMapUpdatedAt, setFreeMapUpdatedAt] = useState<number | null>(null);
  const [marinesiaConfigured, setMarinesiaConfigured] = useState(false);
  const [cardAnchor, setCardAnchor] = useState<{ left: number; top: number } | null>(null);
  const [cardPulse, setCardPulse] = useState(0);
  const [creditMenuOpen, setCreditMenuOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("ais-mobile-active");
    return () => document.body.classList.remove("ais-mobile-active");
  }, []);

  useEffect(() => {
    setMarinesiaCooldownUntil(readMarinesiaCooldown());
    const timer = window.setInterval(() => {
      const until = readMarinesiaCooldown();
      if (until > Date.now()) {
        setMarinesiaCooldownUntil(until);
      } else {
        setMarinesiaCooldownUntil(0);
        if (until) window.localStorage.removeItem(MARINESIA_COOLDOWN_KEY);
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { searchModeRef.current = searchMode; }, [searchMode]);
  useEffect(() => { areaRadiusRef.current = 50; if (areaCenter) drawAreaSelection(areaCenter.lat, areaCenter.lon, 50); }, [areaCenter]);
  const [matches, setMatches] = useState<VesselMatch[]>([]);
  const [matchTotal, setMatchTotal] = useState(0);
  const [tracked, setTracked] = useState<Vessel | null>(null);
  const [showEmptyHint, setShowEmptyHint] = useState(true);
  const [status, setStatus] = useState<AisStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Digite o nome do barco para localizar");
  const [credits, setCredits] = useState<number | null>(null);
  const [creditUnitPrice, setCreditUnitPrice] = useState(1);
  const [aisPricing, setAisPricing] = useState({ locateCredits: 2, updateCredits: 1, areaCredits: 10 });
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [center, setCenter] = useState({ lat: fallbackLat, lon: fallbackLon });
  const [devicePosition, setDevicePosition] = useState<{ lat: number; lon: number } | null>(null);
  const [zoom, setZoom] = useState(10);
  const [baseMode, setBaseMode] = useState<BaseMode>("map");
  const [dhnCharts, setDhnCharts] = useState<DhnChart[]>([]);
  const [dhnAuto, setDhnAuto] = useState(true);
  const [selectedDhnChart, setSelectedDhnChart] = useState("");
  const [dhnLoadMessage, setDhnLoadMessage] = useState("Conectando ao serviço oficial IDEM-DHN...");
  const [clockNow, setClockNow] = useState(() => new Date());
  const [savedVessels, setSavedVessels] = useState<SavedVessel[]>([]);
  const [historyItems, setHistoryItems] = useState<AisHistoryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  function buildVesselStyle(vessel: Vessel, currentZoom: number) {
    const angle = Number.isFinite(vessel.heading) && Number(vessel.heading) < 511
      ? Number(vessel.heading)
      : Number(vessel.cog || 0);
    const source = String(vessel.dataSource || "").toLowerCase();
    const markerColor = source.includes("marinesia")
      ? "#24c98c"
      : source.includes("vesselapi") || source.includes("free")
        ? "#2f8cff"
        : source.includes("kpler")
          ? "#2f8cff"
          : "#d8aa3f";
    return new Style({
      image: new RegularShape({
        points: 3,
        radius: 12,
        angle: 0,
        rotation: (angle * Math.PI) / 180,
        rotateWithView: true,
        fill: new Fill({ color: markerColor }),
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

  function buildFreeVesselStyle(vessel: Vessel, currentZoom: number) {
    const angle = Number.isFinite(vessel.heading) && Number(vessel.heading) < 511
      ? Number(vessel.heading)
      : Number(vessel.cog || 0);
    return new Style({
      image: new RegularShape({
        points: 3,
        radius: currentZoom >= 11 ? 9 : 7,
        angle: 0,
        rotation: (angle * Math.PI) / 180,
        rotateWithView: true,
        fill: new Fill({ color: "#2f8cff" }),
        stroke: new Stroke({ color: "#043039", width: 1.8 }),
      }),
      text: currentZoom >= 10
        ? new Text({
            text: (vessel.name || vessel.mmsi).slice(0, 22),
            offsetY: 16,
            font: "800 9px system-ui",
            fill: new Fill({ color: "#ecfffb" }),
            stroke: new Stroke({ color: "#05242b", width: 3 }),
          })
        : undefined,
    });
  }

  function normalizedVesselIds(vessel: Vessel) {
    return {
      mmsi: String(vessel?.mmsi || "").replace(/\D/g, ""),
      imo: String(vessel?.imo || "").replace(/\D/g, ""),
      name: String(vessel?.name || "").trim().toLowerCase().replace(/\s+/g, " "),
    };
  }

  function vesselRegistryKey(vessel: Vessel) {
    const ids = normalizedVesselIds(vessel);
    if (ids.mmsi) return `mmsi:${ids.mmsi}`;
    if (ids.imo && ids.imo !== "0") return `imo:${ids.imo}`;
    return ids.name ? `name:${ids.name}` : "";
  }

  function sameRegistryVessel(a: Vessel, b: Vessel) {
    const aa = normalizedVesselIds(a);
    const bb = normalizedVesselIds(b);
    if (aa.mmsi && bb.mmsi && aa.mmsi === bb.mmsi) return true;
    if (aa.imo && aa.imo !== "0" && bb.imo && bb.imo !== "0" && aa.imo === bb.imo) return true;
    return !aa.mmsi && !bb.mmsi && !aa.imo && !bb.imo && Boolean(aa.name && aa.name === bb.name);
  }

  function vesselDataTime(vessel: Vessel) {
    const candidates = [vessel.positionReceived, vessel.updateTime];
    for (const value of candidates) {
      if (!value) continue;
      const parsed = new Date(value).getTime();
      if (Number.isFinite(parsed)) return parsed;
    }
    return Number(vessel.receivedAt || 0);
  }

  function findRegistryKey(vessel: Vessel) {
    for (const [key, existing] of mapVesselRegistryRef.current.entries()) {
      if (sameRegistryVessel(existing, vessel)) return key;
    }
    return vesselRegistryKey(vessel);
  }

  function renderVesselRegistry() {
    const source = vesselSourceRef.current;
    const freeSource = freeVesselSourceRef.current;
    if (!source) return;

    // Um único layer desenha todos os barcos. Isso impede que o mesmo MMSI/IMO
    // apareça duplicado em Premium, Marinesia e Vessel Free.
    source.clear();
    freeSource?.clear();

    mapVesselRegistryRef.current.forEach((vessel) => {
      const feature = new Feature({ geometry: new Point(fromLonLat([vessel.lon, vessel.lat])) });
      feature.set("vessel", vessel);
      feature.setStyle(() => buildVesselStyle(vessel, mapRef.current?.getView().getZoom() || 10));
      source.addFeature(feature);
    });
  }

  function upsertMapVessels(vessels: Vessel[]) {
    const accepted: Vessel[] = [];
    vessels.forEach((incoming) => {
      if (!Number.isFinite(incoming.lat) || !Number.isFinite(incoming.lon)) return;

      const foundKey = findRegistryKey(incoming);
      const current = foundKey ? mapVesselRegistryRef.current.get(foundKey) : undefined;
      const incomingTime = vesselDataTime(incoming);
      const currentTime = current ? vesselDataTime(current) : 0;

      const merged: Vessel = current
        ? {
            ...current,
            ...incoming,
            name: incoming.name || current.name,
            mmsi: incoming.mmsi || current.mmsi,
            imo: incoming.imo || current.imo,
            dataSource: incoming.dataSource || current.dataSource,
          }
        : incoming;

      // Uma resposta velha nunca cria outro barco nem move o marcador para trás.
      if (current && incomingTime && currentTime && incomingTime < currentTime) {
        accepted.push(current);
        return;
      }

      let targetKey = foundKey || vesselRegistryKey(merged);
      if (!targetKey) return;

      // Se o barco ganhou MMSI depois, muda para a chave mais forte sem duplicar.
      const strongestKey = vesselRegistryKey(merged);
      if (strongestKey && strongestKey !== targetKey) {
        mapVesselRegistryRef.current.delete(targetKey);
        targetKey = strongestKey;
      }
      mapVesselRegistryRef.current.set(targetKey, merged);
      accepted.push(merged);

      const selected = trackedRef.current;
      if (selected && sameRegistryVessel(selected, merged)) {
        trackedRef.current = merged;
        setTracked(merged);
      }
    });

    renderVesselRegistry();
    return accepted;
  }

  function dedupeVessels(vessels: Vessel[]) {
    const unique: Vessel[] = [];
    vessels.forEach((vessel) => {
      const index = unique.findIndex((existing) => sameRegistryVessel(existing, vessel));
      if (index < 0) {
        unique.push(vessel);
        return;
      }
      if (vesselDataTime(vessel) >= vesselDataTime(unique[index])) unique[index] = vessel;
    });
    return unique;
  }

  function drawFreeMapVessels(vessels: Vessel[]) {
    upsertMapVessels(dedupeVessels(vessels));
  }

  async function loadFreeMapLayer(force = false, targetCenter?: { lat: number; lon: number } | null) {
    const map = mapRef.current;
    if (!map) return;
    const mapCenter = toLonLat(map.getView().getCenter() || fromLonLat([fallbackLon, fallbackLat]));
    const lat = targetCenter?.lat ?? mapCenter[1];
    const lon = targetCenter?.lon ?? mapCenter[0];
    const currentZoom = Math.max(3, Math.min(18, map.getView().getZoom() || 10));
    const zoomBucket = Math.round(currentZoom);
    const key = `${(Math.round(lat * 4) / 4).toFixed(2)}:${(Math.round(lon * 4) / 4).toFixed(2)}:z${zoomBucket}`;
    const now = Date.now();
    if (!force && freeLayerRequestRef.current.key === key && now - freeLayerRequestRef.current.at < 40_000) return;

    freeLayerRequestRef.current.key = key;
    freeLayerRequestRef.current.at = now;
    const seq = ++freeLayerRequestRef.current.seq;
    setFreeMapStatus("loading");

    try {
      const response = await aisFetch(`/api/ais-map?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=${encodeURIComponent(zoomBucket)}&refresh=${force ? "1" : "0"}`);
      const data = await response.json();
      if (seq !== freeLayerRequestRef.current.seq) return;
      if (!response.ok) {
        setFreeMapStatus("error");
        return;
      }

      const rows: Vessel[] = (Array.isArray(data?.vessels) ? data.vessels : []).map((raw: any) => ({
        mmsi: String(raw?.mmsi || ""),
        imo: String(raw?.imo || ""),
        name: String(raw?.name || raw?.mmsi || "Embarcação"),
        lat: Number(raw?.lat),
        lon: Number(raw?.lon),
        sog: raw?.sog == null ? null : Number(raw.sog),
        cog: raw?.cog == null ? null : Number(raw.cog),
        heading: raw?.heading == null ? null : Number(raw.heading),
        vesselType: String(raw?.vesselType || raw?.shipType || ""),
        navStatusText: String(raw?.navStatusText || ""),
        dataSource: String(raw?.dataSource || data?.source || "AIS"),
        positionReceived: String(raw?.positionReceived || raw?.updateTime || data?.updatedAt || ""),
        updateTime: String(raw?.updateTime || raw?.positionReceived || data?.updatedAt || ""),
        receivedAt: Number(raw?.receivedAt) || Date.now(),
      })).filter((v: Vessel) => Number.isFinite(v.lat) && Number.isFinite(v.lon) && Boolean(v.mmsi));

      const uniqueRows = dedupeVessels(rows);
      setFreeMapVessels(uniqueRows);
      setFreeMapSource(String(data?.source || "AIS automático"));
      setFreeMapUpdatedAt(data?.updatedAt ? new Date(data.updatedAt).getTime() : Date.now());
      setFreeMapStatus("ready");
      drawFreeMapVessels(uniqueRows);
      if (uniqueRows.length) setShowEmptyHint(false);
    } catch {
      if (seq === freeLayerRequestRef.current.seq) setFreeMapStatus("error");
    }
  }

  function scheduleFreeMapLayer(force = false) {
    if (freeLayerTimerRef.current) window.clearTimeout(freeLayerTimerRef.current);
    freeLayerTimerRef.current = window.setTimeout(() => loadFreeMapLayer(force), force ? 120 : 650);
  }

  function drawVessel(vessel: Vessel) {
    upsertMapVessels([vessel]);
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

  function drawAreaSelection(lat: number, lon: number, radiusKm: 50 = 50) {
    const source = areaSourceRef.current;
    if (!source) return;
    source.clear();
    const center3857 = fromLonLat([lon, lat]);
    const circle = new Feature({ geometry: new CircleGeom(center3857, radiusKm * 1000) });
    circle.setStyle(new Style({
      fill: new Fill({ color: "rgba(43,212,170,.08)" }),
      stroke: new Stroke({ color: "#2bd4aa", width: 2, lineDash: [10, 8] }),
    }));
    const point = new Feature({ geometry: new Point(center3857) });
    point.setStyle(new Style({
      image: new CircleStyle({ radius: 7, fill: new Fill({ color: "#2bd4aa" }), stroke: new Stroke({ color: "#ffffff", width: 2 }) }),
      text: new Text({ text: `${radiusKm} km`, offsetY: -18, font: "800 11px system-ui", fill: new Fill({ color: "#effffb" }), stroke: new Stroke({ color: "#05252b", width: 3 }) }),
    }));
    source.addFeatures([circle, point]);
  }

  function drawAreaVessels(vessels: Vessel[]) {
    upsertMapVessels(dedupeVessels(vessels));
  }

  function chooseAreaCenterFromMap() {
    const map = mapRef.current;
    if (!map) return;
    const [lon, lat] = toLonLat(map.getView().getCenter() || fromLonLat([fallbackLon, fallbackLat]));
    setAreaCenter({ lat, lon });
    drawAreaSelection(lat, lon, areaRadius);
    setStatusMessage(`Centro da área definido · ${formatCoordMarine(lat, true)} · ${formatCoordMarine(lon, false)}`);
  }

  function applyManualAreaCoordinates(closeMobilePanel = false) {
    const lat = coordinateDigitsToDecimal(manualLatDigits, true);
    const lon = coordinateDigitsToDecimal(manualLonDigits, false);
    if (lat == null || lon == null) {
      setManualCoordError("Confira latitude e longitude. Ex.: 254530 / 462550.");
      return;
    }
    setManualCoordError("");
    const coords = { lat, lon };
    setAreaCenter(coords);
    drawAreaSelection(lat, lon, 50);
    centerOn(lat, lon, 8, true);
    setStatusMessage(`Centro manual definido · ${formatCoordMarine(lat, true)} · ${formatCoordMarine(lon, false)}`);
    if (closeMobilePanel) setMobilePanel(null);
  }

  function marinesiaCooldownMessage() {
    const until = Math.max(marinesiaCooldownUntil, readMarinesiaCooldown());
    if (!until || until <= Date.now()) return "";
    const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60000));
    return `AIS Free aguardando a próxima janela da Marinesia — cerca de ${minutes} min. O fallback gratuito do mapa continua disponível.`;
  }

  async function searchArea(provider: SearchProvider = searchProvider, forceFreeRefresh = false) {
    const selected = areaCenter || center;
    if (!selected) return;

    const isFree = provider === "marinesia";
    const areaCostBrl = formatBrl(aisPricing.areaCredits * creditUnitPrice);

    if (!isFree) {
      const confirmed = window.confirm(
        `ATENÇÃO — CONSULTA AIS POR ÁREA\n\nTem certeza que deseja pesquisar embarcações em uma área de 50 km?\n\nCUSTO: ${aisPricing.areaCredits} crédito(s) (${areaCostBrl})\n\nOs créditos serão descontados somente se a consulta for concluída com sucesso.`
      );
      if (!confirmed) {
        setStatus("idle");
        setStatusMessage("Consulta por área cancelada. Nenhum crédito foi descontado.");
        return;
      }
    }

    setStatus("loading");
    setStatusMessage(isFree ? "Buscando barcos no AIS Free da região..." : `Pesquisando embarcações Premium em ${areaRadius} km...`);
    drawAreaSelection(selected.lat, selected.lon, areaRadius);

    if (isFree && !forceFreeRefresh) {
      const cachedFree = readMarinesiaAreaCache(selected);
      if (cachedFree?.length) {
        const cachedRows = dedupeVessels(cachedFree as Vessel[]);
        setAreaVessels(cachedRows);
        setAreaCost(0);
        drawAreaVessels(cachedRows);
        centerOn(selected.lat, selected.lon, 8);
        setStatus("ready");
        setStatusMessage(`${cachedRows.length} barco(s) AIS Free carregado(s) do cache · 0 créditos`);
        return;
      }
    }

    const toRows = (data: any, freeFallback = false): Vessel[] => (
      (Array.isArray(data?.vessels) ? data.vessels : []).map((raw: any) => ({
        mmsi: String(raw?.mmsi || ""),
        imo: String(raw?.imo || ""),
        name: raw?.name || "SEM NOME",
        lat: Number(raw?.lat),
        lon: Number(raw?.lon),
        sog: raw?.sog == null ? null : Number(raw.sog),
        cog: raw?.cog == null ? null : Number(raw.cog),
        heading: raw?.heading == null ? null : Number(raw.heading),
        vesselType: raw?.vesselType || "",
        navStatusText: raw?.navStatusText || "",
        dataSource: isFree
          ? (raw?.dataSource || data?.provider || (freeFallback ? "AIS Free" : "Marinesia AIS"))
          : `Premium 50 km · ${raw?.dataSource || data?.provider || "AIS"}`,
        positionReceived: raw?.positionReceived || raw?.updateTime || "",
        updateTime: raw?.updateTime || raw?.positionReceived || "",
        receivedAt: Number(raw?.receivedAt) || Date.now(),
      })).filter((v: Vessel) => Number.isFinite(v.lat) && Number.isFinite(v.lon))
    );

    try {
      const cooldownMessage = isFree ? marinesiaCooldownMessage() : "";
      let response: Response;
      let data: any;

      if (isFree && cooldownMessage) {
        setStatusMessage(cooldownMessage);
        response = await aisFetch(`/api/ais-map?lat=${encodeURIComponent(selected.lat)}&lon=${encodeURIComponent(selected.lon)}`);
        data = await response.json();
      } else {
        response = await aisFetch(
          `/api/ais?action=area&latitude=${encodeURIComponent(selected.lat)}&longitude=${encodeURIComponent(selected.lon)}&radius=${areaRadius}&provider=${encodeURIComponent(provider)}`
        );
        data = await response.json();
      }

      if (!response.ok && isFree) {
        if (response.status === 429) {
          const retrySeconds = Number(data?.retryAfterSeconds || 1800);
          setMarinesiaCooldownUntil(writeMarinesiaCooldown(retrySeconds));
        }
        setStatusMessage(
          response.status === 429
            ? "Marinesia atingiu o limite do plano grátis. Complementando com AIS Free do mapa..."
            : "Marinesia não respondeu. Complementando com AIS Free do mapa..."
        );
        response = await aisFetch(`/api/ais-map?lat=${encodeURIComponent(selected.lat)}&lon=${encodeURIComponent(selected.lon)}`);
        data = await response.json();
      }

      if (!response.ok) {
        setStatus(response.status === 503 ? "config" : "error");
        setStatusMessage(data?.error || "Falha na busca AIS por área.");
        return;
      }

      let rows = toRows(data, isFree);

      // A conta Free da Marinesia pode retornar pouquíssimos ou nenhum barco.
      // Se vier vazia, mantém a experiência funcionando com VesselAPI/Kpler.
      if (isFree && rows.length === 0) {
        const fallbackResponse = await aisFetch(`/api/ais-map?lat=${encodeURIComponent(selected.lat)}&lon=${encodeURIComponent(selected.lon)}`);
        const fallbackData = await fallbackResponse.json().catch(() => ({}));
        if (fallbackResponse.ok) {
          rows = toRows(fallbackData, true);
          data = fallbackData;
        }
      }

      setAreaVessels(rows);
      setAreaCost(isFree ? 0 : (Number(data?.creditCost) || aisPricing.areaCredits));
      drawAreaVessels(rows);
      if (isFree && rows.length) writeMarinesiaAreaCache(selected, rows);

      if (!isFree && rows.length) {
        void fetch("/api/ais-library", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save-area", vessels: rows }),
        }).then(() => loadAisLibrary()).catch(() => null);
      }

      centerOn(selected.lat, selected.lon, 8);
      setStatus("ready");
      setStatusMessage(
        isFree
          ? `${rows.length} barco(s) AIS Free encontrado(s) · ${String(data?.provider || data?.source || "Marinesia/fallback")} · 0 créditos`
          : `${rows.length} barco(s) Premium encontrado(s) em 50 km · ${Number(data?.creditCost ?? aisPricing.areaCredits)} crédito(s)`
      );
      if (!isFree) await refreshCredits();
    } catch {
      setStatus("error");
      setStatusMessage(isFree ? "Falha de rede na busca AIS Free." : "Falha de rede na busca AIS Premium por área.");
    }
  }

  async function openAreaVessel(vessel: Vessel) {
    trackedRef.current = vessel;
    setTracked(vessel);
    drawAreaVessels(areaVessels);
    centerOn(vessel.lat, vessel.lon, 12);
    window.setTimeout(() => anchorCardForVessel(vessel), 240);
    setStatus("ready");
    setStatusMessage(`${vessel.name || vessel.mmsi} selecionado da busca por área · 0 crédito adicional`);
    await recordHistory(vessel);
  }

  async function refreshCredits() {
    try {
      const response = await aisFetch("/api/ais?action=credits");
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 503) {
          setStatus("config");
          setStatusMessage(data?.error || "Configure DATADOCKED_API_KEY na Vercel.");
        }
        return;
      }
      if (Number.isFinite(Number(data?.credits))) setCredits(Number(data.credits));
      setMarinesiaConfigured(Boolean(data?.marinesiaConfigured));
      if (Number.isFinite(Number(data?.creditUnitPrice))) setCreditUnitPrice(Math.max(0.01, Number(data.creditUnitPrice)));
      if (data?.pricing) setAisPricing({
        locateCredits: Number.isFinite(Number(data.pricing.locateCredits)) ? Number(data.pricing.locateCredits) : 2,
        updateCredits: Number.isFinite(Number(data.pricing.updateCredits)) ? Number(data.pricing.updateCredits) : 1,
        areaCredits: Number.isFinite(Number(data.pricing.areaCredits)) ? Number(data.pricing.areaCredits) : 10,
      });
      if (status === "config") setStatus("idle");
    } catch {
      // Saldo é informativo e não deve bloquear o mapa.
    }
  }

  function openCreditPack(amount: 5 | 10) {
    if (typeof window === "undefined") return;
    window.location.assign(`/?view=credits&package=${amount}`);
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

  async function saveVessel(source: VesselMatch | Vessel, folder?: string, silent = false) {
    const key = vesselKeyFrom(source);
    if (!key) {
      setStatusMessage("Este barco não possui IMO/MMSI válido para salvar.");
      return;
    }
    setSavingKeys((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
    if (!silent) setStatusMessage(`Salvando ${source.name || "embarcação"}...`);
    try {
      const response = await fetch("/api/ais-library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "save", vessel: source, folder: folder || (String((source as Vessel)?.dataSource || "").toLowerCase().includes("marinesia") ? "marinesia" : "premium") }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data?.error || `Não foi possível salvar o barco (${response.status}).`);
        return;
      }
      if (data?.saved) {
        setSavedVessels((current) => [data.saved, ...current.filter((item) => item.vesselKey !== key)]);
      } else {
        await loadAisLibrary();
      }
      if (!silent) setStatusMessage(`${source.name || "Embarcação"} salva na pasta ✓`);
    } catch (error) {
      console.error("AIS save vessel error", error);
      setStatusMessage("Falha de conexão ao salvar a embarcação. Tente novamente.");
    } finally {
      setSavingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
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

  async function recordHistory(vessel: Vessel, creditsUsed = 0) {
    try {
      await fetch("/api/ais-library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "history", vessel, creditsUsed }),
      });
      await loadAisLibrary();
    } catch {
      // O histórico não pode impedir a exibição da posição já obtida.
    }
  }

  function anchorCardForVessel(vessel: Vessel, clickedPixel?: [number, number]) {
    if (typeof window === "undefined" || window.innerWidth <= 760) {
      setCardAnchor(null);
      return;
    }
    const map = mapRef.current;
    const host = hostRef.current;
    if (!map || !host) return;
    const pixel = clickedPixel || map.getPixelFromCoordinate(fromLonLat([vessel.lon, vessel.lat]));
    if (!pixel) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    const cardWidth = 232;
    const cardHeight = 168;
    const left = pixel[0] + cardWidth + 22 > width ? pixel[0] - cardWidth - 14 : pixel[0] + 14;
    const top = Math.max(8, Math.min(height - cardHeight - 8, pixel[1] - 64));
    setCardAnchor({ left: Math.max(8, left), top });
    setCardPulse((value) => value + 1);
  }

  function showVesselFromLibrary(vessel: Vessel, message: string) {
    const id = vessel.imo && vessel.imo !== "0" ? vessel.imo : vessel.mmsi;
    if (id) positionCacheRef.current.set(id, vessel);
    trackedRef.current = vessel;
    setTracked(vessel);
    drawVessel(vessel);
    centerOn(vessel.lat, vessel.lon, 12);
    setStatus("ready");
    setStatusMessage(message);
  }

  function savedItemToMatch(item: SavedVessel): VesselMatch {
    return {
      name: item.name,
      mmsi: item.mmsi || "",
      imo: item.imo || "",
      country: item.country || "",
      countryIso: "",
      shipType: item.vesselType || "",
      typeSpecific: item.vesselType || "",
      callsign: item.callsign || "",
    };
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

  function historyItemToVessel(item: AisHistoryItem): Vessel {
    return {
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
    };
  }

  function openHistoryItem(item: AisHistoryItem) {
    showVesselFromLibrary(historyItemToVessel(item), `${item.name} aberto do histórico — 0 créditos`);
  }

  async function getVesselPosition(match: VesselMatch, force = false, provider: SearchProvider = searchProvider) {
    const id = vesselIdentifier(match);
    const lookupKey = `${provider}:${id || match.name.trim()}`;
    if (!lookupKey) {
      setStatus("error");
      setStatusMessage("Este resultado não possui nome, IMO ou MMSI válido.");
      return;
    }

    const cached = positionCacheRef.current.get(lookupKey);
    if (cached && !force) {
      trackedRef.current = cached;
      setTracked(cached);
      drawVessel(cached);
      centerOn(cached.lat, cached.lon, 12);
      window.setTimeout(() => anchorCardForVessel(cached), 220);
      setStatus("ready");
      setStatusMessage(`${cached.name || "Embarcação"} localizada do cache — 0 créditos`);
      return;
    }

    const isFreeProvider = provider === "marinesia";
    const operationCredits = isFreeProvider ? 0 : (force ? aisPricing.updateCredits : aisPricing.locateCredits);
    const operationBrl = formatBrl(operationCredits * creditUnitPrice);
    const operationLabel = force ? "ATUALIZAR OS DADOS" : "CONSULTAR A POSIÇÃO";
    const vesselLabel = match.name || id;
    if (operationCredits > 0) {
      const confirmed = window.confirm(
        `ATENÇÃO — CONSULTA AIS\n\nTem certeza que deseja ${operationLabel.toLowerCase()} de ${vesselLabel}?\n\nCUSTO: ${operationCredits} crédito(s) (${operationBrl})\n\nOs créditos serão descontados somente se uma posição válida for retornada.`
      );
      if (!confirmed) {
        setStatus("idle");
        setStatusMessage(`${force ? "Atualização" : "Consulta"} cancelada. Nenhum crédito foi descontado.`);
        return;
      }
    }

    setStatus("loading");
    setStatusMessage(
      operationCredits > 0
        ? (force ? `Atualizando posição — ${aisPricing.updateCredits} crédito(s)...` : `Consultando posição — ${aisPricing.locateCredits} crédito(s)...`)
        : (force ? "Atualizando AIS Free..." : "Consultando AIS Free · Marinesia/fallback...")
    );
    try {
      const response = await aisFetch(`/api/ais?action=vessel&id=${encodeURIComponent(id)}&name=${encodeURIComponent(match.name || "")}&update=${force ? "1" : "0"}&provider=${encodeURIComponent(provider)}`);
      const data = await response.json();
      if (!response.ok) {
        if (provider === "marinesia" && response.status === 429) {
          const retrySeconds = Number(data?.retryAfterSeconds || 1800);
          setMarinesiaCooldownUntil(writeMarinesiaCooldown(retrySeconds));
        }
        if (response.status === 503) setStatus("config");
        else setStatus("error");
        setStatusMessage(response.status === 401 ? "Sua sessão expirou. Entre novamente no painel e tente de novo." : (data?.error || "Não foi possível localizar a embarcação."));
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
      positionCacheRef.current.set(lookupKey, vessel);
      trackedRef.current = vessel;
      setTracked(vessel);
      drawVessel(vessel);
      centerOn(vessel.lat, vessel.lon, 12);
      window.setTimeout(() => anchorCardForVessel(vessel), 240);
      setLastFetch(Date.now());
      setStatus("ready");
      setStatusMessage(`${vessel.name || "Embarcação"} localizada`);
      await Promise.all([
        refreshCredits(),
        recordHistory(vessel, Number(data?.creditCost) || operationCredits),
        saveVessel(vessel, provider === "marinesia" ? "marinesia" : "premium", true),
      ]);
    } catch {
      setStatus("error");
      setStatusMessage("Falha de rede ao consultar a posição AIS.");
    }
  }

  async function searchByName(event?: FormEvent, providerOverride?: SearchProvider, queryOverride?: string) {
    event?.preventDefault();
    const provider = providerOverride || searchProvider;
    const cleanName = (queryOverride ?? nameQuery).trim();

    if (provider === "marinesia") {
      if (!cleanName) {
        await searchArea("marinesia");
        return;
      }

      const digits = cleanName.replace(/\D/g, "");
      if (digits.length === 7 || digits.length === 9) {
        const match: VesselMatch = {
          name: digits.length === 9 ? `MMSI ${digits}` : `IMO ${digits}`,
          mmsi: digits.length === 9 ? digits : "",
          imo: digits.length === 7 ? digits : "",
          country: "",
          countryIso: "",
          shipType: "AIS Free",
          typeSpecific: "Marinesia",
          callsign: "",
        };
        setMatches([]);
        setMatchTotal(0);
        await getVesselPosition(match, false, "marinesia");
        return;
      }

      if (cleanName.length < 2) {
        setStatus("error");
        setStatusMessage("Digite o nome, MMSI/IMO ou deixe vazio para buscar barcos na região.");
        return;
      }

      setStatus("loading");
      setStatusMessage("AIS Free: procurando o nome do barco...");
      setMatches([]);
      setMatchTotal(0);
      try {
        const response = await aisFetch(`/api/ais?action=name&name=${encodeURIComponent(cleanName)}&provider=${encodeURIComponent(provider)}`);
        const data = await response.json();
        if (!response.ok) {
          setStatus(response.status === 503 ? "config" : "error");
          setStatusMessage(data?.error || "Falha ao buscar o nome no AIS Free.");
          return;
        }
        const rows = (Array.isArray(data?.items) ? data.items : []) as VesselMatch[];
        setMatches(rows);
        setMatchTotal(Number(data?.total) || rows.length);

        if (!rows.length) {
          setStatusMessage("Nome não encontrado. Buscando barcos AIS Free na região...");
          await searchArea("marinesia");
          return;
        }
        if (rows.length === 1) {
          await getVesselPosition(rows[0], false, "marinesia");
          return;
        }
        setStatus("ready");
        setStatusMessage(`${rows.length} resultados AIS Free — escolha o barco para mostrar no mapa · 0 créditos`);
        return;
      } catch {
        setStatusMessage("Busca por nome indisponível. Tentando AIS Free na região...");
        await searchArea("marinesia");
        return;
      }
    }

    if (cleanName.length < 2) {
      setStatus("error");
      setStatusMessage("Digite pelo menos 2 caracteres do nome do barco.");
      return;
    }

    const premiumDigits = cleanName.replace(/\D/g, "");
    if (premiumDigits.length === 7 || premiumDigits.length === 9) {
      const match: VesselMatch = {
        name: premiumDigits.length === 9 ? `MMSI ${premiumDigits}` : `IMO ${premiumDigits}`,
        mmsi: premiumDigits.length === 9 ? premiumDigits : "",
        imo: premiumDigits.length === 7 ? premiumDigits : "",
        country: "",
        countryIso: "",
        shipType: "AIS Premium",
        typeSpecific: "Data Docked",
        callsign: "",
      };
      setMatches([]);
      setMatchTotal(0);
      await getVesselPosition(match, false, "premium");
      return;
    }

    const cacheKey = cleanName.toLowerCase().replace(/\s+/g, " ");
    const cached = nameCacheRef.current.get(cacheKey);
    if (cached) {
      setMatches(cached);
      setMatchTotal(cached.length);
      setStatus("ready");
      setStatusMessage(`${cached.length} resultado(s) do cache — 0 créditos`);
      if (cached.length === 1) await getVesselPosition(cached[0], false, "premium");
      return;
    }

    setStatus("loading");
    setStatusMessage("Buscando o barco pelo nome — a cobrança ocorre somente ao abrir a posição Premium...");
    setMatches([]);
    setMatchTotal(0);
    try {
      const response = await aisFetch(`/api/ais?action=name&name=${encodeURIComponent(cleanName)}&provider=${encodeURIComponent(provider)}`);
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 503) setStatus("config");
        else setStatus("error");
        setStatusMessage(response.status === 401 ? "Sua sessão expirou. Entre novamente no painel e tente a busca AIS." : (data?.error || "Falha ao buscar embarcação pelo nome."));
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
        setStatusMessage(`1 barco encontrado — consultando posição (${aisPricing.locateCredits} crédito(s))...`);
        await getVesselPosition(rows[0], false, "premium");
        return;
      }

      setStatus("ready");
      setStatusMessage(`${rows.length} resultados — escolha o barco certo para consultar a posição — ${aisPricing.locateCredits} crédito(s)`);
    } catch {
      setStatus("error");
      setStatusMessage("Falha de rede ao consultar o AIS Premium.");
    }
  }

  function locateDevice(forArea = false) {
    if (!navigator.geolocation) {
      setStatusMessage("GPS não disponível. Use o centro do mapa ou digite a posição.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
        const useAsArea = forArea || searchModeRef.current === "area";
        setDevicePosition(coords);
        centerOn(coords.lat, coords.lon, useAsArea ? 8 : 12, true);
        if (useAsArea) {
          setAreaCenter(coords);
          drawAreaSelection(coords.lat, coords.lon, 50);
          setStatusMessage(`GPS definido como centro da busca 50 km · ${formatCoordMarine(coords.lat, true)} · ${formatCoordMarine(coords.lon, false)}`);
        } else {
          setStatusMessage("GPS localizado — mapa centralizado na sua posição.");
        }
      },
      () => setStatusMessage("GPS não autorizado ou indisponível. Use o centro do mapa ou digite a posição."),
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
    const freeVesselSource = new VectorSource();
    const freeVesselLayer = new VectorLayer({ source: freeVesselSource, declutter: true });
    const areaSource = new VectorSource();
    const areaLayer = new VectorLayer({ source: areaSource });
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
      layers: [street, areaLayer, freeVesselLayer, vesselLayer, positionLayer],
      view,
    });

    const areaTranslate = new Translate({
      layers: [areaLayer],
      hitTolerance: 14,
    });
    map.addInteraction(areaTranslate);

    const handleAreaTranslateEnd = (event: any) => {
      const feature = event?.features?.item?.(0);
      const geometry = feature?.getGeometry?.();
      let coordinate: number[] | null = null;
      if (geometry instanceof CircleGeom) coordinate = geometry.getCenter();
      else if (geometry instanceof Point) coordinate = geometry.getCoordinates();
      if (!coordinate) return;
      const [lon, lat] = toLonLat(coordinate);
      setAreaCenter({ lat, lon });
      drawAreaSelection(lat, lon, 50);
      setStatusMessage(`Círculo 50 km movido · ${formatCoordMarine(lat, true)} · ${formatCoordMarine(lon, false)}`);
    };
    areaTranslate.on("translateend", handleAreaTranslateEnd);

    mapRef.current = map;
    vesselSourceRef.current = vesselSource;
    freeVesselSourceRef.current = freeVesselSource;
    positionSourceRef.current = positionSource;
    areaSourceRef.current = areaSource;
    streetLayerRef.current = street;
    dhnLayerRef.current = dhn;
    drawAreaSelection(fallbackLat, fallbackLon, 50);

    const updateCenter = () => {
      const [lon, lat] = toLonLat(view.getCenter() || fromLonLat([fallbackLon, fallbackLat]));
      setCenter({ lat, lon });
      setZoom(Math.round(view.getZoom() || 10));
      vesselSource.getFeatures().forEach((feature) => {
        const vessel = feature.get("vessel") as Vessel | undefined;
        if (vessel) feature.setStyle(() => buildVesselStyle(vessel, view.getZoom() || 10));
      });
      const selected = trackedRef.current;
      if (selected) anchorCardForVessel(selected);
      scheduleFreeMapLayer(false);
    };
    map.on("moveend", updateCenter);
    const selectMapFeature = (event: any) => {
      const vessel = map.forEachFeatureAtPixel(
        event.pixel,
        (feature: any) => (feature.get("freeVessel") || feature.get("vessel") || null) as Vessel | null,
        { hitTolerance: 10 },
      );
      if (vessel) {
        trackedRef.current = vessel;
        setTracked(vessel);
        setShowEmptyHint(false);
        setStatus("ready");
        setStatusMessage(`${vessel.name || `MMSI ${vessel.mmsi}`} · ${vessel.dataSource || "AIS"} · visualização do mapa sem desconto de créditos`);
        anchorCardForVessel(vessel, [Number(event.pixel[0]), Number(event.pixel[1])]);
        view.animate({ center: fromLonLat([vessel.lon, vessel.lat]), duration: 150 });
        return;
      }
      if (searchModeRef.current !== "area") return;
      const [lon, lat] = toLonLat(event.coordinate);
      setAreaCenter({ lat, lon });
      drawAreaSelection(lat, lon, areaRadiusRef.current);
      setStatusMessage(`Área selecionada no mapa · ${areaRadiusRef.current} km`);
    };
    map.on("singleclick", selectMapFeature);
    scheduleFreeMapLayer(true);
    const ro = new ResizeObserver(() => map.updateSize());
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      map.un("moveend", updateCenter);
      map.un("singleclick", selectMapFeature);
      areaTranslate.un("translateend", handleAreaTranslateEnd);
      map.removeInteraction(areaTranslate);
      if (freeLayerTimerRef.current) window.clearTimeout(freeLayerTimerRef.current);
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => loadFreeMapLayer(true), 60_000);
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
        setAreaCenter(coords);
        drawAreaSelection(coords.lat, coords.lon, 50);
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
  const trackedDateTime = tracked ? trackedDateParts(tracked.positionReceived || tracked.updateTime) : null;
  const trackedFishing = tracked ? isFishingVessel(tracked) : false;
  const savedKeys = useMemo(() => new Set(savedVessels.map((item) => item.vesselKey)), [savedVessels]);
  const premiumSavedVessels = useMemo(() => savedVessels.filter((item) => (item.folder || "premium") !== "area50"), [savedVessels]);
  const areaSavedVessels = useMemo(() => savedVessels.filter((item) => item.folder === "area50"), [savedVessels]);
  const trackedKey = tracked ? vesselKeyFrom(tracked) : "";
  const recentCards = useMemo(() => {
    const rows: Array<{ key: string; vessel: Vessel; historyItem?: AisHistoryItem; current: boolean }> = [];
    const seen = new Set<string>();

    if (tracked) {
      const key = vesselKeyFrom(tracked) || `tracked:${tracked.name || "barco"}:${tracked.lat}:${tracked.lon}`;
      rows.push({ key, vessel: tracked, current: true });
      seen.add(key);
    }

    for (const item of historyItems) {
      if (rows.length >= 3) break;
      const key = item.vesselKey || (item.imo && item.imo !== "0" ? `imo:${item.imo}` : `mmsi:${item.mmsi || item.id}`);
      if (seen.has(key)) continue;
      rows.push({
        key,
        historyItem: item,
        current: false,
        vessel: {
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
        },
      });
      seen.add(key);
    }

    return rows.slice(0, 3);
  }, [tracked, historyItems]);

  return (
    <section className="ais-page ais-v61-page ais-v62-page ais-v75-page ais-v119-page">
      <div className="ais-topbar">
        <div>
          <small>MONITORAMENTO MARÍTIMO</small>
          <h2>AIS — posição do barco</h2>
          <p>Busca pelo nome e posição AIS individual, com horário e origem do sinal bem destacados.</p>
        </div>
        <div className="ais-credit-top-actions">
          <div className={`ais-live-box ${credits == null ? "loading" : credits <= 0 ? "no-credit" : "has-credit"}`}>
            <span className={`ais-live-dot ${status === "ready" ? "connected" : status === "loading" ? "connecting" : status}`} />
            <div>
              <b>{statusMessage}</b>
              <small>
                {credits != null ? <><strong className="ais-balance-value">{formatBrl(credits * creditUnitPrice)}</strong><span>{` · ${credits} crédito${credits === 1 ? "" : "s"}`}</span></> : "Saldo não carregado"}
                {lastFetch ? ` · atualizado ${relativeTime(lastFetch)}` : ""}
              </small>
            </div>
          </div>
          <div className="ais-credit-buy">
            <span>COMPRAR CRÉDITOS</span>
            <button type="button" onClick={() => openCreditPack(5)}>+ R$ 5</button>
            <button type="button" onClick={() => openCreditPack(10)}>+ R$ 10</button>
          </div>
        </div>
      </div>

      {credits != null && credits <= 0 && (
        <div className="ais-no-credit-warning" role="alert">
          <div><b>⚠ SEM CRÉDITOS</b><span>Compre créditos para continuar usando as consultas AIS.</span></div>
          <div><button type="button" onClick={() => openCreditPack(5)}>COMPRAR R$ 5</button><button type="button" onClick={() => openCreditPack(10)}>COMPRAR R$ 10</button></div>
        </div>
      )}

      <div className="ais-name-search-card ais-v70-search-card">
        <div className="ais-v70-search-tabs">
          <button type="button" className={searchMode === "vessel" ? "active" : ""} onClick={() => { setSearchMode("vessel"); setMobilePanel("search"); }}><Ship /> Barco</button>
          <button type="button" className={searchMode === "area" ? "active" : ""} onClick={() => { setSearchMode("area"); setMobilePanel("search"); if (!areaCenter) chooseAreaCenterFromMap(); }}><Crosshair /> Área</button>
        </div>

        {searchMode === "vessel" ? (
          <>
            <div className="ais-v125-provider-cards">
              <section className="ais-v125-provider-card premium">
                <div className="ais-v125-provider-head"><Radio /><span><b>PREMIUM · DATA DOCKED</b><small>Nome, MMSI ou IMO</small></span><em>{aisPricing.locateCredits} CR</em></div>
                <div className="ais-v125-search-row">
                  <Search />
                  <input value={premiumQuery} onChange={(e) => setPremiumQuery(e.target.value)} placeholder="Nome, MMSI ou IMO" autoComplete="off" />
                  <button type="button" disabled={status === "loading"} onClick={() => { setSearchProvider("premium"); setNameQuery(premiumQuery); void searchByName(undefined, "premium", premiumQuery); }}>
                    {status === "loading" ? <RefreshCw className="spin" /> : <Search />} BUSCAR PREMIUM
                  </button>
                </div>
                <small className="ais-v125-note">Cobrança somente após posição válida.</small>
              </section>

              <section className="ais-v125-provider-card free">
                <div className="ais-v125-provider-head"><Navigation /><span><b>AIS FREE · MARINESIA</b><small>Nome, MMSI, IMO ou região</small></span><em>0 CR</em></div>
                <div className="ais-v125-search-row">
                  <Search />
                  <input value={freeQuery} onChange={(e) => setFreeQuery(e.target.value)} placeholder="Nome, MMSI ou IMO · vazio = região" autoComplete="off" />
                  <button type="button" disabled={status === "loading"} onClick={() => { setSearchProvider("marinesia"); setNameQuery(freeQuery); void searchByName(undefined, "marinesia", freeQuery); }}>
                    {status === "loading" ? <RefreshCw className="spin" /> : <Navigation />} BUSCAR AIS FREE
                  </button>
                </div>
                <small className="ais-v125-note">{marinesiaCooldownMessage() || (marinesiaConfigured ? "Marinesia conectada." : "Fallback gratuito ativo.")}</small>
              </section>
            </div>

            {matches.length > 0 && (
              <div className="ais-name-results">
                <div className="ais-name-results-head"><span><b>{matchTotal}</b> resultado(s)</span><small>Escolha o barco certo. A cobrança ocorre somente quando a posição válida for retornada.</small></div>
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
                          <button type="button" onClick={() => getVesselPosition(match, false, searchProvider)} disabled={status === "loading"}><MapPinned /> {isTracked ? "NO MAPA" : "VER POSIÇÃO"}</button>
                          <button type="button" className={isSaved ? "saved" : ""} disabled={savingKeys.has(key)} onClick={() => isSaved ? removeSavedVessel(key) : saveVessel(match)}><Bookmark /> {savingKeys.has(key) ? "SALVANDO..." : isSaved ? "SALVO" : "SALVAR"}</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {exactMatch && matches.length > 1 && <small className="ais-exact-hint">Correspondência exata encontrada: <b>{exactMatch.name}</b>.</small>}
              </div>
            )}
          </>
        ) : (
          <div className="ais-v70-area-search">
            <div className="ais-name-search-head">
              <div className="ais-name-title"><Crosshair /><span><b>PESQUISAR EMBARCAÇÕES NA ÁREA</b><small>Área fixa de 50 km. Use GPS, toque no mapa ou digite a posição.</small></span></div>
              <div className="ais-v70-area-cost ais-cost-highlight-area"><b>{searchProvider === "premium" ? `${aisPricing.areaCredits} CR` : "0 CR"}</b><small>{searchProvider === "premium" ? formatBrl(aisPricing.areaCredits * creditUnitPrice) : "AIS FREE"}</small></div>
            </div>
            <div className="ais-v70-radius-row">
              <button type="button" className="active">50 km <small>{searchProvider === "premium" ? `${aisPricing.areaCredits} créditos` : "GRÁTIS"}</small></button>
              <button type="button" onClick={chooseAreaCenterFromMap}><Crosshair /> Centro do mapa</button>
              <button type="button" onClick={locateDevice}><LocateFixed /> Usar GPS</button>
              {devicePosition && <button type="button" onClick={() => { setAreaCenter(devicePosition); drawAreaSelection(devicePosition.lat, devicePosition.lon, 50); centerOn(devicePosition.lat, devicePosition.lon, 8, true); }}><Navigation /> Aplicar meu GPS</button>}
            </div>
            <div className="ais-v74-manual-coords">
              <div className="ais-v74-coordinate-field"><span>Latitude Sul</span><span className="coord-free-input"><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={manualLatDigits} onChange={(e) => { setManualLatDigits(e.target.value.replace(/\D/g, "").slice(0, 6)); setManualCoordError(""); }} placeholder="254530" /><span className="coord-degree" aria-hidden="true">°</span></span></div>
              <div className="ais-v74-coordinate-field"><span>Longitude Oeste</span><span className="coord-free-input"><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={manualLonDigits} onChange={(e) => { setManualLonDigits(e.target.value.replace(/\D/g, "").slice(0, 6)); setManualCoordError(""); }} placeholder="462550" /><span className="coord-degree" aria-hidden="true">°</span></span></div>
              <button type="button" onClick={() => applyManualAreaCoordinates(false)}><MapPinned /> USAR LAT/LONG</button>
            </div>
            {manualCoordError && <p className="ais-v74-coordinate-error">{manualCoordError}</p>}
            <div className="ais-v70-area-position">
              <span><small>CENTRO DA BUSCA · 50 KM</small><b>{areaCenter ? `${formatCoordMarine(areaCenter.lat, true)} · ${formatCoordMarine(areaCenter.lon, false)}` : "Escolha pelo mapa, GPS ou latitude/longitude"}</b></span>
              <div className="ais-v125-area-actions">
                <button type="button" className="premium" onClick={() => { setSearchProvider("premium"); void searchArea("premium"); }} disabled={status === "loading"}>{status === "loading" ? <RefreshCw className="spin" /> : <Radio />} PREMIUM · 10 CR</button>
                <button type="button" className="free" onClick={() => { setSearchProvider("marinesia"); void searchArea("marinesia"); }} disabled={status === "loading"}>{status === "loading" ? <RefreshCw className="spin" /> : <Navigation />} AIS FREE · 0 CR</button>
              </div>
            </div>
            {areaVessels.length > 0 && (
              <div className="ais-v70-area-results">
                <div><b>{areaVessels.length} barcos encontrados</b><span>{searchProvider === "marinesia" ? "AIS Free · 0 créditos" : areaCost != null ? `${areaCost} créditos usados` : ""}</span></div>
                <div className="ais-v70-area-list">
                  {areaVessels.slice(0, 30).map((vessel, index) => (
                    <button type="button" key={`${vessel.mmsi || vessel.name}-${index}`} onClick={() => openAreaVessel(vessel)}>
                      <Ship /><span><b>{vessel.name || vessel.mmsi}</b><small>{vessel.sog != null ? `${vessel.sog.toFixed(1)} kn` : "—"} · {vessel.cog != null ? `${Math.round(vessel.cog)}°` : "—"}</small></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                      <button type="button" className="update" title={item.folder === "marinesia" ? "Atualizar AIS Free" : `Atualizar dados · ${aisPricing.updateCredits} crédito(s)`} onClick={() => getVesselPosition(savedItemToMatch(item), true, item.folder === "marinesia" ? "marinesia" : "premium")}><RefreshCw /><span>{item.folder === "marinesia" ? "ATUALIZAR GRÁTIS" : `ATUALIZAR · ${aisPricing.updateCredits} CR`}</span></button>
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
              {historyItems.slice(0, 14).map((item) => {
                const historyVessel = historyItemToVessel(item);
                const historyKey = vesselKeyFrom(historyVessel);
                const historySaved = Boolean(historyKey && savedKeys.has(historyKey));
                const historySaving = Boolean(historyKey && savingKeys.has(historyKey));
                return (
                  <article className="ais-history-row" key={item.id}>
                    <button type="button" className="ais-history-main" onClick={() => openHistoryItem(item)}>
                      <span className="ais-history-icon"><History /></span>
                      <div><b>{item.name}</b><small>{formatCoordMarine(Number(item.latitude), true)} · {formatCoordMarine(Number(item.longitude), false)}</small></div>
                      <em>{formatLocalDateTime(new Date(item.queriedAt))}</em>
                    </button>
                    <button
                      type="button"
                      className={`ais-history-save ${historySaved ? "saved" : ""}`}
                      onClick={() => { if (!historySaved) void saveVessel(historyVessel); }}
                      disabled={historySaving || historySaved}
                      title={historySaved ? "Barco já salvo" : "Salvar barco"}
                    >
                      <Bookmark />
                      <span>{historySaving ? "SALVANDO..." : historySaved ? "SALVO" : "SALVAR"}</span>
                    </button>
                  </article>
                );
              })}
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
          <button type="button" onClick={() => locateDevice()} title="Minha localização"><LocateFixed /></button>
          <button type="button" onClick={() => centerOn(fallbackLat, fallbackLon, 11)} title="Voltar para a última largada"><Crosshair /></button>
          {tracked && <button type="button" onClick={() => centerOn(tracked.lat, tracked.lon, 12)} title="Centralizar no barco"><Ship /></button>}
          <button
            type="button"
            className="ais-v128-marinesia-refresh"
            onClick={() => { setSearchProvider("marinesia"); void searchArea("marinesia", true); }}
            disabled={status === "loading"}
            title="Atualizar AIS Free Marinesia dentro do círculo de 50 km"
          >
            <RefreshCw className={status === "loading" ? "spin" : ""} />
            <span>AIS FREE</span>
          </button>
          <button
            type="button"
            className="ais-v129-vessel-free-refresh"
            onClick={() => void loadFreeMapLayer(true, areaCenter)}
            disabled={freeMapStatus === "loading"}
            title="Atualizar Vessel Free na região do círculo de 50 km"
          >
            <RefreshCw className={freeMapStatus === "loading" ? "spin" : ""} />
            <span>VESSEL FREE</span>
          </button>
        </div>

        <div className="ais-map-header-controls ais-single-map-badge ais-v119-layerbar">
          <span className="ais-v119-layer free"><i /> Vessel Free · {freeMapVessels.length}</span>
          <span className="ais-v119-layer marinesia"><i /> AIS Free</span>
          <span className="ais-v119-layer premium"><i /> Premium</span>
          <button type="button" className={`ais-v119-refresh-free ${freeMapStatus}`} onClick={() => void loadFreeMapLayer(true)} title="Atualizar barcos gratuitos"><RefreshCw className={freeMapStatus === "loading" ? "spin" : ""} /></button>
        </div>

        <div className={`ais-v119-wallet ${credits == null ? "loading" : credits <= 0 ? "no-credit" : "has-credit"} ${creditMenuOpen ? "open" : ""}`}>
          <button type="button" className="ais-v119-wallet-main" onClick={() => setCreditMenuOpen((open) => !open)} aria-expanded={creditMenuOpen}>
            <span className="ais-v119-wallet-icon"><WalletCards /></span>
            <span className="ais-v119-wallet-copy">
              <small>CRÉDITOS</small>
              <b>{credits != null ? formatBrl(credits * creditUnitPrice) : "—"}</b>
            </span>
            <em>{credits != null ? `${credits} CR` : "..."}</em>
          </button>
          <button type="button" className="ais-v119-wallet-plus" onClick={() => setCreditMenuOpen((open) => !open)} aria-label="Comprar créditos" title="Comprar créditos"><Plus /></button>
          {creditMenuOpen && (
            <div className="ais-v119-wallet-menu">
              <span>ADICIONAR CRÉDITOS</span>
              <button type="button" onClick={() => openCreditPack(5)}><b>+ R$ 5</b><small>comprar</small></button>
              <button type="button" onClick={() => openCreditPack(10)}><b>+ R$ 10</b><small>comprar</small></button>
            </div>
          )}
        </div>

        <div className="ais-v70-mobile-dock ais-v119-dock">
          <button type="button" className={mobilePanel === "search" ? "active" : ""} onClick={() => setMobilePanel(mobilePanel === "search" ? null : "search")}><Search /><span>Buscar</span></button>
          <button type="button" className={mobilePanel === "areaSearch" ? "active area" : "area"} onClick={() => { const opening = mobilePanel !== "areaSearch"; setMobilePanel(opening ? "areaSearch" : null); if (opening && !areaCenter) chooseAreaCenterFromMap(); }}><Crosshair /><span>50 km</span></button>
          <button type="button" className={mobilePanel === "saved" ? "active premium" : "premium"} onClick={() => setMobilePanel(mobilePanel === "saved" ? null : "saved")}><FolderHeart /><span>Salvos</span><em>{premiumSavedVessels.length}</em></button>
          <button type="button" className={mobilePanel === "history" ? "active" : ""} onClick={() => setMobilePanel(mobilePanel === "history" ? null : "history")}><History /><span>Histórico</span><em>{historyItems.length}</em></button>
        </div>

        {mobilePanel && (
          <div className={`ais-v70-mobile-panel ${mobilePanel}`}>
            <div className="ais-v70-mobile-panel-head">
              <b>{mobilePanel === "search" ? "Buscar barco" : mobilePanel === "areaSearch" ? "Buscar em 50 km" : mobilePanel === "saved" ? "Barcos salvos" : mobilePanel === "areaSaved" ? "Resultados 50 km" : "Histórico AIS"}</b>
              <button type="button" onClick={() => setMobilePanel(null)}>×</button>
            </div>

            {mobilePanel === "search" && (
              <div className="ais-v70-mobile-search ais-v127-simple-search">
                <div className="ais-v125-mobile-search-stack">
                  <section className="ais-v125-mobile-search-card premium">
                    <div className="ais-v125-mobile-search-title"><Radio /><span><b>PREMIUM · DATA DOCKED</b><small>{aisPricing.locateCredits} créditos por posição</small></span></div>
                    <div className="ais-v70-mobile-input"><Search /><input value={premiumQuery} onChange={(e) => setPremiumQuery(e.target.value)} placeholder="Nome, MMSI ou IMO" /><button type="button" onClick={() => { setSearchProvider("premium"); setNameQuery(premiumQuery); void searchByName(undefined, "premium", premiumQuery); }} disabled={status === "loading"}>Buscar</button></div>
                  </section>

                  <section className="ais-v125-mobile-search-card free">
                    <div className="ais-v125-mobile-search-title"><Navigation /><span><b>AIS FREE · MARINESIA</b><small>{marinesiaCooldownUntil > Date.now() ? "Aguardando janela · cache/fallback ativo" : "0 créditos"}</small></span></div>
                    <div className="ais-v70-mobile-input"><Search /><input value={freeQuery} onChange={(e) => setFreeQuery(e.target.value)} placeholder="Nome, MMSI ou IMO · vazio = região" /><button type="button" onClick={() => { setSearchProvider("marinesia"); setNameQuery(freeQuery); void searchByName(undefined, "marinesia", freeQuery); }} disabled={status === "loading"}>Buscar</button></div>
                  </section>
                </div>

                {matches.length > 0 && <div className="ais-v70-mobile-results">{matches.slice(0, 6).map((match, index) => <button type="button" key={`${match.mmsi}-${index}`} onClick={() => { getVesselPosition(match, false, searchProvider); setMobilePanel(null); }}><Ship /><span><b>{match.name}</b><small>MMSI {match.mmsi || "—"} · IMO {match.imo || "—"}</small></span><em>{searchProvider === "premium" ? "PREMIUM" : "GRÁTIS"}</em></button>)}</div>}
              </div>
            )}

            {mobilePanel === "areaSearch" && (
              <div className="ais-v127-area-simple">
                <div className="ais-v127-area-hero">
                  <span><Crosshair /></span>
                  <div><b>RADAR 50 KM</b><small>Uma busca simples na região escolhida</small></div>
                  <em>{aisPricing.areaCredits} CR</em>
                </div>

                <div className="ais-v127-area-pick">
                  <button type="button" onClick={() => locateDevice(true)}><LocateFixed /> Meu GPS</button>
                  <button type="button" onClick={chooseAreaCenterFromMap}><Crosshair /> Centro do mapa</button>
                </div>

                <div className="ais-v127-area-current">
                  <small>Centro da busca</small>
                  <b>{areaCenter ? `${formatCoordMarine(areaCenter.lat, true)} · ${formatCoordMarine(areaCenter.lon, false)}` : "Use GPS ou o centro do mapa"}</b>
                </div>

                <button type="button" className="ais-v127-area-main" onClick={() => { setSearchProvider("premium"); void searchArea("premium"); }} disabled={status === "loading" || !areaCenter}>
                  {status === "loading" ? <RefreshCw className="spin" /> : <Radio />}
                  {status === "loading" ? "BUSCANDO..." : `BUSCAR 50 KM · ${aisPricing.areaCredits} CR`}
                </button>

                <button type="button" className="ais-v127-area-more" onClick={() => setMobileAreaAdvanced((value) => !value)}>
                  {mobileAreaAdvanced ? "Ocultar posição manual" : "Digitar outra posição"}
                </button>

                {mobileAreaAdvanced && (
                  <div className="ais-v74-mobile-coordinates ais-v127-manual">
                    <label><span>Latitude Sul</span><span className="coord-free-input"><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={manualLatDigits} onChange={(e) => { setManualLatDigits(e.target.value.replace(/\D/g, "").slice(0, 6)); setManualCoordError(""); }} placeholder="254530" /><span className="coord-degree" aria-hidden="true">°</span></span></label>
                    <label><span>Longitude Oeste</span><span className="coord-free-input"><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={manualLonDigits} onChange={(e) => { setManualLonDigits(e.target.value.replace(/\D/g, "").slice(0, 6)); setManualCoordError(""); }} placeholder="462550" /><span className="coord-degree" aria-hidden="true">°</span></span></label>
                    <button type="button" onClick={() => applyManualAreaCoordinates(false)}><MapPinned /> Usar posição</button>
                  </div>
                )}
                {manualCoordError && <p className="ais-v74-coordinate-error mobile">{manualCoordError}</p>}

                <button type="button" className="ais-v127-area-saved" onClick={() => setMobilePanel("areaSaved")}><FolderHeart /> Ver resultados salvos <em>{areaSavedVessels.length}</em></button>
              </div>
            )}

            {mobilePanel === "saved" && <div className="ais-v70-mobile-list saved">{premiumSavedVessels.length ? premiumSavedVessels.slice(0, 30).map((item) => <article className="ais-mobile-saved-row" key={item.vesselKey}>
              <button type="button" className="ais-mobile-saved-main" onClick={() => { openSavedVessel(item); setMobilePanel(null); }}><Ship /><span><b>{item.name}</b><small>{item.lastLatitude != null ? `${formatCoordMarine(Number(item.lastLatitude), true)} · ${formatCoordMarine(Number(item.lastLongitude), false)}` : "Sem posição salva"}</small></span></button>
              <button type="button" className="ais-mobile-saved-update" onClick={() => void getVesselPosition(savedItemToMatch(item), true, item.folder === "marinesia" ? "marinesia" : "premium")}><RefreshCw /><span>{item.folder === "marinesia" ? "ATUALIZAR GRÁTIS" : `ATUALIZAR · ${aisPricing.updateCredits} CR`}</span></button>
            </article>) : <p>Nenhum barco salvo.</p>}</div>}

            {mobilePanel === "areaSaved" && <div className="ais-v70-mobile-list area-saved">{areaSavedVessels.length ? areaSavedVessels.slice(0, 80).map((item) => <article className="ais-mobile-saved-row" key={item.vesselKey}>
              <button type="button" className="ais-mobile-saved-main" onClick={() => { openSavedVessel(item); setMobilePanel(null); }}><Ship /><span><b>{item.name}</b><small>{item.lastLatitude != null ? `${formatCoordOperational(Number(item.lastLatitude), true)} · ${formatCoordOperational(Number(item.lastLongitude), false)}` : "Sem posição"}</small></span></button>
              <button type="button" className="ais-mobile-saved-update" onClick={() => void getVesselPosition(savedItemToMatch(item), true, "premium")}><RefreshCw /><span>ATUALIZAR</span></button>
            </article>) : <p>Nenhuma busca premium de 50 km salva ainda.</p>}</div>}

            {mobilePanel === "history" && <div className="ais-v70-mobile-list history">{historyItems.length ? <><button type="button" className="danger" onClick={clearAisHistory}><Trash2 /> Limpar histórico</button>{historyItems.slice(0, 10).map((item) => {
              const historyVessel = historyItemToVessel(item);
              const historyKey = vesselKeyFrom(historyVessel);
              const historySaved = Boolean(historyKey && savedKeys.has(historyKey));
              const historySaving = Boolean(historyKey && savingKeys.has(historyKey));
              return <article className="ais-mobile-history-row" key={item.id}>
                <button type="button" className="ais-mobile-history-main" onClick={() => { openHistoryItem(item); setMobilePanel(null); }}><History /><span><b>{item.name}</b><small>{formatCoordMarine(Number(item.latitude), true)} · {formatCoordMarine(Number(item.longitude), false)}</small></span></button>
                <button type="button" className={`ais-mobile-history-save ${historySaved ? "saved" : ""}`} onClick={() => { if (!historySaved) void saveVessel(historyVessel); }} disabled={historySaving || historySaved}><Bookmark /><span>{historySaving ? "SALVANDO" : historySaved ? "SALVO" : "SALVAR"}</span></button>
              </article>;
            })}</> : <p>Histórico vazio.</p>}</div>}
          </div>
        )}

        {!tracked && showEmptyHint && (
          <div className="ais-v61-map-empty">
            <button
              type="button"
              className="ais-v71-empty-close"
              aria-label="Fechar aviso"
              title="Fechar aviso"
              onClick={() => setShowEmptyHint(false)}
            >
              ×
            </button>
            <Radio />
            <b>{freeMapVessels.length ? "Toque em um barco no mapa" : "Nenhum barco selecionado"}</b>
            <span>{freeMapVessels.length ? "A camada AIS automática não consome créditos. A pesquisa manual continua separada." : "Procure o nome acima. Ao escolher a embarcação, a posição aparece aqui."}</span>
          </div>
        )}

        {tracked && trackedDateTime && (
          <div key={`${trackedKey}-${cardPulse}`} className={`ais-v95-map-card ais-v119-map-card ${trackedSource?.className || ""}`} style={cardAnchor ? { left: cardAnchor.left, top: cardAnchor.top, right: "auto", bottom: "auto" } : undefined}>
            <div className="ais-v95-map-card-head">
              <div>
                <b>{tracked.name || `MMSI ${tracked.mmsi}`}</b>
                <small>{trackedSource?.title || "AIS"} · MMSI {tracked.mmsi || "—"}</small>
              </div>
              <button type="button" aria-label="Fechar dados da embarcação" title="Fechar" onClick={() => { trackedRef.current = null; setTracked(null); setCardAnchor(null); }}>×</button>
            </div>
            <div className="ais-v95-map-position">
              <span>POSIÇÃO</span>
              <strong>{formatCoordOperational(tracked.lat, true)}</strong>
              <strong>{formatCoordOperational(tracked.lon, false)}</strong>
            </div>
            <div className="ais-v95-map-time">
              <span><small>DATA RASTREADA</small><b>{trackedDateTime.date}</b></span>
              <span><small>HORA</small><b>{trackedDateTime.time}</b></span>
            </div>
            <div className="ais-v95-map-mini">
              <span><small>VELOCIDADE</small><b>{tracked.sog != null ? `${Number(tracked.sog).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MN/h` : "—"}</b></span>
              <span><small>RUMO</small><b>{tracked.cog != null ? `${Math.round(tracked.cog)}º` : "—"}</b></span>
              <span><small>FONTE</small><b>{trackedSource?.short || "AIS"}</b></span>
            </div>
          </div>
        )}

        <div className="ais-bottom-status">
          <span><Anchor /> Zoom {zoom}</span>
          <span>{formatCoord(center.lat, true)} · {formatCoord(center.lon, false)}</span>
          {devicePosition && <span className="ais-gps-ok"><LocateFixed /> GPS ativo</span>}
        </div>
      </div>

      {recentCards.length > 0 && (
        <section className="ais-v67-recent-section">
          <div className="ais-v67-recent-head">
            <div>
              <small>POSIÇÕES RECENTES</small>
              <b>Últimos barcos consultados</b>
            </div>
            <span>até 3 cards · abrir histórico não gasta créditos</span>
          </div>

          <div className="ais-v67-recent-grid">
            {recentCards.map(({ key, vessel, historyItem, current }) => {
              const source = sourceInfo(vessel.dataSource);
              const age = positionAgeLabel(vessel.positionReceived || vessel.updateTime);
              const providerDate = parseProviderTime(vessel.positionReceived || vessel.updateTime);
              const vesselKey = vesselKeyFrom(vessel);
              const isSaved = vesselKey ? savedKeys.has(vesselKey) : false;
              return (
                <article key={`${key}-${historyItem?.id || "current"}`} className={`ais-v67-square-card ${current ? "current" : "history"}`}>
                  <div className="ais-v67-card-top">
                    <div className="ais-v67-card-name">
                      <small>{current ? "EMBARCAÇÃO LOCALIZADA" : "HISTÓRICO AIS"}</small>
                      <h3>{vessel.name || `MMSI ${vessel.mmsi}`}</h3>
                      <em>MMSI {vessel.mmsi || "—"}{vessel.imo ? ` · IMO ${vessel.imo}` : ""}</em>
                    </div>
                    <div className={`ais-v67-source ${source.className}`}>
                      <Radio />
                      <span>{source.short}</span>
                    </div>
                  </div>

                  <div className="ais-v67-position">
                    <small>POSIÇÃO AIS</small>
                    <strong>{formatCoordMarine(vessel.lat, true)}</strong>
                    <strong>{formatCoordMarine(vessel.lon, false)}</strong>
                    <span>WGS84 · graus e minutos decimais</span>
                  </div>

                  <div className="ais-v67-time">
                    <div>
                      <small>HORÁRIO DA POSIÇÃO</small>
                      <b>{providerDate ? formatLocalDateTime(providerDate) : (vessel.positionReceived || "Não informado")}</b>
                    </div>
                    <strong className={age.className}>{age.label}</strong>
                  </div>

                  <div className="ais-v67-mini-grid">
                    <span><small>VELOCIDADE</small><b>{vessel.sog != null ? `${Number(vessel.sog).toFixed(1)} kn` : "—"}</b></span>
                    <span><small>RUMO</small><b>{vessel.cog != null ? `${Math.round(vessel.cog)}°` : "—"}</b></span>
                    <span><small>PROA</small><b>{vessel.heading != null && vessel.heading < 511 ? `${Math.round(vessel.heading)}°` : "—"}</b></span>
                    <span><small>STATUS</small><b>{vessel.navStatusText || "Não informado"}</b></span>
                    <span className="wide"><small>DESTINO</small><b>{vessel.destination || "—"}</b></span>
                    <span><small>FONTE</small><b>{source.title}</b></span>
                  </div>

                  <div className="ais-v67-card-actions">
                    {current ? (
                      <>
                        <button type="button" className="primary" onClick={() => getVesselPosition({
                          name: vessel.name || "",
                          mmsi: vessel.mmsi,
                          imo: vessel.imo || "",
                          country: "",
                          countryIso: "",
                          shipType: "",
                          typeSpecific: vessel.vesselType || "",
                          callsign: vessel.callsign || "",
                        }, true)} disabled={status === "loading"}>
                          <RefreshCw /> Atualizar · {`${aisPricing.updateCredits} CR`}
                        </button>
                        <button type="button" className={isSaved ? "saved" : ""} disabled={Boolean(vesselKey && savingKeys.has(vesselKey))} onClick={() => vesselKey && isSaved ? removeSavedVessel(vesselKey) : saveVessel(vessel)}>
                          <Bookmark /> {vesselKey && savingKeys.has(vesselKey) ? "Salvando..." : isSaved ? "Salvo ✓" : "Salvar"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="primary" onClick={() => historyItem && openHistoryItem(historyItem)}>
                          <MapPinned /> Abrir no mapa · 0 CR
                        </button>
                        <button type="button" className={isSaved ? "saved" : ""} disabled={Boolean(vesselKey && savingKeys.has(vesselKey))} onClick={() => vesselKey && isSaved ? removeSavedVessel(vesselKey) : saveVessel(vessel)}>
                          <Bookmark /> {vesselKey && savingKeys.has(vesselKey) ? "Salvando..." : isSaved ? "Salvo ✓" : "Salvar"}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="ais-footnote ais-v61-footnote">
        <b>AIS profissional · Vessel Free + Premium + Marinesia</b>
        <span>
          A pesquisa manual por nome usa APRS.fi sem descontar créditos. O APRS.fi exige busca por alvo específico, então digite o nome exato do barco. Fonte:{" "}
          <a href="https://aprs.fi" target="_blank" rel="noreferrer">aprs.fi</a>. A busca por área continua separada e todas as chaves ficam somente no backend.
        </span>
      </div>
    </section>
  );
}
