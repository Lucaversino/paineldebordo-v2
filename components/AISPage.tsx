"use client";
import GfwFreeSearch from "./GfwFreeSearch";
import { formatCoordinateInput } from "../lib/marineCoordinate";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  Bookmark,
  Crosshair,
  FolderHeart,
  Flag,
  History,
  LocateFixed,
  MapPinned,
  Minus,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  Ruler,
  Route,
  Undo2,
  Save,
  Search,
  Settings,
  Ship,
  Trash2,
  WalletCards,
} from "lucide-react";
import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorTileLayer from "ol/layer/VectorTile";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import VectorTileSource from "ol/source/VectorTile";
import GeoJSON from "ol/format/GeoJSON";
import Translate from "ol/interaction/Translate";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import CircleGeom from "ol/geom/Circle";
import { Circle as CircleStyle, Fill, Icon as IconStyle, RegularShape, Stroke, Style, Text } from "ol/style";
import { fromLonLat, toLonLat } from "ol/proj";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { officialWaypointIconDataUri } from "../lib/officialWaypointIcons";

const DHN_TILE_BASE = (process.env.NEXT_PUBLIC_DHN_TILE_BASE_URL || "/cartas").replace(/\/$/, "");
// V194: carta náutica DHN automática no AIS. Não exige botão do usuário.
const ENABLE_DHN_CHARTS = true;
const AREA_RESULTS_TTL_HOURS = 8;
const AREA_RESULTS_TTL_MS = AREA_RESULTS_TTL_HOURS * 60 * 60 * 1000;

type Props = {
  defaultLat?: number | null;
  defaultLon?: number | null;
};

type BaseMode = "dhn" | "map";
type AisStatus = "idle" | "loading" | "ready" | "error" | "config";
type SearchMode = "vessel" | "area";
type MobilePanel = "areaSearch" | "saved" | "areaSaved" | "waypoints" | "history" | null;
type SearchProvider = "premium" | "marinesia" | "shipfinder";
type MapOrientationMode = "heading" | "course" | "north" | "south";
type WaypointIcon = "circle" | "diamond" | "triangle" | "cross" | "star";

type RoutePoint = { order: number; latitude: number; longitude: number };
type SavedRoute = { id: number; name: string; description: string; waypoints: RoutePoint[]; createdAt: string; updatedAt: string };

type MapWaypoint = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  icon: WaypointIcon;
  color: string;
  createdAt: string;
  updatedAt: string;
};

type OfficialWaypointType = "skull" | "rock" | "reef" | "wreck";
type OfficialWaypoint = {
  id: number;
  name: string;
  waypointType: OfficialWaypointType;
  latitude: number;
  longitude: number;
  description: string;
  visible: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type OfficialAreaColor = "green" | "yellow" | "red";
type OfficialAreaPoint = { latitude: number; longitude: number };
type OfficialArea = {
  id: number;
  name: string;
  color: OfficialAreaColor;
  transparency: number;
  points: OfficialAreaPoint[];
  description: string;
  visible: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

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

type DhnCatalogEntry = {
  group: string;
  number: string;
  title: string;
  kapUrl?: string;
  geotiffUrl?: string;
};

function directChildByLocalName(element: Element, localName: string) {
  return Array.from(element.children).find((child) => child.localName === localName) || null;
}

function directChildText(element: Element, localName: string) {
  return directChildByLocalName(element, localName)?.textContent?.trim() || "";
}

function parseDhnCapabilities(xml: string, catalog: DhnCatalogEntry[]) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.querySelector("parsererror")) return [] as DhnChart[];

  const charts = new Map<string, DhnChart>();

  Array.from(documentXml.getElementsByTagNameNS("*", "Layer")).forEach((layer) => {
    const layerName = directChildText(layer, "Name");
    const title = directChildText(layer, "Title");
    if (!layerName || !title) return;

    const numberTokens = ((layerName + " " + title).match(/\b\d{2,5}\b/g) || []);
    const entry = catalog.find((item) => numberTokens.includes(item.number));
    if (!entry || charts.has(entry.number)) return;

    let bounds: [number, number, number, number] | null = null;
    const geo = directChildByLocalName(layer, "EX_GeographicBoundingBox");
    if (geo) {
      const west = Number(directChildText(geo, "westBoundLongitude"));
      const east = Number(directChildText(geo, "eastBoundLongitude"));
      const south = Number(directChildText(geo, "southBoundLatitude"));
      const north = Number(directChildText(geo, "northBoundLatitude"));
      if ([west, south, east, north].every(Number.isFinite)) bounds = [west, south, east, north];
    }

    if (!bounds) {
      const latLon = directChildByLocalName(layer, "LatLonBoundingBox");
      if (latLon) {
        const west = Number(latLon.getAttribute("minx"));
        const south = Number(latLon.getAttribute("miny"));
        const east = Number(latLon.getAttribute("maxx"));
        const north = Number(latLon.getAttribute("maxy"));
        if ([west, south, east, north].every(Number.isFinite)) bounds = [west, south, east, north];
      }
    }

    const scaleMatch = title.match(/1\s*:\s*([\d.]+)/);
    const scale = scaleMatch ? Number(scaleMatch[1].replace(/\./g, "")) : null;
    charts.set(entry.number, {
      number: entry.number,
      title: entry.title || title,
      groups: [entry.group],
      scale: Number.isFinite(scale) ? scale : null,
      bounds,
      files: [entry.kapUrl || "", entry.geotiffUrl || ""].filter(Boolean),
      layerName,
      source: "wms",
    });
  });

  return Array.from(charts.values()).sort((a, b) => Number(a.number) - Number(b.number));
}

type VesselMatch = {
  name: string;
  mmsi: string;
  imo: string;
  country: string;
  countryIso: string;
  shipType: string;
  typeSpecific: string;
  callsign: string;
  freeProvider?: "aprsfi" | "shipfinder";
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

function chartCoverageSpan(chart: DhnChart) {
  if (!chart.bounds || chart.bounds.length !== 4) return Number.POSITIVE_INFINITY;
  const [west, south, east, north] = chart.bounds;
  const width = Math.max(0.0001, Math.abs(east - west));
  const height = Math.max(0.0001, Math.abs(north - south));
  return Math.max(width, height);
}

function idealSpanForZoom(zoom: number) {
  // Aproxima a largura visível de um mapa de 4,5 tiles. Em zoom maior,
  // prefere automaticamente cartas de área menor (mais detalhadas).
  return (360 / Math.pow(2, Math.max(3, zoom))) * 4.5;
}

function chooseDhnChart(charts: DhnChart[], lon: number, lat: number, zoom: number) {
  const covering = charts.filter((chart) => chartContains(chart, lon, lat));
  if (!covering.length) return null;
  const idealScale = idealScaleForZoom(zoom);
  const idealSpan = idealSpanForZoom(zoom);

  return [...covering].sort((a, b) => {
    const score = (chart: DhnChart) => {
      const scale = Number(chart.scale || 0);
      if (scale > 0) return Math.abs(Math.log(scale / idealScale));
      const span = chartCoverageSpan(chart);
      return Number.isFinite(span) ? Math.abs(Math.log(span / idealSpan)) + 0.08 : 99;
    };
    const sourcePenalty = (chart: DhnChart) => chart.source === "local" ? -0.05 : 0;
    return (score(a) + sourcePenalty(a)) - (score(b) + sourcePenalty(b));
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

function coordDigitsFromDecimal(value: number, latitude: boolean) {
  const absolute = Math.abs(value);
  let degrees = Math.floor(absolute);
  let minutes = (absolute - degrees) * 60;
  if (Number(minutes.toFixed(2)) >= 60) {
    degrees += 1;
    minutes = 0;
  }
  const degreeWidth = latitude ? 2 : (degrees >= 100 ? 3 : 2);
  return `${String(degrees).padStart(degreeWidth, "0")}${minutes.toFixed(2).replace(".", "").padStart(4, "0")}`;
}

function formatArrivalClock(now: Date, etaMinutes: number | null) {
  if (etaMinutes == null || !Number.isFinite(etaMinutes) || etaMinutes < 0) return "—";
  const arrival = new Date(now.getTime() + etaMinutes * 60_000);
  return `${String(arrival.getHours()).padStart(2, "0")}:${String(arrival.getMinutes()).padStart(2, "0")}`;
}

function formatCourseDegrees(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const normalized = ((Math.round(value) % 360) + 360) % 360;
  return `${String(normalized).padStart(3, "0")}º`;
}

function initialBearingRad(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (value: number) => value * Math.PI / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  return Math.atan2(
    Math.sin(dLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon),
  );
}

function crossTrackErrorNm(start: { lat: number; lon: number }, end: { lat: number; lon: number }, current: { lat: number; lon: number }) {
  const earthRadiusNm = 3440.065;
  const distanceNm = haversineKm(start, current) / 1.852;
  if (distanceNm < 0.001) return 0;
  const angularDistance = distanceNm / earthRadiusNm;
  const theta13 = initialBearingRad(start, current);
  const theta12 = initialBearingRad(start, end);
  return Math.asin(Math.sin(angularDistance) * Math.sin(theta13 - theta12)) * earthRadiusNm;
}

function bearingDegrees(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = initialBearingRad(a, b);
  return (rad * 180 / Math.PI + 360) % 360;
}

function destinationPointNm(origin: { lat: number; lon: number }, bearingDeg: number, distanceNm: number) {
  const radiusNm = 3440.065;
  const toRad = (value: number) => value * Math.PI / 180;
  const toDeg = (value: number) => value * 180 / Math.PI;
  const angularDistance = Math.max(0, distanceNm) / radiusNm;
  const bearing = toRad((bearingDeg + 360) % 360);
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
      + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  const normalizedLon = ((toDeg(lon2) + 540) % 360) - 180;
  return { lat: toDeg(lat2), lon: normalizedLon };
}

function routeCorridorEdges(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
  offsetNm: number,
) {
  const startCourse = bearingDegrees(start, end);
  const endCourse = (bearingDegrees(end, start) + 180) % 360;
  return {
    port: [
      destinationPointNm(start, startCourse - 90, offsetNm),
      destinationPointNm(end, endCourse - 90, offsetNm),
    ],
    starboard: [
      destinationPointNm(start, startCourse + 90, offsetNm),
      destinationPointNm(end, endCourse + 90, offsetNm),
    ],
  };
}

function orientationLabel(mode: MapOrientationMode) {
  if (mode === "heading") return "PROA UP";
  if (mode === "course") return "RUMO UP";
  if (mode === "south") return "SUL UP";
  return "NORTE UP";
}

const NAVIGATION_STORAGE_KEY = "painel-bordo-active-navigation-v152";
const NAV_BOAT_SRC = "/icons/baco-malha-v152.svg";

function navBoatFallbackStyle(headingDegrees = 0) {
  const rotation = (Number.isFinite(headingDegrees) ? headingDegrees : 0) * Math.PI / 180;
  return new Style({
    image: new RegularShape({
      points: 3,
      radius: 14,
      angle: 0,
      rotation,
      rotateWithView: true,
      fill: new Fill({ color: "#44d7ff" }),
      stroke: new Stroke({ color: "#ffffff", width: 2.2 }),
    }),
    zIndex: 80,
  });
}

function gpsPositionStyle(navigating: boolean, headingDegrees = 0, imageReady = true) {
  if (!navigating) {
    return new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: "#2a92ff" }),
        stroke: new Stroke({ color: "#ffffff", width: 3 }),
      }),
      zIndex: 80,
    });
  }

  if (!imageReady) return navBoatFallbackStyle(headingDegrees);

  return new Style({
    image: new IconStyle({
      src: NAV_BOAT_SRC,
      anchor: [0.5, 0.5],
      anchorXUnits: "fraction",
      anchorYUnits: "fraction",
      scale: 0.027,
      rotation: (Number.isFinite(headingDegrees) ? headingDegrees : 0) * Math.PI / 180,
      rotateWithView: true,
    }),
    zIndex: 120,
  });
}

function waypointSymbol(icon: WaypointIcon) {
  if (icon === "diamond") return "◆";
  if (icon === "triangle") return "▲";
  if (icon === "cross") return "✚";
  if (icon === "star") return "★";
  return "●";
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const radiusKm = 6371.0088;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
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
  const digits = raw.replace(/\D/g, "").slice(0, latitude ? 6 : 7);
  const degreeDigits = latitude ? 2 : (digits.length >= 7 ? 3 : 2);
  if (digits.length < degreeDigits + 2) return null;
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
  if (/shipfinder/i.test(source)) {
    return { title: "ShipFinder AIS", short: "SHIPFINDER", className: "shipfinder" };
  }
  if (/premium|data docked|datadocked/i.test(source)) {
    return { title: "AIS Premium", short: "PREMIUM", className: "premium" };
  }
  if (/aprs\.fi|aprsfi|ais free/i.test(source)) {
    return { title: "AIS Free", short: "FREE", className: "free" };
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

const BATHYMETRY_STYLE_CACHE = new Map<number, Style>();

function bathymetryContourStyle(feature: any) {
  const depth = Number(feature?.get?.("depth"));
  if (!Number.isFinite(depth) || depth <= 0 || depth > 200) return undefined;

  const cached = BATHYMETRY_STYLE_CACHE.get(depth);
  if (cached) return cached;

  const major = depth % 50 === 0 || depth === 200;
  const emphasized = depth === 20 || depth === 30 || depth === 40 || depth === 75 || depth === 100 || depth === 150 || depth === 200;
  const style = new Style({
    stroke: new Stroke({
      color: major ? "rgba(0, 68, 116, 0.99)" : "rgba(0, 116, 158, 0.94)",
      width: major ? 2.45 : emphasized ? 1.9 : 1.45,
    }),
    text: new Text({
      text: `${Math.round(depth)} m`,
      placement: "line",
      repeat: major ? 145 : 205,
      overflow: true,
      maxAngle: Math.PI / 7,
      keepUpright: true,
      font: major ? "900 12px system-ui, sans-serif" : "850 11px system-ui, sans-serif",
      fill: new Fill({ color: major ? "#003656" : "#005977" }),
      stroke: new Stroke({ color: "rgba(255,255,255,1)", width: major ? 4.4 : 3.8 }),
      padding: [1, 2, 1, 2],
    }),
  });
  BATHYMETRY_STYLE_CACHE.set(depth, style);
  return style;
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
  const mapRef = useRef<OlMap | null>(null);
  const vesselSourceRef = useRef<VectorSource | null>(null);
  const freeVesselSourceRef = useRef<VectorSource | null>(null);
  const positionSourceRef = useRef<VectorSource | null>(null);
  const probeSourceRef = useRef<VectorSource | null>(null);
  const waypointSourceRef = useRef<VectorSource | null>(null);
  const officialWaypointSourceRef = useRef<VectorSource | null>(null);
  const officialAreaSourceRef = useRef<VectorSource | null>(null);
  const officialAreaDraftSourceRef = useRef<VectorSource | null>(null);
  const routeSourceRef = useRef<VectorSource | null>(null);
  const routeTranslateRef = useRef<Translate | null>(null);
  const measureSourceRef = useRef<VectorSource | null>(null);
  const navigationSourceRef = useRef<VectorSource | null>(null);
  const areaSourceRef = useRef<VectorSource | null>(null);
  const streetLayerRef = useRef<TileLayer<OSM> | null>(null);
  const dhnLayerRef = useRef<TileLayer<XYZ | TileWMS> | null>(null);
  const bathymetryLayerRef = useRef<TileLayer<TileWMS> | null>(null);
  const probeDepthRequestRef = useRef(0);
  const mapVesselRegistryRef = useRef<Map<string, Vessel>>(new Map());
  const vesselFeatureRegistryRef = useRef<Map<string, Feature>>(new Map());
  const vesselStyleBucketRef = useRef<number | null>(null);
  const vesselIconPathCacheRef = useRef<Map<string, string>>(new Map());
  const trackedRef = useRef<Vessel | null>(null);
  const searchModeRef = useRef<SearchMode>("vessel");
  const areaRadiusRef = useRef<50>(50);
  const measureModeRef = useRef(false);
  const measureStartRef = useRef<{ lat: number; lon: number } | null>(null);
  const navigationStartRef = useRef<{ lat: number; lon: number } | null>(null);
  const navigationTrailRef = useRef<Array<{ lat: number; lon: number }>>([]);
  const navigationTargetRef = useRef<MapWaypoint | null>(null);
  const freeNavigationActiveRef = useRef(false);
  const navigationPersistAtRef = useRef(0);
  const smoothedSpeedRef = useRef<number | null>(null);
  const gpsPreviousRef = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const stableGpsHeadingRef = useRef<number | null>(null);
  const gpsFeatureRef = useRef<Feature | null>(null);
  const gpsAnimationFrameRef = useRef<number | null>(null);
  const navBoatImageReadyRef = useRef(true);
  const gpsCenteredRef = useRef(false);
  const navigationFollowAtRef = useRef(0);
  const navigationFollowCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  // V197: follow é automático ao iniciar, mas o usuário pode arrastar o mapa livremente.
  // O botão GPS religa o acompanhamento do barco.
  const navigationFollowEnabledRef = useRef(true);
  const freeLayerTimerRef = useRef<number | null>(null);
  const freeLayerRequestRef = useRef({ key: "", at: 0, seq: 0 });
  // V139: trava síncrona para impedir clique duplo antes do React atualizar o estado loading.
  // FREE e PREMIUM mantêm travas independentes e nunca compartilham o mesmo fluxo.
  const freeSearchInFlightRef = useRef(false);
  const premiumSearchInFlightRef = useRef(false);

  const [freeSearchQuery, setFreeSearchQuery] = useState("");
  const [freeSearchLoading, setFreeSearchLoading] = useState(false);
  const [freeSearchError, setFreeSearchError] = useState("");
  const [freeSearchResults, setFreeSearchResults] = useState<VesselMatch[]>([]);
  const [premiumSearchQuery, setPremiumSearchQuery] = useState("");
  const [premiumSearchLoading, setPremiumSearchLoading] = useState(false);
  const [premiumSearchError, setPremiumSearchError] = useState("");
  const [premiumSearchResults, setPremiumSearchResults] = useState<VesselMatch[]>([]);
  const [freePanelOpen, setFreePanelOpen] = useState(false);
  const [premiumPanelOpen, setPremiumPanelOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("vessel");
  const [searchProvider, setSearchProvider] = useState<SearchProvider>("premium");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [areaRadius] = useState<50>(50);
  const [areaCenter, setAreaCenter] = useState<{ lat: number; lon: number } | null>({ lat: fallbackLat, lon: fallbackLon });
  const [manualLatDigits, setManualLatDigits] = useState("");
  const [manualLonDigits, setManualLonDigits] = useState("");
  const [manualCoordError, setManualCoordError] = useState("");
  const [mobileAreaAdvanced, setMobileAreaAdvanced] = useState(false);
  const [areaVessels, setAreaVessels] = useState<Vessel[]>([]);
  const [areaCost, setAreaCost] = useState<number | null>(null);
  const [freeMapVesselCount, setFreeMapVesselCount] = useState(0);
  const [freeMapStatus, setFreeMapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [cardAnchor, setCardAnchor] = useState<{ left: number; top: number } | null>(null);
  const [cardPulse, setCardPulse] = useState(0);
  const [creditMenuOpen, setCreditMenuOpen] = useState(false);
  const [mapProbe, setMapProbe] = useState<{ lat: number; lon: number } | null>(null);
  const [waypoints, setWaypoints] = useState<MapWaypoint[]>([]);
  const [officialWaypoints, setOfficialWaypoints] = useState<OfficialWaypoint[]>([]);
  const [selectedOfficialWaypoint, setSelectedOfficialWaypoint] = useState<OfficialWaypoint | null>(null);
  const [officialAreas, setOfficialAreas] = useState<OfficialArea[]>([]);
  const [canManageOfficialAreas, setCanManageOfficialAreas] = useState(false);
  const [officialAreaDrawMode, setOfficialAreaDrawMode] = useState(false);
  const [officialAreaDraftPoints, setOfficialAreaDraftPoints] = useState<OfficialAreaPoint[]>([]);
  const [officialAreaName, setOfficialAreaName] = useState("");
  const [officialAreaColor, setOfficialAreaColor] = useState<OfficialAreaColor>("green");
  const [officialAreaTransparency, setOfficialAreaTransparency] = useState(55);
  const [officialAreaSaving, setOfficialAreaSaving] = useState(false);
  const [waypointPanelOpen, setWaypointPanelOpen] = useState(false);
  const [waypointName, setWaypointName] = useState("");
  const [waypointIcon, setWaypointIcon] = useState<WaypointIcon>("diamond");
  const [waypointColor, setWaypointColor] = useState("#ffb52e");
  const [waypointSaving, setWaypointSaving] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<number | null>(null);
  const [waypointLatDigits, setWaypointLatDigits] = useState("");
  const [waypointLonDigits, setWaypointLonDigits] = useState("");
  const [waypointCoordError, setWaypointCoordError] = useState("");
  const [routeMode, setRouteMode] = useState(false);
  const routeModeRef = useRef(false);
  const officialAreaDrawModeRef = useRef(false);
  const officialAreaDraftPointsRef = useRef<OfficialAreaPoint[]>([]);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const routePointsRef = useRef<RoutePoint[]>([]);
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [routesPanelOpen, setRoutesPanelOpen] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routeDescription, setRouteDescription] = useState("");
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);
  const [activeRoute, setActiveRoute] = useState<SavedRoute | null>(null);
  const [activeRouteIndex, setActiveRouteIndex] = useState<number | null>(null);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureStart, setMeasureStart] = useState<{ lat: number; lon: number } | null>(null);
  const [measureResult, setMeasureResult] = useState<{ km: number; nm: number } | null>(null);
  const [mapSettingsOpen, setMapSettingsOpen] = useState(false);
  const [xteLimitNm, setXteLimitNm] = useState(0.25);
  const [speedDampingPct, setSpeedDampingPct] = useState(65);
  const [gpsRawSpeedKnots, setGpsRawSpeedKnots] = useState<number | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<MapWaypoint | null>(null);
  const [freeNavigationActive, setFreeNavigationActive] = useState(false);
  const [navigationSpeedKnots, setNavigationSpeedKnots] = useState<number | null>(null);
  const [navigationDistanceNm, setNavigationDistanceNm] = useState<number | null>(null);
  const [navigationEtaMinutes, setNavigationEtaMinutes] = useState<number | null>(null);
  const [navigationXteNm, setNavigationXteNm] = useState<number | null>(null);
  const [gpsHeadingDegrees, setGpsHeadingDegrees] = useState<number | null>(null);
  const [mapOrientationMode, setMapOrientationMode] = useState<MapOrientationMode>("north");
  const [orientationMenuOpen, setOrientationMenuOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("ais-mobile-active");
    try {
      const savedXte = Number(window.localStorage.getItem("painel-map-xte-nm"));
      const savedDamping = Number(window.localStorage.getItem("painel-map-speed-damping"));
      const savedOrientation = String(window.localStorage.getItem("painel-map-orientation") || "");
      if (Number.isFinite(savedXte) && savedXte >= 0.05 && savedXte <= 5) setXteLimitNm(savedXte);
      if (Number.isFinite(savedDamping) && savedDamping >= 0 && savedDamping <= 95) setSpeedDampingPct(savedDamping);
      if (["heading","course","north","south"].includes(savedOrientation)) setMapOrientationMode(savedOrientation as MapOrientationMode);

      const savedNavigationRaw = window.localStorage.getItem(NAVIGATION_STORAGE_KEY);
      if (savedNavigationRaw) {
        const savedNavigation = JSON.parse(savedNavigationRaw);
        const rawStart = savedNavigation?.start;
        const start = rawStart && Number.isFinite(Number(rawStart.lat)) && Number.isFinite(Number(rawStart.lon))
          ? { lat: Number(rawStart.lat), lon: Number(rawStart.lon) }
          : null;
        const trail = Array.isArray(savedNavigation?.trail)
          ? savedNavigation.trail
              .map((point: any) => ({ lat: Number(point?.lat), lon: Number(point?.lon) }))
              .filter((point: { lat: number; lon: number }) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
              .slice(-500)
          : [];

        navigationStartRef.current = start;
        navigationTrailRef.current = trail;

        const savedNavOrientation = String(savedNavigation?.orientation || "");
        const savedNavXte = Number(savedNavigation?.xteLimitNm);
        const savedNavDamping = Number(savedNavigation?.speedDampingPct);
        if (["heading","course","north","south"].includes(savedNavOrientation)) setMapOrientationMode(savedNavOrientation as MapOrientationMode);
        if (Number.isFinite(savedNavXte) && savedNavXte >= 0.05 && savedNavXte <= 5) setXteLimitNm(savedNavXte);
        if (Number.isFinite(savedNavDamping) && savedNavDamping >= 0 && savedNavDamping <= 95) setSpeedDampingPct(savedNavDamping);

        if (savedNavigation?.mode === "free" && savedNavigation?.active) {
          freeNavigationActiveRef.current = true;
          setFreeNavigationActive(true);
          setStatusMessage("Navegação livre retomada. Gravando rastro e atualizando GPS...");
        } else {
          const rawTarget = savedNavigation?.target;
          const latitude = Number(rawTarget?.latitude);
          const longitude = Number(rawTarget?.longitude);
          if (rawTarget && Number.isFinite(latitude) && Number.isFinite(longitude)) {
            const target: MapWaypoint = {
              id: Number(rawTarget.id) || Date.now(),
              name: String(rawTarget.name || "Waypoint"),
              latitude,
              longitude,
              icon: (["circle","diamond","triangle","cross","star"].includes(String(rawTarget.icon)) ? rawTarget.icon : "diamond") as WaypointIcon,
              color: String(rawTarget.color || "#ffb52e"),
              createdAt: String(rawTarget.createdAt || new Date().toISOString()),
              updatedAt: String(rawTarget.updatedAt || new Date().toISOString()),
            };
            navigationTargetRef.current = target;
            setNavigationTarget(target);
            setStatusMessage(`Navegação retomada para ${target.name}. Aguardando/atualizando GPS...`);
          }
        }
      }
    } catch {}
    return () => document.body.classList.remove("ais-mobile-active");
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("painel-map-xte-nm", String(xteLimitNm));
      window.localStorage.setItem("painel-map-speed-damping", String(speedDampingPct));
      window.localStorage.setItem("painel-map-orientation", mapOrientationMode);
    } catch {}
  }, [xteLimitNm, speedDampingPct, mapOrientationMode]);

  useEffect(() => {
    navigationTargetRef.current = navigationTarget;
  }, [navigationTarget]);

  useEffect(() => {
    freeNavigationActiveRef.current = freeNavigationActive;
  }, [freeNavigationActive]);

  useEffect(() => {
    const persistBeforeBackground = () => {
      if (navigationTargetRef.current || freeNavigationActiveRef.current) persistActiveNavigation(true);
    };
    const persistOnVisibility = () => {
      if (document.visibilityState === "hidden") persistBeforeBackground();
    };
    window.addEventListener("pagehide", persistBeforeBackground);
    document.addEventListener("visibilitychange", persistOnVisibility);
    return () => {
      window.removeEventListener("pagehide", persistBeforeBackground);
      document.removeEventListener("visibilitychange", persistOnVisibility);
    };
  }, []);

  useEffect(() => {
    const image = new Image();
    let active = true;

    const refreshOwnVesselStyle = (ready: boolean) => {
      if (!active) return;
      navBoatImageReadyRef.current = ready;
      const feature = gpsFeatureRef.current;
      if (!feature) return;
      feature.setStyle(
        gpsPositionStyle(
          Boolean(navigationTargetRef.current || freeNavigationActiveRef.current),
          stableGpsHeadingRef.current ?? 0,
          navBoatImageReadyRef.current,
        ),
      );
    };

    image.onload = () => refreshOwnVesselStyle(true);
    image.onerror = () => refreshOwnVesselStyle(false);
    image.src = NAV_BOAT_SRC;

    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, []);

  useEffect(() => {
    // V138: remove apenas caches/configurações antigas do AIS. Dados de usuário ficam no servidor.
    try {
      [
        "painel-marinesia-cooldown-until",
        "painel-marinesia-area-cache-v1",
        "painel-ais-name-cache",
        "painel-ais-position-cache",
      ].forEach((key) => {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      });
    } catch {}
  }, []);

  useEffect(() => { searchModeRef.current = searchMode; }, [searchMode]);
  useEffect(() => { areaRadiusRef.current = 50; }, []);
  useEffect(() => {
    measureModeRef.current = measureMode;
    if (!measureMode) {
      measureStartRef.current = null;
      setMeasureStart(null);
    }
  }, [measureMode]);
  const [tracked, setTracked] = useState<Vessel | null>(null);
  const [showEmptyHint, setShowEmptyHint] = useState(false);
  const [status, setStatus] = useState<AisStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Digite o nome do barco para localizar");
  const [credits, setCredits] = useState<number | null>(null);
  const [creditUnitPrice, setCreditUnitPrice] = useState(1);
  const [aisPricing, setAisPricing] = useState({ locateCredits: 2, updateCredits: 1, areaCredits: 10 });
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [center, setCenter] = useState({ lat: fallbackLat, lon: fallbackLon });
  const [devicePosition, setDevicePosition] = useState<{ lat: number; lon: number } | null>(null);
  const [zoom, setZoom] = useState(10);
  const [baseMode, setBaseMode] = useState<BaseMode>("dhn");
  const [dhnCharts, setDhnCharts] = useState<DhnChart[]>([]);
  const [dhnAuto, setDhnAuto] = useState(true);
  const [selectedDhnChart, setSelectedDhnChart] = useState("");
  const [dhnOpacity, setDhnOpacity] = useState(0.92);
  const [dhnPanelOpen, setDhnPanelOpen] = useState(false);
  const [dhnLoadMessage, setDhnLoadMessage] = useState("Carregando carta náutica automática...");
  const [savedVessels, setSavedVessels] = useState<SavedVessel[]>([]);
  const [historyItems, setHistoryItems] = useState<AisHistoryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  // V160: embarcações AIS voltam a marcadores vetoriais leves.
  // O único SVG de barco mantido no mapa é o do MEU BARCO/GPS.
  function vesselStyleBucket(currentZoom: number) {
    if (currentZoom >= 16) return 6;
    if (currentZoom >= 14) return 5;
    if (currentZoom >= 12) return 4;
    if (currentZoom >= 10) return 3;
    if (currentZoom >= 9) return 2;
    if (currentZoom >= 8) return 1;
    return 0;
  }

  function vesselHeading(vessel: Vessel) {
    const heading = Number(vessel.heading);
    if (Number.isFinite(heading) && heading >= 0 && heading < 511) return heading;
    const cog = Number(vessel.cog);
    return Number.isFinite(cog) && cog >= 0 ? cog : 0;
  }

  function buildVesselStyle(vessel: Vessel, currentZoom: number) {
    const angle = vesselHeading(vessel);
    const source = String(vessel.dataSource || "").toLowerCase();
    const markerColor = source.includes("marinesia")
      ? "#24c98c"
      : source.includes("vesselapi") || source.includes("free")
        ? "#2f8cff"
        : source.includes("kpler")
          ? "#2f8cff"
          : "#d8aa3f";
    const radius = currentZoom >= 14 ? 11 : currentZoom >= 11 ? 9 : 7;

    return new Style({
      image: new RegularShape({
        points: 3,
        radius,
        angle: 0,
        rotation: (angle * Math.PI) / 180,
        rotateWithView: true,
        fill: new Fill({ color: markerColor }),
        stroke: new Stroke({ color: "#05252b", width: 1.8 }),
      }),
      text: currentZoom >= 11
        ? new Text({
            text: (vessel.name || vessel.mmsi).slice(0, 26),
            offsetY: radius + 10,
            font: "800 10px system-ui",
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
    const directKey = vesselRegistryKey(vessel);
    if (directKey && mapVesselRegistryRef.current.has(directKey)) return directKey;

    // Fallback apenas quando a fonte mudou a chave principal (ex.: chegou MMSI depois do IMO).
    for (const [key, existing] of mapVesselRegistryRef.current.entries()) {
      if (sameRegistryVessel(existing, vessel)) return key;
    }
    return directKey;
  }

  function vesselStyleSignature(vessel: Vessel) {
    return [
      String(vessel.name || vessel.mmsi || "").slice(0, 26),
      String(vessel.dataSource || "").toLowerCase(),
      String(vessel.vesselType || "").toLowerCase(),
    ].join("|");
  }

  function syncVesselFeature(key: string, vessel: Vessel, previousKey?: string | null) {
    const source = vesselSourceRef.current;
    if (!source) return;

    let feature: Feature | undefined;

    if (previousKey && previousKey !== key) {
      const previousFeature = vesselFeatureRegistryRef.current.get(previousKey);
      const existingTarget = vesselFeatureRegistryRef.current.get(key);

      if (previousFeature && existingTarget && previousFeature !== existingTarget) {
        source.removeFeature(previousFeature);
        vesselFeatureRegistryRef.current.delete(previousKey);
        feature = existingTarget;
      } else if (previousFeature) {
        vesselFeatureRegistryRef.current.delete(previousKey);
        vesselFeatureRegistryRef.current.set(key, previousFeature);
        feature = previousFeature;
      }
    }

    feature = feature || vesselFeatureRegistryRef.current.get(key);
    if (!feature) {
      feature = new Feature({ geometry: new Point(fromLonLat([vessel.lon, vessel.lat])) });
      vesselFeatureRegistryRef.current.set(key, feature);
      source.addFeature(feature);
    } else {
      const geometry = feature.getGeometry();
      if (geometry instanceof Point) {
        const next = fromLonLat([vessel.lon, vessel.lat]);
        const current = geometry.getCoordinates();
        if (current[0] !== next[0] || current[1] !== next[1]) geometry.setCoordinates(next);
      }
    }

    // Metadados podem mudar sem exigir novo desenho.
    feature.set("vessel", vessel, true);

    const currentZoom = mapRef.current?.getView().getZoom() || 10;
    const styleBucket = vesselStyleBucket(currentZoom);
    const styleSignature = vesselStyleSignature(vessel);
    if (
      feature.get("_aisStyleSignature") !== styleSignature
      || feature.get("_aisStyleBucket") !== styleBucket
    ) {
      feature.setStyle(buildVesselStyle(vessel, currentZoom));
      feature.set("_aisStyleSignature", styleSignature, true);
      feature.set("_aisStyleBucket", styleBucket, true);
      feature.set("_aisHeading", vesselHeading(vessel), true);
    } else {
      const nextHeading = vesselHeading(vessel);
      const previousHeading = Number(feature.get("_aisHeading"));
      if (!Number.isFinite(previousHeading) || Math.abs(previousHeading - nextHeading) >= 0.5) {
        const assigned = feature.getStyle();
        if (assigned instanceof Style) {
          const image = assigned.getImage();
          if (image instanceof IconStyle || image instanceof RegularShape) {
            image.setRotation((nextHeading * Math.PI) / 180);
            feature.set("_aisHeading", nextHeading, true);
            feature.changed();
          }
        }
      }
    }
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
      const previousKey = foundKey;

      // Se o barco ganhou MMSI depois, muda para a chave mais forte sem duplicar.
      const strongestKey = vesselRegistryKey(merged);
      if (strongestKey && strongestKey !== targetKey) {
        mapVesselRegistryRef.current.delete(targetKey);
        targetKey = strongestKey;
      }
      mapVesselRegistryRef.current.set(targetKey, merged);
      syncVesselFeature(targetKey, merged, previousKey);
      accepted.push(merged);

      const selected = trackedRef.current;
      if (selected && sameRegistryVessel(selected, merged)) {
        trackedRef.current = merged;
        setTracked(merged);
      }
    });

    return accepted;
  }

  function dedupeVessels(vessels: Vessel[]) {
    const unique: Vessel[] = [];
    const byMmsi = new Map<string, number>();
    const byImo = new Map<string, number>();
    const byNameOnly = new Map<string, number>();

    vessels.forEach((vessel) => {
      const ids = normalizedVesselIds(vessel);
      let index: number | undefined;

      if (ids.mmsi) index = byMmsi.get(ids.mmsi);
      if (index == null && ids.imo && ids.imo !== "0") index = byImo.get(ids.imo);
      if (index == null && !ids.mmsi && (!ids.imo || ids.imo === "0") && ids.name) index = byNameOnly.get(ids.name);

      if (index == null) {
        index = unique.length;
        unique.push(vessel);
      } else if (vesselDataTime(vessel) >= vesselDataTime(unique[index])) {
        unique[index] = vessel;
      }

      const chosen = normalizedVesselIds(unique[index]);
      if (chosen.mmsi) byMmsi.set(chosen.mmsi, index);
      if (chosen.imo && chosen.imo !== "0") byImo.set(chosen.imo, index);
      if (!chosen.mmsi && (!chosen.imo || chosen.imo === "0") && chosen.name) byNameOnly.set(chosen.name, index);
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
      setFreeMapVesselCount(uniqueRows.length);
      setFreeMapStatus("ready");
      drawFreeMapVessels(uniqueRows);
      if (uniqueRows.length) setShowEmptyHint(false);
    } catch {
      if (seq === freeLayerRequestRef.current.seq) setFreeMapStatus("error");
    }
  }

  async function loadMarinesiaFreeLayerSilently() {
    const map = mapRef.current;
    if (!map) return;
    const mapCenter = toLonLat(map.getView().getCenter() || fromLonLat([fallbackLon, fallbackLat]));
    const lat = mapCenter[1];
    const lon = mapCenter[0];

    try {
      const response = await aisFetch(
        `/api/ais?action=area&latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&radius=50&provider=marinesia`
      );
      const data: any = await response.json().catch(() => ({}));
      if (!response.ok) return;

      const receivedAt = Date.now();
      const rows: Vessel[] = (Array.isArray(data?.vessels) ? data.vessels : []).map((raw: any) => ({
        mmsi: String(raw?.mmsi || ""),
        imo: String(raw?.imo || ""),
        name: String(raw?.name || raw?.mmsi || raw?.imo || "Embarcação"),
        lat: Number(raw?.lat),
        lon: Number(raw?.lon),
        sog: raw?.sog == null ? null : Number(raw.sog),
        cog: raw?.cog == null ? null : Number(raw.cog),
        heading: raw?.heading == null ? null : Number(raw.heading),
        vesselType: String(raw?.vesselType || raw?.shipType || ""),
        navStatusText: String(raw?.navStatusText || ""),
        dataSource: String(raw?.dataSource || data?.provider || "Marinesia AIS"),
        positionReceived: String(raw?.positionReceived || raw?.updateTime || data?.updatedAt || ""),
        updateTime: String(raw?.updateTime || raw?.positionReceived || data?.updatedAt || ""),
        receivedAt: Number(raw?.receivedAt) || receivedAt,
      })).filter((vessel: Vessel) =>
        Number.isFinite(vessel.lat) && Number.isFinite(vessel.lon) && Boolean(vessel.mmsi || vessel.imo)
      );

      if (rows.length) {
        upsertMapVessels(dedupeVessels(rows));
        setShowEmptyHint(false);
      }
    } catch {
      // Atualização FREE automática é silenciosa para não interromper a navegação.
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

  function buildWaypointStyle(item: MapWaypoint, currentZoom: number) {
    return new Style({
      text: new Text({
        text: waypointSymbol(item.icon),
        font: item.icon === "star" ? "900 20px system-ui" : "900 18px system-ui",
        fill: new Fill({ color: item.color || "#ffb52e" }),
        stroke: new Stroke({ color: "#062027", width: 3 }),
        offsetY: 0,
      }),
      image: new CircleStyle({
        radius: 2,
        fill: new Fill({ color: item.color || "#ffb52e" }),
      }),
      zIndex: 60,
    });
  }

  function renderWaypoints(items: MapWaypoint[]) {
    const source = waypointSourceRef.current;
    if (!source) return;
    source.clear();
    items.forEach((item) => {
      if (!Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude))) return;
      const feature = new Feature({
        geometry: new Point(fromLonLat([Number(item.longitude), Number(item.latitude)])),
      });
      feature.set("waypoint", item);
      feature.setStyle(buildWaypointStyle(item, mapRef.current?.getView().getZoom() || 10));
      source.addFeature(feature);
    });
  }

  function officialWaypointTypeLabel(type: OfficialWaypointType) {
    if (type === "skull") return "CAVEIRA · PERIGO";
    if (type === "rock") return "PEDRA / LAJE";
    if (type === "reef") return "PARCEL";
    return "NAUFRÁGIO";
  }

  function officialWaypointIcon(type: OfficialWaypointType) {
    // V199: SVG inline evita 404/cache/CSP e garante o símbolo junto do nome.
    return officialWaypointIconDataUri(type);
  }

  function buildOfficialWaypointStyle(item: OfficialWaypoint, currentZoom: number) {
    // V199: o ícone é um pin 96x96 com margem interna; a ponta do pin fica exatamente na coordenada.
    const iconPx = currentZoom < 8 ? 36 : currentZoom < 11 ? 46 : 56;
    const scale = iconPx / 96;
    const showName = currentZoom >= 9;
    return new Style({
      image: new IconStyle({
        src: officialWaypointIcon(item.waypointType),
        anchor: [0.5, 0.91],
        anchorXUnits: "fraction",
        anchorYUnits: "fraction",
        scale,
        opacity: 1,
      }),
      text: showName ? new Text({
        text: item.name,
        offsetY: 17,
        font: "900 10px system-ui, sans-serif",
        fill: new Fill({ color: "#f7ffff" }),
        stroke: new Stroke({ color: "#04181e", width: 4 }),
        padding: [3, 4, 3, 4],
      }) : undefined,
      zIndex: 88,
    });
  }

  function renderOfficialWaypoints(items: OfficialWaypoint[]) {
    const source = officialWaypointSourceRef.current;
    if (!source) return;
    source.clear();
    const zoomNow = mapRef.current?.getView().getZoom() || 10;
    items.filter((item) => item.visible !== false).forEach((item) => {
      if (!Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude))) return;
      const feature = new Feature({ geometry: new Point(fromLonLat([Number(item.longitude), Number(item.latitude)])) });
      feature.set("officialWaypoint", item);
      feature.setStyle(buildOfficialWaypointStyle(item, zoomNow));
      source.addFeature(feature);
    });
  }


  function officialAreaHex(color: OfficialAreaColor) {
    if (color === "red") return "#ef5350";
    if (color === "yellow") return "#f0c84b";
    return "#2bd47d";
  }

  function officialAreaRgba(color: OfficialAreaColor, transparency: number) {
    const alpha = Math.max(0, Math.min(1, 1 - Number(transparency || 0) / 100));
    const rgb = color === "red" ? "239,83,80" : color === "yellow" ? "240,200,75" : "43,212,125";
    return `rgba(${rgb},${alpha.toFixed(3)})`;
  }

  function buildOfficialAreaStyle(item: OfficialArea) {
    const color = officialAreaHex(item.color);
    return new Style({
      stroke: new Stroke({ color, width: 3 }),
      fill: new Fill({ color: officialAreaRgba(item.color, item.transparency) }),
      text: new Text({
        text: item.name,
        font: "900 11px system-ui, sans-serif",
        fill: new Fill({ color: "#ffffff" }),
        stroke: new Stroke({ color: "#061b21", width: 4 }),
        padding: [3, 5, 3, 5],
      }),
      zIndex: 36,
    });
  }

  function renderOfficialAreas(items: OfficialArea[]) {
    const source = officialAreaSourceRef.current;
    if (!source) return;
    source.clear();
    items.filter((item) => item.visible !== false && Array.isArray(item.points) && item.points.length >= 3).forEach((item) => {
      const coords = item.points.map((point) => fromLonLat([Number(point.longitude), Number(point.latitude)]));
      if (coords.some((coord) => !Number.isFinite(coord[0]) || !Number.isFinite(coord[1]))) return;
      const ring = [...coords, coords[0]];
      const feature = new Feature({ geometry: new Polygon([ring]) });
      feature.set("officialArea", item);
      feature.setStyle(buildOfficialAreaStyle(item));
      source.addFeature(feature);

      // V200: os vértices permanecem visíveis como pequenos waypoints, no estilo de plotter marítimo.
      coords.forEach((coord) => {
        const vertex = new Feature({ geometry: new Point(coord) });
        vertex.setStyle(new Style({
          image: new CircleStyle({
            radius: 4.5,
            fill: new Fill({ color: "#f8ffff" }),
            stroke: new Stroke({ color: officialAreaHex(item.color), width: 2.5 }),
          }),
          zIndex: 37,
        }));
        source.addFeature(vertex);
      });
    });
  }

  function setOfficialAreaDraft(points: OfficialAreaPoint[]) {
    const normalized = points.slice(0, 120);
    officialAreaDraftPointsRef.current = normalized;
    setOfficialAreaDraftPoints(normalized);
  }

  function drawOfficialAreaDraft(points: OfficialAreaPoint[], color: OfficialAreaColor, transparency: number) {
    const source = officialAreaDraftSourceRef.current;
    if (!source) return;
    source.clear();
    const coords = points.map((point) => fromLonLat([point.longitude, point.latitude]));
    if (coords.length >= 2) {
      const line = new Feature({ geometry: new LineString(coords) });
      line.setStyle(new Style({ stroke: new Stroke({ color: officialAreaHex(color), width: 3, lineDash: [8, 5] }), zIndex: 97 }));
      source.addFeature(line);
    }
    if (coords.length >= 3) {
      const polygon = new Feature({ geometry: new Polygon([[...coords, coords[0]]]) });
      polygon.setStyle(new Style({
        stroke: new Stroke({ color: officialAreaHex(color), width: 3 }),
        fill: new Fill({ color: officialAreaRgba(color, transparency) }),
        zIndex: 96,
      }));
      source.addFeature(polygon);
    }
    coords.forEach((coord, index) => {
      const vertex = new Feature({ geometry: new Point(coord) });
      vertex.setStyle(new Style({
        image: new CircleStyle({ radius: 9, fill: new Fill({ color: "#071f27" }), stroke: new Stroke({ color: officialAreaHex(color), width: 3 }) }),
        text: new Text({ text: String(index + 1), font: "900 9px system-ui", fill: new Fill({ color: "#ffffff" }) }),
        zIndex: 99,
      }));
      source.addFeature(vertex);
    });
  }

  function toggleOfficialAreaDrawMode() {
    if (!canManageOfficialAreas) return;
    const next = !officialAreaDrawModeRef.current;
    officialAreaDrawModeRef.current = next;
    setOfficialAreaDrawMode(next);
    setSelectedOfficialWaypoint(null);
    setWaypointPanelOpen(false);
    routeModeRef.current = false;
    setRouteMode(false);
    setRoutesPanelOpen(false);
    measureModeRef.current = false;
    setMeasureMode(false);
    if (next) {
      setOfficialAreaDraft([]);
      setOfficialAreaName(`RESERVA ${String(officialAreas.length + 1).padStart(2, "0")}`);
      setStatusMessage("ÁREA ADMIN ativa — toque/clique no mapa para criar os vértices.");
    } else {
      setOfficialAreaDraft([]);
      setStatusMessage("Desenho de área administrativa encerrado.");
    }
  }

  function cancelOfficialAreaDraw() {
    officialAreaDrawModeRef.current = false;
    setOfficialAreaDrawMode(false);
    setOfficialAreaDraft([]);
    setOfficialAreaName("");
    setStatusMessage("Criação da área cancelada.");
  }

  async function saveOfficialArea() {
    if (!canManageOfficialAreas || officialAreaSaving) return;
    const points = officialAreaDraftPointsRef.current;
    if (points.length < 3) {
      setStatusMessage("A área precisa de pelo menos 3 pontos antes de fechar.");
      return;
    }
    setOfficialAreaSaving(true);
    try {
      const response = await aisFetch("/api/official-areas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: officialAreaName.trim() || `RESERVA ${String(officialAreas.length + 1).padStart(2, "0")}`,
          color: officialAreaColor,
          transparency: officialAreaTransparency,
          points,
          visible: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data?.error || "Não foi possível salvar a área.");
        return;
      }
      await loadOfficialAreas();
      officialAreaDrawModeRef.current = false;
      setOfficialAreaDrawMode(false);
      setOfficialAreaDraft([]);
      setOfficialAreaName("");
      setStatusMessage(`Área ${data?.area?.name || "oficial"} fechada e salva no AIS ✓`);
    } catch {
      setStatusMessage("Falha de conexão ao salvar a área oficial.");
    } finally {
      setOfficialAreaSaving(false);
    }
  }

  function drawRouteDraft(points: RoutePoint[]) {
    const source = routeSourceRef.current; if (!source) return; source.clear();
    if (points.length >= 2) {
      const line = new Feature({ geometry: new LineString(points.map(p => fromLonLat([p.longitude, p.latitude]))) });
      line.setStyle(new Style({ stroke: new Stroke({ color: "#ffb52e", width: 3 }) })); source.addFeature(line);
    }
    points.forEach((p, i) => {
      const f = new Feature({ geometry: new Point(fromLonLat([p.longitude,p.latitude])) });
      f.set("routePointIndex", i);
      f.setStyle(new Style({ image:new CircleStyle({radius:12,fill:new Fill({color:"#071f27"}),stroke:new Stroke({color:"#ffb52e",width:3})}), text:new Text({text:String(i+1),fill:new Fill({color:"#fff"}),font:"bold 12px sans-serif"}) }));
      source.addFeature(f);
    });
  }
  function setDraftRoute(points: RoutePoint[]) { const normalized=points.map((p,i)=>({...p,order:i+1})); routePointsRef.current=normalized; setRoutePoints(normalized); drawRouteDraft(normalized); }
  function toggleRouteMode(){ const next=!routeModeRef.current; routeModeRef.current=next; setRouteMode(next); setRoutesPanelOpen(next); setWaypointPanelOpen(false); setMapSettingsOpen(false); if(next) setStatusMessage("ROTA ativa — toque/clique no mapa para adicionar pontos."); }
  function undoRoutePoint(){ setDraftRoute(routePointsRef.current.slice(0,-1)); }
  function cancelRoute(){ routeModeRef.current=false;setRouteMode(false);setDraftRoute([]);setEditingRouteId(null);setRouteName("");setRouteDescription("");setActiveRoute(null);setActiveRouteIndex(null);setStatusMessage("Criação de rota cancelada."); }
  async function loadRoutes(){ try{const r=await aisFetch("/api/routes");const d=await r.json();if(r.ok)setRoutes(Array.isArray(d?.routes)?d.routes:[]);}catch{} }
  async function saveRoute(){ if(!routePointsRef.current.length){setStatusMessage("Adicione pontos à rota antes de salvar.");return;} const name=routeName.trim()||window.prompt("Nome da rota:", editingRouteId?routeName:"Nova rota")?.trim(); if(!name)return; let description=routeDescription; if(!editingRouteId&&!description) description=window.prompt("Descrição (opcional):","")||""; const r=await aisFetch("/api/routes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:editingRouteId,name,description,waypoints:routePointsRef.current})});const d=await r.json().catch(()=>({}));if(!r.ok){setStatusMessage(d?.error||"Não foi possível salvar a rota.");return;} setRouteName(name);setRouteDescription(description);setEditingRouteId(d.id||editingRouteId);await loadRoutes();setStatusMessage(`Rota ${name} salva ✓`); }
  function openRoute(r:SavedRoute){ setEditingRouteId(r.id);setRouteName(r.name);setRouteDescription(r.description||"");setDraftRoute(r.waypoints||[]);setRoutesPanelOpen(true);routeModeRef.current=false;setRouteMode(false);setActiveRoute(null);setActiveRouteIndex(null); if(r.waypoints?.length){const ext=new LineString(r.waypoints.map(p=>fromLonLat([p.longitude,p.latitude]))).getExtent();mapRef.current?.getView().fit(ext,{padding:[90,80,170,80],maxZoom:13,duration:300});} }
  async function deleteRoute(id:number){ if(!window.confirm("Excluir esta rota?"))return;await aisFetch(`/api/routes?id=${id}`,{method:"DELETE"});if(editingRouteId===id)cancelRoute();await loadRoutes(); }
  async function duplicateRoute(r:SavedRoute){ const resp=await aisFetch("/api/routes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:`${r.name} - cópia`,description:r.description,waypoints:r.waypoints})});if(resp.ok)await loadRoutes(); }
  function navigateRoutePoint(index:number, route:SavedRoute|null=activeRoute){ const pts=route?.waypoints||routePointsRef.current;if(!pts[index])return; const p=pts[index]; const wp:MapWaypoint={id:-(index+1),name:`${route?.name||routeName||"Rota"} · Ponto ${index+1}`,latitude:p.latitude,longitude:p.longitude,icon:"diamond",color:"#ffb52e",createdAt:"",updatedAt:""}; if(route){setActiveRoute(route);setActiveRouteIndex(index);} startWaypointNavigation(wp); }
  function startFullRoute(r?:SavedRoute){ const route=r||routes.find(x=>x.id===editingRouteId)||null;if(!route||!route.waypoints.length){setStatusMessage("Abra uma rota salva para navegar.");return;} setActiveRoute(route);setActiveRouteIndex(0);navigateRoutePoint(0,route); }
  async function loadWaypoints() {
    try {
      const response = await aisFetch("/api/waypoints");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setWaypoints(Array.isArray(data?.waypoints) ? data.waypoints : []);
    } catch {
      // Waypoints não bloqueiam o AIS.
    }
  }

  async function loadOfficialWaypoints() {
    try {
      const response = await aisFetch("/api/official-waypoints");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setOfficialWaypoints(Array.isArray(data?.waypoints) ? data.waypoints : []);
    } catch {
      // Waypoints oficiais nunca devem bloquear o funcionamento do AIS.
    }
  }


  async function loadOfficialAreas() {
    try {
      const response = await aisFetch("/api/official-areas");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setOfficialAreas(Array.isArray(data?.areas) ? data.areas : []);
      setCanManageOfficialAreas(data?.canManage === true);
    } catch {
      // Áreas oficiais são complementares e nunca bloqueiam o AIS.
    }
  }

  // V202: barcos escolhidos pelo Super Admin ficam persistidos no servidor e
  // aparecem para todos os usuários sem executar busca regional no cliente.
  async function loadAdminFreeVessels() {
    try {
      const response = await aisFetch("/api/admin-free-vessels");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const receivedAt = Date.now();
      const vessels: Vessel[] = (Array.isArray(data?.vessels) ? data.vessels : []).map((raw: any) => ({
        mmsi: String(raw?.mmsi || ""),
        imo: String(raw?.imo || ""),
        name: String(raw?.name || raw?.mmsi || raw?.imo || "Embarcação FREE"),
        lat: Number(raw?.latitude),
        lon: Number(raw?.longitude),
        sog: raw?.sog == null ? null : Number(raw.sog),
        cog: raw?.cog == null ? null : Number(raw.cog),
        heading: raw?.heading == null ? null : Number(raw.heading),
        callsign: String(raw?.callsign || ""),
        vesselType: String(raw?.vesselType || "Embarcação AIS"),
        navStatusText: String(raw?.navStatus || ""),
        dataSource: String(raw?.dataSource || "AIS FREE · ADMIN GLOBAL"),
        positionReceived: String(raw?.positionReceived || raw?.updatedAt || ""),
        updateTime: String(raw?.positionReceived || raw?.updatedAt || ""),
        receivedAt: raw?.positionReceived ? (Date.parse(String(raw.positionReceived)) || receivedAt) : receivedAt,
      })).filter((vessel: Vessel) => Number.isFinite(vessel.lat) && Number.isFinite(vessel.lon) && Boolean(vessel.mmsi || vessel.imo || vessel.name));
      if (vessels.length) upsertMapVessels(dedupeVessels(vessels));
    } catch {
      // Lista global FREE é complementar e nunca bloqueia o AIS principal.
    }
  }

  function waypointEditorCoords() {
    if (!waypointLatDigits && !waypointLonDigits) return mapProbe;
    const lat = coordinateDigitsToDecimal(waypointLatDigits, true);
    const lon = coordinateDigitsToDecimal(waypointLonDigits, false);
    if (lat == null || lon == null) return null;
    return { lat, lon };
  }

  function drawProbePoint(lat: number, lon: number, depthMeters?: number | null) {
    const source = probeSourceRef.current;
    source?.clear();
    const marker = new Feature({ geometry: new Point(fromLonLat([lon, lat])) });
    marker.setStyle(new Style({
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: "#2bd4aa" }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
      text: Number.isFinite(Number(depthMeters)) && Number(depthMeters) > 0
        ? new Text({
            text: `~${Math.round(Number(depthMeters))} m`,
            offsetY: -19,
            font: "900 12px system-ui, sans-serif",
            fill: new Fill({ color: "#003b63" }),
            stroke: new Stroke({ color: "rgba(255,255,255,.98)", width: 4 }),
            padding: [2, 4, 2, 4],
          })
        : undefined,
    }));
    source?.addFeature(marker);
  }

  async function saveWaypoint() {
    const editedCoords = waypointEditorCoords();
    if (!editedCoords) {
      setWaypointCoordError("Confira latitude e longitude.");
      setStatusMessage("Confira a latitude e longitude do waypoint.");
      return;
    }
    setWaypointCoordError("");
    if (waypointSaving) return;
    setWaypointSaving(true);
    setMapProbe(editedCoords);
    drawProbePoint(editedCoords.lat, editedCoords.lon);
    try {
      const response = await aisFetch("/api/waypoints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selectedWaypointId,
          name: waypointName.trim() || `WP ${String(waypoints.length + 1).padStart(2, "0")}`,
          latitude: editedCoords.lat,
          longitude: editedCoords.lon,
          icon: waypointIcon,
          color: waypointColor,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data?.error || "Não foi possível salvar o waypoint.");
        return;
      }
      await loadWaypoints();
      setSelectedWaypointId(data?.waypoint?.id ?? null);
      setWaypointName(data?.waypoint?.name || waypointName);
      setStatusMessage(`${data?.waypoint?.name || "Waypoint"} salvo no mapa ✓`);
      setWaypointPanelOpen(false);
    } catch {
      setStatusMessage("Falha de conexão ao salvar waypoint.");
    } finally {
      setWaypointSaving(false);
    }
  }

  async function deleteWaypoint(id: number) {
    try {
      const response = await aisFetch(`/api/waypoints?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) return;
      setWaypoints((current) => current.filter((item) => item.id !== id));
      setSelectedWaypointId(null);
      setWaypointName("");
      setWaypointPanelOpen(false);
      setStatusMessage("Waypoint removido.");
    } catch {
      setStatusMessage("Não foi possível remover o waypoint.");
    }
  }

  function clearMeasurement() {
    measureSourceRef.current?.clear();
    measureStartRef.current = null;
    setMeasureStart(null);
    setMeasureResult(null);
  }

  function toggleMeasureMode() {
    setMeasureMode((current) => {
      const next = !current;
      if (!next) clearMeasurement();
      else {
        clearMeasurement();
        setStatusMessage("Régua ativa: toque no ponto inicial e depois no ponto final.");
      }
      return next;
    });
  }

  function addMeasurePoint(lat: number, lon: number, color: string) {
    const source = measureSourceRef.current;
    if (!source) return;
    const feature = new Feature({ geometry: new Point(fromLonLat([lon, lat])) });
    feature.setStyle(new Style({
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
    }));
    source.addFeature(feature);
  }

  function pickMeasurePoint(lat: number, lon: number) {
    const point = { lat, lon };
    const first = measureStartRef.current;

    if (!first) {
      measureSourceRef.current?.clear();
      measureStartRef.current = point;
      setMeasureStart(point);
      setMeasureResult(null);
      addMeasurePoint(lat, lon, "#2bd4aa");
      setStatusMessage(`Régua: início ${formatCoordOperational(lat, true)} · ${formatCoordOperational(lon, false)}. Toque no ponto final.`);
      return;
    }

    const km = haversineKm(first, point);
    const nm = km / 1.852;
    const source = measureSourceRef.current;
    source?.clear();

    const start3857 = fromLonLat([first.lon, first.lat]);
    const end3857 = fromLonLat([lon, lat]);
    const line = new Feature({ geometry: new LineString([start3857, end3857]) });
    line.setStyle(new Style({
      stroke: new Stroke({ color: "#ffdc72", width: 2.5, lineDash: [8, 6] }),
    }));
    source?.addFeature(line);
    addMeasurePoint(first.lat, first.lon, "#2bd4aa");
    addMeasurePoint(lat, lon, "#ffdc72");

    const midLat = (first.lat + lat) / 2;
    const midLon = (first.lon + lon) / 2;
    const label = new Feature({ geometry: new Point(fromLonLat([midLon, midLat])) });
    label.setStyle(new Style({
      text: new Text({
        text: `${nm.toFixed(2)} MN`,
        font: "900 11px system-ui",
        fill: new Fill({ color: "#fff0a6" }),
        stroke: new Stroke({ color: "#092027", width: 4 }),
        offsetY: -10,
      }),
    }));
    source?.addFeature(label);

    setMeasureResult({ km, nm });
    measureStartRef.current = null;
    setMeasureStart(null);
    setStatusMessage(`Distância medida: ${nm.toFixed(2)} milhas náuticas`);
  }

  function drawGpsPositionMarker(coords: { lat: number; lon: number }, headingDegrees?: number | null) {
    const source = positionSourceRef.current;
    if (!source) return;

    const navigating = Boolean(navigationTargetRef.current || freeNavigationActiveRef.current);

    // V197: o MEU BARCO nunca é um overlay preso ao centro da tela.
    // Durante a navegação ele continua sendo um Feature georreferenciado na posição GPS real.
    const target = fromLonLat([coords.lon, coords.lat]);
    const resolvedHeading = Number.isFinite(Number(headingDegrees))
      ? Number(headingDegrees)
      : (stableGpsHeadingRef.current ?? 0);

    let feature = gpsFeatureRef.current;
    if (!feature || !source.getFeatures().includes(feature)) {
      source.clear();
      feature = new Feature({ geometry: new Point(target) });
      gpsFeatureRef.current = feature;
      source.addFeature(feature);
    }

    feature.setStyle(
      gpsPositionStyle(
        navigating,
        resolvedHeading,
        navBoatImageReadyRef.current,
      ),
    );

    const geometry = feature.getGeometry();
    if (!(geometry instanceof Point)) return;

    const current = geometry.getCoordinates();
    if (gpsAnimationFrameRef.current != null) {
      window.cancelAnimationFrame(gpsAnimationFrameRef.current);
      gpsAnimationFrameRef.current = null;
    }

    const jumpMeters = Math.hypot(target[0] - current[0], target[1] - current[1]);
    if (!Number.isFinite(jumpMeters) || jumpMeters > 1500 || jumpMeters < 0.2) {
      geometry.setCoordinates(target);
      return;
    }

    const startedAt = performance.now();
    const durationMs = 650;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      geometry.setCoordinates([
        current[0] + (target[0] - current[0]) * eased,
        current[1] + (target[1] - current[1]) * eased,
      ]);

      if (progress < 1) {
        gpsAnimationFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        gpsAnimationFrameRef.current = null;
      }
    };

    gpsAnimationFrameRef.current = window.requestAnimationFrame(animate);
  }

  function followNavigationPosition(coords: { lat: number; lon: number }) {
    if (!navigationTargetRef.current && !freeNavigationActiveRef.current) return;
    if (!navigationFollowEnabledRef.current) return;
    const view = mapRef.current?.getView();
    if (!view) return;

    const now = Date.now();
    const previous = navigationFollowCoordRef.current;
    const movedKm = previous ? haversineKm(previous, coords) : Number.POSITIVE_INFINITY;

    // V161: no animation frame. Reposition the map at most once per second
    // and only when GPS movement is meaningful, keeping the SVG fixed on screen.
    if (previous && now - navigationFollowAtRef.current < 1000 && movedKm < 0.004) return;

    navigationFollowAtRef.current = now;
    navigationFollowCoordRef.current = { ...coords };
    view.setCenter(fromLonLat([coords.lon, coords.lat]));
  }

  function persistActiveNavigation(force = false) {
    const target = navigationTargetRef.current;
    const freeActive = freeNavigationActiveRef.current;
    if (!target && !freeActive) return;
    const now = Date.now();
    if (!force && now - navigationPersistAtRef.current < 4000) return;
    navigationPersistAtRef.current = now;

    try {
      window.localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({
        version: 154,
        active: true,
        mode: target ? "waypoint" : "free",
        target,
        start: navigationStartRef.current,
        trail: navigationTrailRef.current.slice(-500),
        xteLimitNm,
        speedDampingPct,
        orientation: mapOrientationMode,
        savedAt: new Date(now).toISOString(),
      }));
    } catch {}
  }

  function stopWaypointNavigation() {
    navigationSourceRef.current?.clear();
    navigationTargetRef.current = null;
    navigationStartRef.current = null;
    navigationTrailRef.current = [];
    smoothedSpeedRef.current = null;
    setNavigationTarget(null);
    setNavigationSpeedKnots(null);
    setNavigationDistanceNm(null);
    setNavigationEtaMinutes(null);
    setNavigationXteNm(null);
    navigationPersistAtRef.current = 0;
    navigationFollowAtRef.current = 0;
    navigationFollowCoordRef.current = null;
    navigationFollowEnabledRef.current = true;
    try { window.localStorage.removeItem(NAVIGATION_STORAGE_KEY); } catch {}
    if (devicePosition) drawGpsPositionMarker(devicePosition, gpsHeadingDegrees);
    setStatusMessage("Navegação para waypoint encerrada.");
  }

  function stopFreeNavigation() {
    navigationSourceRef.current?.clear();
    freeNavigationActiveRef.current = false;
    navigationStartRef.current = null;
    navigationTrailRef.current = [];
    smoothedSpeedRef.current = null;
    setFreeNavigationActive(false);
    setNavigationSpeedKnots(null);
    setNavigationDistanceNm(null);
    setNavigationEtaMinutes(null);
    setNavigationXteNm(null);
    navigationPersistAtRef.current = 0;
    navigationFollowAtRef.current = 0;
    navigationFollowCoordRef.current = null;
    navigationFollowEnabledRef.current = true;
    try { window.localStorage.removeItem(NAVIGATION_STORAGE_KEY); } catch {}
    if (devicePosition) drawGpsPositionMarker(devicePosition, gpsHeadingDegrees);
    setStatusMessage("Navegação livre encerrada.");
  }

  function startFreeNavigation() {
    if (freeNavigationActiveRef.current) {
      stopFreeNavigation();
      return;
    }

    if (navigationTargetRef.current) stopWaypointNavigation();

    navigationSourceRef.current?.clear();
    navigationTargetRef.current = null;
    freeNavigationActiveRef.current = true;
    navigationStartRef.current = devicePosition ? { ...devicePosition } : null;
    navigationTrailRef.current = devicePosition ? [{ ...devicePosition }] : [];
    smoothedSpeedRef.current = null;
    setNavigationTarget(null);
    setFreeNavigationActive(true);
    setNavigationDistanceNm(null);
    setNavigationEtaMinutes(null);
    setNavigationXteNm(null);
    navigationPersistAtRef.current = 0;
    navigationFollowAtRef.current = 0;
    navigationFollowCoordRef.current = null;
    navigationFollowEnabledRef.current = true;
    persistActiveNavigation(true);

    if (devicePosition) {
      drawGpsPositionMarker(devicePosition, gpsHeadingDegrees);
      followNavigationPosition(devicePosition);
      setStatusMessage("Navegação livre ativa — gravando rastro.");
    } else {
      locateDevice();
      setStatusMessage("Navegação livre iniciada. Aguardando GPS do celular...");
    }
  }

  function startWaypointNavigation(item?: MapWaypoint | null) {
    const coords = item ? { lat: Number(item.latitude), lon: Number(item.longitude) } : waypointEditorCoords();
    const saved = item || (selectedWaypointId != null ? waypoints.find((wp) => wp.id === selectedWaypointId) || null : null);
    if (!coords || !saved) {
      setWaypointCoordError("Salve ou selecione um waypoint válido antes de navegar.");
      return;
    }

    const target: MapWaypoint = {
      ...saved,
      name: waypointName.trim() || saved.name || "Waypoint",
      latitude: coords.lat,
      longitude: coords.lon,
      icon: waypointIcon,
      color: waypointColor,
    };

    clearMeasurement();
    setMeasureMode(false);
    setMapSettingsOpen(false);
    setWaypointPanelOpen(false);
    freeNavigationActiveRef.current = false;
    setFreeNavigationActive(false);
    setNavigationTarget(target);
    navigationTargetRef.current = target;
    navigationStartRef.current = devicePosition ? { ...devicePosition } : null;
    navigationTrailRef.current = devicePosition ? [{ ...devicePosition }] : [];
    smoothedSpeedRef.current = null;
    navigationPersistAtRef.current = 0;
    navigationFollowAtRef.current = 0;
    navigationFollowCoordRef.current = null;
    navigationFollowEnabledRef.current = true;
    persistActiveNavigation(true);

    if (devicePosition) {
      drawGpsPositionMarker(devicePosition, gpsHeadingDegrees);
      followNavigationPosition(devicePosition);
      const line = new LineString([
        fromLonLat([devicePosition.lon, devicePosition.lat]),
        fromLonLat([coords.lon, coords.lat]),
      ]);
      mapRef.current?.getView().fit(line.getExtent(), {
        padding: [90, 80, 150, 80],
        maxZoom: 12,
        duration: 350,
      });
      setStatusMessage(`Navegando para ${target.name} pelo GPS.`);
    } else {
      locateDevice();
      setStatusMessage(`Navegação para ${target.name} iniciada. Aguardando GPS do celular...`);
    }
  }

  function openSavedWaypoint(item: MapWaypoint) {
    const lat = Number(item.latitude);
    const lon = Number(item.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    setMapProbe({ lat, lon });
    setSelectedWaypointId(item.id);
    setWaypointName(item.name);
    setWaypointIcon(item.icon);
    setWaypointColor(item.color);
    setWaypointLatDigits(coordDigitsFromDecimal(lat, true));
    setWaypointLonDigits(coordDigitsFromDecimal(lon, false));
    setWaypointCoordError("");
    centerOn(lat, lon, 12);
    setMobilePanel(null);
    setWaypointPanelOpen(true);
    setStatusMessage(`${item.name} · ${formatCoordOperational(lat, true)} · ${formatCoordOperational(lon, false)}`);
  }

  function openWaypointPanel() {
    setWaypointPanelOpen((open) => !open);
    setMapSettingsOpen(false);
    if (!waypointPanelOpen && selectedWaypointId == null) {
      setWaypointName("");
      if (mapProbe) {
        setWaypointLatDigits(coordDigitsFromDecimal(mapProbe.lat, true));
        setWaypointLonDigits(coordDigitsFromDecimal(mapProbe.lon, false));
      }
      setWaypointCoordError("");
    }
  }

  function inspectMapPoint(lat: number, lon: number) {
    drawProbePoint(lat, lon);
    setWaypointLatDigits(coordDigitsFromDecimal(lat, true));
    setWaypointLonDigits(coordDigitsFromDecimal(lon, false));
    setWaypointCoordError("");

    // V196: além das curvas automáticas, um toque no mar consulta a profundidade
    // aproximada GEBCO do ponto e escreve o valor junto ao marcador.
    const requestId = ++probeDepthRequestRef.current;
    void fetch(`/api/bathymetry?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { cache: "force-cache" })
      .then(async (response) => response.ok ? await response.json() : null)
      .then((data) => {
        if (requestId !== probeDepthRequestRef.current) return;
        const depth = Number(data?.depthMeters);
        if (!Number.isFinite(depth) || depth <= 0) return;
        drawProbePoint(lat, lon, depth);
        setStatusMessage(`Profundidade aproximada ~${Math.round(depth)} m · GEBCO · ${formatCoordOperational(lat, true)} · ${formatCoordOperational(lon, false)}`);
      })
      .catch(() => null);

    // O círculo de 50 km continua aparecendo somente durante uma busca de área.
    areaSourceRef.current?.clear();
    setAreaCenter({ lat, lon });
    setMapProbe({ lat, lon });
    setSelectedWaypointId(null);
  }

  function clearMapProbe() {
    probeDepthRequestRef.current += 1;
    probeSourceRef.current?.clear();
    setMapProbe(null);
  }

  function chooseAreaCenterFromMap() {
    const map = mapRef.current;
    if (!map) return;
    const [lon, lat] = toLonLat(map.getView().getCenter() || fromLonLat([fallbackLon, fallbackLat]));
    inspectMapPoint(lat, lon);
    setStatusMessage(`Centro da área definido · ${formatCoordOperational(lat, true)} · ${formatCoordOperational(lon, false)}`);
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
    areaSourceRef.current?.clear();
    centerOn(lat, lon, 8);
    inspectMapPoint(lat, lon);
    setStatusMessage(`Centro manual definido · ${formatCoordOperational(lat, true)} · ${formatCoordOperational(lon, false)}`);
    if (closeMobilePanel) setMobilePanel(null);
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

    const toRows = (data: any, freeFallback = false): Vessel[] => {
      const areaQueryReceivedAt = Date.now();
      return (Array.isArray(data?.vessels) ? data.vessels : []).map((raw: any) => ({
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
        receivedAt: Number(raw?.receivedAt) || areaQueryReceivedAt,
      })).filter((v: Vessel) => Number.isFinite(v.lat) && Number.isFinite(v.lon));
    };

    try {
      // V166: AIS FREE usa primeiro o cache AISStream alimentado pelo worker Railway.
      // O próprio /api/ais-map cuida dos fallbacks gratuitos sem alterar o fluxo Premium.
      let response = isFree
        ? await aisFetch(`/api/ais-map?lat=${encodeURIComponent(selected.lat)}&lon=${encodeURIComponent(selected.lon)}&refresh=${forceFreeRefresh ? "1" : "0"}`)
        : await aisFetch(
            `/api/ais?action=area&latitude=${encodeURIComponent(selected.lat)}&longitude=${encodeURIComponent(selected.lon)}&radius=${areaRadius}&provider=${encodeURIComponent(provider)}`
          );
      let data: any = await response.json().catch(() => ({}));

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

      if (!isFree && rows.length) {
        void aisFetch("/api/ais-library", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save-area", vessels: rows }),
        }).then(() => loadAisLibrary()).catch(() => null);
      }

      centerOn(selected.lat, selected.lon, 8);
      setStatus("ready");
      setStatusMessage(
        rows.length
          ? (isFree
              ? `${rows.length} barco(s) AIS Free · ${String(data?.provider || data?.source || "Marinesia/fallback")} · 0 créditos`
              : `${rows.length} barco(s) Premium em 50 km · ${Number(data?.creditCost ?? aisPricing.areaCredits)} crédito(s) · data/hora registrada`)
          : ""
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
      const response = await aisFetch("/api/ais-premium?action=status");
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 503) {
          setStatus("config");
          setStatusMessage(data?.error || "Configure DATADOCKED_API_KEY na Vercel.");
        }
        return;
      }
      if (Number.isFinite(Number(data?.credits))) setCredits(Number(data.credits));
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
      const response = await aisFetch("/api/ais-library", { cache: "no-store" });
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
      const response = await aisFetch("/api/ais-library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "save",
          vessel: source,
          folder: folder || (() => {
            const dataSource = String((source as Vessel)?.dataSource || "").toLowerCase();
            if (dataSource.includes("marinesia")) return "marinesia";
            if (dataSource.includes("shipfinder")) return "shipfinder";
            return "premium";
          })(),
        }),
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
      const response = await aisFetch(`/api/ais-library?type=saved&key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!response.ok) return;
      setSavedVessels((current) => current.filter((item) => item.vesselKey !== key));
      setStatusMessage("Barco removido da pasta de salvos.");
    } catch {
      setStatusMessage("Não foi possível remover o barco salvo.");
    }
  }

  async function removeAreaSavedVessel(key: string) {
    try {
      const response = await aisFetch(`/api/ais-library?type=saved&key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!response.ok) return;
      setSavedVessels((current) => current.filter((item) => item.vesselKey !== key));
      setStatusMessage("Barco removido da lista de resultados 50 km.");
    } catch {
      setStatusMessage("Não foi possível remover o barco da lista 50 km.");
    }
  }

  async function clearAreaSavedVessels() {
    if (!areaSavedVessels.length) return;
    if (!window.confirm(`Excluir todos os ${areaSavedVessels.length} barcos da lista temporária de 50 km?`)) return;
    try {
      const response = await aisFetch(`/api/ais-library?type=saved-folder&folder=area50`, { method: "DELETE" });
      if (!response.ok) {
        setStatusMessage("Não foi possível limpar a lista 50 km.");
        return;
      }
      setSavedVessels((current) => current.filter((item) => item.folder !== "area50"));
      setStatusMessage("Lista temporária de 50 km limpa com sucesso.");
    } catch {
      setStatusMessage("Falha ao limpar a lista temporária de 50 km.");
    }
  }

  async function saveAreaResultToRegular(item: SavedVessel) {
    const vessel = savedItemToVessel(item);
    if (!vessel) {
      setStatusMessage("Este resultado não possui posição válida para ser salvo.");
      return;
    }
    await saveVessel(vessel, "premium");
  }

  async function clearAisHistory() {
    if (!window.confirm("Limpar todo o histórico de consultas AIS desta conta?")) return;
    try {
      const response = await aisFetch("/api/ais-library?type=history", { method: "DELETE" });
      if (!response.ok) return;
      setHistoryItems([]);
      setStatusMessage("Histórico AIS limpo.");
    } catch {
      setStatusMessage("Não foi possível limpar o histórico AIS.");
    }
  }

  async function recordHistory(vessel: Vessel, creditsUsed = 0) {
    try {
      await aisFetch("/api/ais-library", {
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

  // V140: toda embarcação salva com posição válida volta automaticamente para o mapa.
  // Inclui barcos salvos individualmente e resultados persistidos da busca Premium de 50 km.
  function savedItemToVessel(item: SavedVessel): Vessel | null {
    const lat = Number(item.lastLatitude);
    const lon = Number(item.lastLongitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const folder = String(item.folder || "premium").toLowerCase();
    const fallbackSource = folder === "area50"
      ? "Premium 50 km"
      : folder === "marinesia"
        ? "Marinesia AIS"
        : folder === "shipfinder"
          ? "Vessel Free"
          : "Premium";
    const receivedAt = new Date(
      item.lastPositionReceived || item.lastUpdateTime || item.updatedAt || item.savedAt || Date.now(),
    ).getTime();

    return {
      mmsi: item.mmsi || "",
      imo: item.imo || "",
      name: item.name,
      lat,
      lon,
      sog: item.lastSog,
      cog: item.lastCog,
      heading: item.lastHeading,
      destination: item.lastDestination || "",
      callsign: item.callsign || "",
      vesselType: item.vesselType || "",
      navStatusText: item.lastStatus || "",
      dataSource: item.lastDataSource || fallbackSource,
      positionReceived: item.lastPositionReceived || "",
      updateTime: item.lastUpdateTime || "",
      receivedAt: Number.isFinite(receivedAt) ? receivedAt : Date.now(),
    };
  }

  function openSavedVessel(item: SavedVessel) {
    if (item.lastLatitude == null || item.lastLongitude == null) {
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

  function areaSavedRemainingLabel(item: SavedVessel) {
    const stamp = new Date(item.updatedAt || item.savedAt || "").getTime();
    if (!Number.isFinite(stamp)) return `Apaga automaticamente em ${AREA_RESULTS_TTL_HOURS}h`;
    const remaining = Math.max(0, AREA_RESULTS_TTL_MS - (Date.now() - stamp));
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.max(0, Math.ceil((remaining % 3600000) / 60000));
    if (!remaining) return "Expira em instantes";
    if (hours <= 0) return `Apaga em ${minutes} min`;
    return `Apaga em ${hours}h ${String(minutes).padStart(2, "0")}min`;
  }

  function openHistoryItem(item: AisHistoryItem) {
    showVesselFromLibrary(historyItemToVessel(item), `${item.name} aberto do histórico — 0 créditos`);
  }

  function vesselFromApi(raw: any, match: VesselMatch): Vessel | null {
    const lat = Number(raw?.lat);
    const lon = Number(raw?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      mmsi: String(raw?.mmsi || match.mmsi || ""),
      imo: String(raw?.imo || match.imo || ""),
      name: raw?.name || match.name,
      lat,
      lon,
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
  }

  async function applyLocatedVessel(vessel: Vessel, creditsUsed: number, folder: string, message: string) {
    trackedRef.current = vessel;
    setTracked(vessel);
    drawVessel(vessel);
    centerOn(vessel.lat, vessel.lon, 12);
    window.setTimeout(() => anchorCardForVessel(vessel), 240);
    setLastFetch(Date.now());
    setStatus("ready");
    setStatusMessage(message);
    await Promise.all([
      recordHistory(vessel, creditsUsed),
      saveVessel(vessel, folder, true),
    ]);
  }

  async function searchFreeVessel() {
    const query = freeSearchQuery.trim();
    setFreeSearchError("");
    setFreeSearchResults([]);

    if (query.length < 2) {
      setFreeSearchError("Digite nome, MMSI ou IMO.");
      return;
    }
    if (freeSearchInFlightRef.current) return;

    freeSearchInFlightRef.current = true;
    setFreeSearchLoading(true);
    try {
      const response = await aisFetch(`/api/ais-free?action=search&q=${encodeURIComponent(query)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFreeSearchError(
          response.status === 401
            ? "Sua sessão expirou. Entre novamente."
            : response.status === 504
              ? "A busca FREE demorou para responder. Tente novamente."
              : (data?.error || "Busca FREE indisponível.")
        );
        return;
      }

      const rows = (Array.isArray(data?.items) ? data.items : []) as VesselMatch[];
      setFreeSearchResults(rows);
      setStatus(rows.length ? "ready" : "idle");
      if (rows.length) {
        setStatusMessage(`${rows.length} resultado(s) na busca FREE`);
      } else {
        setStatusMessage("Nenhuma embarcação encontrada na busca FREE.");
        setFreeSearchError("Nenhuma embarcação encontrada na fonte gratuita.");
      }
    } catch {
      setFreeSearchError("Falha de rede na busca FREE.");
    } finally {
      freeSearchInFlightRef.current = false;
      setFreeSearchLoading(false);
    }
  }

  async function openFreeResult(match: VesselMatch, force = false) {
    if (freeSearchInFlightRef.current) return;
    const id = vesselIdentifier(match);
    const provider = match.freeProvider || "auto";
    freeSearchInFlightRef.current = true;
    setFreeSearchError("");
    setFreeSearchLoading(true);

    try {
      const response = await aisFetch(
        `/api/ais-free?action=position&id=${encodeURIComponent(id)}&name=${encodeURIComponent(match.name || "")}&provider=${encodeURIComponent(provider)}`
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFreeSearchError(
          response.status === 504
            ? "A posição FREE demorou para responder."
            : (data?.error || "Posição FREE indisponível.")
        );
        return;
      }

      const vessel = vesselFromApi(data?.vessel, match);
      if (!vessel) {
        setFreeSearchError("A fonte FREE retornou dados sem posição válida.");
        return;
      }

      const resolvedProvider = String(data?.provider || provider).toLowerCase();
      await applyLocatedVessel(
        vessel,
        0,
        resolvedProvider === "shipfinder" ? "shipfinder" : "marinesia",
        `${vessel.name || "Embarcação"} localizada no AIS FREE · ${resolvedProvider === "shipfinder" ? "ShipFinder" : "APRS.fi"}`,
      );
      setFreeSearchResults([]);
      if (!force) setFreeSearchQuery(vessel.name || freeSearchQuery);
    } catch {
      setFreeSearchError("Falha de rede ao consultar a posição FREE.");
    } finally {
      freeSearchInFlightRef.current = false;
      setFreeSearchLoading(false);
    }
  }

  async function searchPremiumVessel() {
    const query = premiumSearchQuery.trim();
    setPremiumSearchError("");
    setPremiumSearchResults([]);

    if (query.length < 2) {
      setPremiumSearchError("Digite nome, MMSI ou IMO.");
      return;
    }
    if (premiumSearchInFlightRef.current) return;

    premiumSearchInFlightRef.current = true;
    setPremiumSearchLoading(true);
    try {
      const response = await aisFetch(`/api/ais-premium?action=search&q=${encodeURIComponent(query)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 402) {
          if (Number.isFinite(Number(data?.balance))) setCredits(Number(data.balance));
          setPremiumSearchError(`Saldo insuficiente para a busca Premium. Necessário: ${Number(data?.required || aisPricing.locateCredits)} crédito(s).`);
        } else {
          setPremiumSearchError(
            response.status === 401
              ? "Sua sessão expirou. Entre novamente."
              : response.status === 504
                ? "A busca PREMIUM demorou para responder. Tente novamente."
                : (data?.error || "Busca PREMIUM indisponível.")
          );
        }
        return;
      }

      const rows = (Array.isArray(data?.items) ? data.items : []) as VesselMatch[];
      setPremiumSearchResults(rows);
      setStatus(rows.length ? "ready" : "idle");
      if (rows.length) {
        setStatusMessage(`${rows.length} resultado(s) na busca PREMIUM`);
      } else {
        setStatusMessage("Nenhuma embarcação encontrada na busca PREMIUM.");
        setPremiumSearchError("Nenhuma embarcação encontrada na fonte Premium.");
      }
      await refreshCredits();
    } catch {
      setPremiumSearchError("Falha de rede na busca PREMIUM.");
    } finally {
      premiumSearchInFlightRef.current = false;
      setPremiumSearchLoading(false);
    }
  }

  async function openPremiumResult(match: VesselMatch, force = false) {
    if (premiumSearchInFlightRef.current) return;
    const id = vesselIdentifier(match);
    const operationCredits = force ? aisPricing.updateCredits : aisPricing.locateCredits;
    const operationBrl = formatBrl(operationCredits * creditUnitPrice);
    const confirmed = window.confirm(
      `ATENÇÃO — AIS PREMIUM\n\n${force ? "Atualizar" : "Consultar"} ${match.name || id}?\n\nCUSTO: ${operationCredits} crédito(s) (${operationBrl})\n\nOs créditos serão descontados somente se uma posição válida for retornada.`
    );
    if (!confirmed) return;

    premiumSearchInFlightRef.current = true;
    setPremiumSearchError("");
    setPremiumSearchLoading(true);

    try {
      const response = await aisFetch(
        `/api/ais-premium?action=position&id=${encodeURIComponent(id)}&name=${encodeURIComponent(match.name || "")}&update=${force ? "1" : "0"}`
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 402) {
          if (Number.isFinite(Number(data?.balance))) setCredits(Number(data.balance));
          setPremiumSearchError(`Saldo insuficiente. Necessário: ${Number(data?.required || operationCredits)} crédito(s).`);
        } else {
          setPremiumSearchError(
            response.status === 504
              ? "A consulta PREMIUM demorou para responder."
              : (data?.error || "Posição PREMIUM indisponível.")
          );
        }
        return;
      }

      const vessel = vesselFromApi(data?.vessel, match);
      if (!vessel) {
        setPremiumSearchError("A fonte PREMIUM retornou dados sem posição válida.");
        return;
      }

      const charged = Number(data?.creditCost) || 0;
      if (Number.isFinite(Number(data?.balance))) setCredits(Number(data.balance));
      await applyLocatedVessel(
        vessel,
        charged,
        "premium",
        `${vessel.name || "Embarcação"} localizada no AIS PREMIUM`,
      );
      setPremiumSearchResults([]);
      if (!force) setPremiumSearchQuery(vessel.name || premiumSearchQuery);
      await refreshCredits();
    } catch {
      setPremiumSearchError("Falha de rede ao consultar a posição PREMIUM.");
    } finally {
      premiumSearchInFlightRef.current = false;
      setPremiumSearchLoading(false);
    }
  }

  async function refreshSavedVessel(item: SavedVessel) {
    const match = savedItemToMatch(item);
    if ((item.folder || "premium") === "premium" || item.folder === "area50") {
      await openPremiumResult(match, true);
      return;
    }

    match.freeProvider = item.folder === "shipfinder" ? "shipfinder" : "aprsfi";
    await openFreeResult(match, true);
  }

  async function refreshTrackedVessel() {
    if (!tracked) return;
    const match: VesselMatch = {
      name: tracked.name || "",
      mmsi: tracked.mmsi,
      imo: tracked.imo || "",
      country: "",
      countryIso: "",
      shipType: tracked.vesselType || "",
      typeSpecific: tracked.vesselType || "",
      callsign: tracked.callsign || "",
    };
    const source = String(tracked.dataSource || "").toLowerCase();
    if (source.includes("data docked") || source.includes("premium 50 km")) {
      await openPremiumResult(match, true);
      return;
    }
    match.freeProvider = source.includes("shipfinder") ? "shipfinder" : "aprsfi";
    await openFreeResult(match, true);
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
        const nativeHeading = Number(position.coords.heading);
        const resolvedHeading = Number.isFinite(nativeHeading) && nativeHeading >= 0 && nativeHeading < 360
          ? nativeHeading
          : stableGpsHeadingRef.current;

        if (resolvedHeading != null && Number.isFinite(resolvedHeading)) {
          stableGpsHeadingRef.current = resolvedHeading;
          setGpsHeadingDegrees(resolvedHeading);
        }

        setDevicePosition(coords);
        if (!useAsArea && (navigationTargetRef.current || freeNavigationActiveRef.current)) {
          navigationFollowEnabledRef.current = true;
          navigationFollowAtRef.current = 0;
          navigationFollowCoordRef.current = null;
        }
        centerOn(coords.lat, coords.lon, useAsArea ? 8 : 12, false);
        if (useAsArea) {
          setAreaCenter(coords);
          areaSourceRef.current?.clear();
          inspectMapPoint(coords.lat, coords.lon);
          setStatusMessage(`GPS definido como centro da busca 50 km · ${formatCoordOperational(coords.lat, true)} · ${formatCoordOperational(coords.lon, false)}`);
        } else {
          drawGpsPositionMarker(coords, resolvedHeading);
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
    streetLayerRef.current?.setVisible(true);
    dhnLayerRef.current?.setVisible(mode === "dhn" && Boolean(selectedDhnChart));
  }

  function toggleFishingChart() {
    if (baseMode === "dhn") {
      setMapMode("map");
      setDhnPanelOpen(false);
      return;
    }
    setMapMode("dhn");
    setDhnPanelOpen(true);
    if (!selectedDhnChart && dhnCharts.length) {
      const automatic = chooseDhnChart(dhnCharts, center.lon, center.lat, zoom) || dhnCharts[0];
      if (automatic) setSelectedDhnChart(automatic.number);
    }
  }

  useEffect(() => {
    if (!hostRef.current) return;
    const street = new TileLayer({ visible: true, source: new OSM() });
    const bathymetry = new TileLayer({
      visible: true,
      opacity: 0.18,
      source: new TileWMS({
        url: "/api/gebco-map",
        params: {
          LAYERS: "GEBCO_Latest_2",
          TILED: true,
          FORMAT: "image/png",
          TRANSPARENT: true,
          VERSION: "1.1.1",
        },
        serverType: "mapserver",
        crossOrigin: "anonymous",
        transition: 0,
      }),
    });
    bathymetry.setZIndex(3);

    const bathymetryContours = new VectorTileLayer({
      visible: true,
      opacity: 1,
      minZoom: 5,
      maxZoom: 18,
      declutter: false,
      renderBuffer: 160,
      updateWhileAnimating: false,
      updateWhileInteracting: false,
      source: new VectorTileSource({
        format: new GeoJSON({ dataProjection: "EPSG:4326" }),
        url: "/api/bathymetry-contours/{z}/{x}/{y}",
        minZoom: 5,
        maxZoom: 14,
        wrapX: false,
        transition: 0,
        attributions: "Batimetria: AWS Open Data / Mapzen Terrain Tiles (ETOPO1 no oceano)",
      }),
      style: bathymetryContourStyle,
    });
    bathymetryContours.setZIndex(18);

    const dhn = new TileLayer({
      visible: false,
      opacity: 0.92,
      source: new XYZ({
        url: `${DHN_TILE_BASE}/__nenhuma__/{z}/{x}/{y}.png`,
        attributions: "Carta Raster DHN/CHM",
        crossOrigin: "anonymous",
      }),
    });
    const vesselSource = new VectorSource();
    const vesselLayer = new VectorLayer({
      source: vesselSource,
      declutter: true,
      renderBuffer: 36,
      updateWhileAnimating: false,
      updateWhileInteracting: false,
    });
    const freeVesselSource = new VectorSource();
    const freeVesselLayer = new VectorLayer({
      source: freeVesselSource,
      declutter: true,
      renderBuffer: 36,
      updateWhileAnimating: false,
      updateWhileInteracting: false,
    });
    const areaSource = new VectorSource();
    const areaLayer = new VectorLayer({ source: areaSource });
    const positionSource = new VectorSource();
    const positionLayer = new VectorLayer({
      source: positionSource,
      style: new Style({
        image: new CircleStyle({ radius: 8, fill: new Fill({ color: "#2a92ff" }), stroke: new Stroke({ color: "#ffffff", width: 3 }) }),
      }),
    });
    const probeSource = new VectorSource();
    const probeLayer = new VectorLayer({ source: probeSource });
    const waypointSource = new VectorSource();
    const waypointLayer = new VectorLayer({ source: waypointSource, declutter: true });
    const officialWaypointSource = new VectorSource();
    const officialWaypointLayer = new VectorLayer({ source: officialWaypointSource, declutter: false, renderBuffer: 140 });
    const officialAreaSource = new VectorSource();
    const officialAreaLayer = new VectorLayer({ source: officialAreaSource, declutter: false, renderBuffer: 160 });
    const officialAreaDraftSource = new VectorSource();
    const officialAreaDraftLayer = new VectorLayer({ source: officialAreaDraftSource, declutter: false, renderBuffer: 160 });
    const routeSource = new VectorSource();
    const routeLayer = new VectorLayer({ source: routeSource, declutter: true });
    const measureSource = new VectorSource();
    const measureLayer = new VectorLayer({ source: measureSource });
    const navigationSource = new VectorSource();
    const navigationLayer = new VectorLayer({ source: navigationSource });
    const view = new View({ center: fromLonLat([fallbackLon, fallbackLat]), zoom: 10.5, minZoom: 3, maxZoom: 18 });
    street.setZIndex(0);
    dhn.setZIndex(5);
    areaLayer.setZIndex(10);
    freeVesselLayer.setZIndex(20);
    vesselLayer.setZIndex(30);
    positionLayer.setZIndex(70);
    probeLayer.setZIndex(45);
    measureLayer.setZIndex(48);
    navigationLayer.setZIndex(49);
    waypointLayer.setZIndex(50);
    routeLayer.setZIndex(52);
    officialAreaLayer.setZIndex(36);
    officialWaypointLayer.setZIndex(88);
    officialAreaDraftLayer.setZIndex(96);

    const map = new OlMap({
      target: hostRef.current,
      controls: [],
      layers: [street, bathymetry, dhn, bathymetryContours, areaLayer, officialAreaLayer, freeVesselLayer, vesselLayer, positionLayer, probeLayer, measureLayer, navigationLayer, waypointLayer, routeLayer, officialWaypointLayer, officialAreaDraftLayer],
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
    vesselFeatureRegistryRef.current.clear();
    vesselStyleBucketRef.current = vesselStyleBucket(view.getZoom() || 10);
    positionSourceRef.current = positionSource;
    probeSourceRef.current = probeSource;
    waypointSourceRef.current = waypointSource;
    officialWaypointSourceRef.current = officialWaypointSource;
    officialAreaSourceRef.current = officialAreaSource;
    officialAreaDraftSourceRef.current = officialAreaDraftSource;
    routeSourceRef.current = routeSource;
    const routeTranslate = new Translate({ layers:[routeLayer], hitTolerance:18 });
    routeTranslateRef.current=routeTranslate; map.addInteraction(routeTranslate);
    routeTranslate.on("translateend",(event:any)=>{const f=event?.features?.item?.(0);const idx=Number(f?.get?.("routePointIndex"));const g=f?.getGeometry?.();if(!Number.isInteger(idx)||!(g instanceof Point))return;const [lon,lat]=toLonLat(g.getCoordinates());const next=routePointsRef.current.map((p,i)=>i===idx?{...p,latitude:lat,longitude:lon}:p);setDraftRoute(next);});
    measureSourceRef.current = measureSource;
    navigationSourceRef.current = navigationSource;
    areaSourceRef.current = areaSource;
    streetLayerRef.current = street;
    bathymetryLayerRef.current = bathymetry;
    dhnLayerRef.current = dhn;

    const updateCenter = () => {
      const [lon, lat] = toLonLat(view.getCenter() || fromLonLat([fallbackLon, fallbackLat]));
      setCenter({ lat, lon });
      setZoom(Math.round(view.getZoom() || 10));

      const currentZoom = view.getZoom() || 10;
      const styleBucket = vesselStyleBucket(currentZoom);
      if (vesselStyleBucketRef.current !== styleBucket) {
        vesselStyleBucketRef.current = styleBucket;
        vesselSource.getFeatures().forEach((feature) => {
          const vessel = feature.get("vessel") as Vessel | undefined;
          if (!vessel) return;
          feature.setStyle(buildVesselStyle(vessel, currentZoom));
          feature.set("_aisStyleSignature", vesselStyleSignature(vessel), true);
          feature.set("_aisStyleBucket", styleBucket, true);
        });
      }
      officialWaypointSource.getFeatures().forEach((feature) => {
        const item = feature.get("officialWaypoint") as OfficialWaypoint | undefined;
        if (item) feature.setStyle(buildOfficialWaypointStyle(item, currentZoom));
      });
      const selected = trackedRef.current;
      if (selected) anchorCardForVessel(selected);
      scheduleFreeMapLayer(false);
    };
    map.on("moveend", updateCenter);
    const selectMapFeature = (event: any) => {
      // V210: qualquer toque/clique no mapa recolhe as janelas de busca.
      setFreePanelOpen(false);
      setPremiumPanelOpen(false);
      if (officialAreaDrawModeRef.current) {
        const [lon, lat] = toLonLat(event.coordinate);
        const next = [...officialAreaDraftPointsRef.current, { latitude: lat, longitude: lon }];
        setOfficialAreaDraft(next);
        setStatusMessage(`Área Admin · ponto ${next.length} adicionado. ${next.length >= 3 ? "Já pode FECHAR E SALVAR." : "Adicione pelo menos 3 pontos."}`);
        return;
      }
      if (routeModeRef.current) {
        const hit = map.forEachFeatureAtPixel(event.pixel,(feature:any)=>feature.get("routePointIndex") != null ? feature : null,{hitTolerance:14});
        if (hit) return;
        const [lon,lat]=toLonLat(event.coordinate); setDraftRoute([...routePointsRef.current,{order:routePointsRef.current.length+1,latitude:lat,longitude:lon}]); setStatusMessage(`Ponto ${routePointsRef.current.length} adicionado à rota.`); return;
      }
      if (measureModeRef.current) {
        const [lon, lat] = toLonLat(event.coordinate);
        pickMeasurePoint(lat, lon);
        return;
      }

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

      const officialWaypoint = map.forEachFeatureAtPixel(
        event.pixel,
        (feature: any) => (feature.get("officialWaypoint") || null) as OfficialWaypoint | null,
        { hitTolerance: 14 },
      );
      if (officialWaypoint) {
        const lat = Number(officialWaypoint.latitude);
        const lon = Number(officialWaypoint.longitude);
        setSelectedOfficialWaypoint(officialWaypoint);
        setWaypointPanelOpen(false);
        setMapProbe({ lat, lon });
        setStatusMessage(`${officialWaypointTypeLabel(officialWaypoint.waypointType)} · ${officialWaypoint.name} · ${formatCoordOperational(lat, true)} · ${formatCoordOperational(lon, false)}`);
        return;
      }

      const waypoint = map.forEachFeatureAtPixel(
        event.pixel,
        (feature: any) => (feature.get("waypoint") || null) as MapWaypoint | null,
        { hitTolerance: 10 },
      );
      if (waypoint) {
        setSelectedOfficialWaypoint(null);
        const lat = Number(waypoint.latitude);
        const lon = Number(waypoint.longitude);
        setMapProbe({ lat, lon });
        setSelectedWaypointId(waypoint.id);
        setWaypointName(waypoint.name);
        setWaypointIcon(waypoint.icon);
        setWaypointColor(waypoint.color);
        setWaypointPanelOpen(true);
        setStatusMessage(`${waypoint.name} · ${formatCoordOperational(lat, true)} · ${formatCoordOperational(lon, false)}`);
        return;
      }

      const [lon, lat] = toLonLat(event.coordinate);
      setSelectedOfficialWaypoint(null);
      trackedRef.current = null;
      setTracked(null);
      setCardAnchor(null);
      inspectMapPoint(lat, lon);
      setStatusMessage(`Ponto marcado · ${formatCoordOperational(lat, true)} · ${formatCoordOperational(lon, false)}`);
    };
    const pauseNavigationFollowOnDrag = () => {
      if (!navigationTargetRef.current && !freeNavigationActiveRef.current) return;
      navigationFollowEnabledRef.current = false;
    };
    map.on("pointerdrag", pauseNavigationFollowOnDrag);
    map.on("singleclick", selectMapFeature);
    scheduleFreeMapLayer(true);
    const ro = new ResizeObserver(() => map.updateSize());
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      map.un("moveend", updateCenter);
      map.un("pointerdrag", pauseNavigationFollowOnDrag);
      map.un("singleclick", selectMapFeature);
      areaTranslate.un("translateend", handleAreaTranslateEnd);
      map.removeInteraction(areaTranslate);
      if(routeTranslateRef.current) map.removeInteraction(routeTranslateRef.current);
      if (freeLayerTimerRef.current) window.clearTimeout(freeLayerTimerRef.current);
      if (gpsAnimationFrameRef.current != null) window.cancelAnimationFrame(gpsAnimationFrameRef.current);
      gpsAnimationFrameRef.current = null;
      gpsFeatureRef.current = null;
      vesselFeatureRegistryRef.current.clear();
      vesselStyleBucketRef.current = null;
      vesselIconPathCacheRef.current.clear();
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ENABLE_DHN_CHARTS) return;
    let cancelled = false;

    (async () => {
      setDhnLoadMessage("Carregando carta náutica automática...");

      const localPromise = fetch(`${DHN_TILE_BASE}/installed.json`, { cache: "no-store" })
        .then(async (response) => response.ok ? await response.json() : { charts: [] })
        .catch(() => ({ charts: [] }));
      const remotePromise = (async () => {
        try {
          const response = await fetch("/api/dhn/charts", { cache: "no-store" });
          const data = response.ok ? await response.json() : { charts: [] };
          if (Array.isArray(data?.charts) && data.charts.length) return data;

          // Fallback de descoberta: reutiliza o catálogo local e interpreta o
          // GetCapabilities bruto caso o parser do endpoint não encontre camadas.
          const [catalogResponse, capabilitiesResponse] = await Promise.all([
            fetch("/data/dhn/catalog-rj-sp-pr-sc-rs.json", { cache: "force-cache" }),
            fetch("/api/dhn-wms", { cache: "no-store" }),
          ]);
          if (!catalogResponse.ok || !capabilitiesResponse.ok) return { charts: [] };
          const catalogData = await catalogResponse.json();
          const catalog = (Array.isArray(catalogData?.charts) ? catalogData.charts : []) as DhnCatalogEntry[];
          const xml = await capabilitiesResponse.text();
          return { charts: parseDhnCapabilities(xml, catalog) };
        } catch {
          return { charts: [] };
        }
      })();

      const [localData, remoteData] = await Promise.all([localPromise, remotePromise]);
      if (cancelled) return;

      const localCharts = (Array.isArray(localData?.charts) ? localData.charts : [])
        .filter((chart: any) => chart?.number && Array.isArray(chart?.bounds))
        .map((chart: any) => ({ ...chart, source: "local" as const })) as DhnChart[];
      const remoteCharts = (Array.isArray(remoteData?.charts) ? remoteData.charts : [])
        .filter((chart: any) => chart?.number && chart?.layerName && Array.isArray(chart?.bounds))
        .map((chart: any) => ({ ...chart, source: "wms" as const })) as DhnChart[];

      // Se houver tiles locais instalados, eles têm prioridade. O WMS oficial
      // completa automaticamente as áreas sem tile local.
      const merged = new Map<string, DhnChart>();
      for (const chart of remoteCharts) merged.set(chart.number, chart);
      for (const chart of localCharts) merged.set(chart.number, chart);
      const charts = Array.from(merged.values());

      setDhnCharts(charts);
      if (!charts.length) {
        setDhnLoadMessage("Carta DHN temporariamente indisponível; mapa base mantido.");
        return;
      }

      const automatic = chooseDhnChart(charts, center.lon, center.lat, zoom) || charts[0];
      if (automatic) setSelectedDhnChart(automatic.number);
      setDhnLoadMessage(`Carta automática ativa · ${charts.length} cartas disponíveis`);
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!dhnAuto || baseMode !== "dhn" || !dhnCharts.length) return;
    const automatic = chooseDhnChart(dhnCharts, center.lon, center.lat, zoom);
    if (automatic && automatic.number !== selectedDhnChart) setSelectedDhnChart(automatic.number);
  }, [baseMode, center.lat, center.lon, dhnAuto, dhnCharts, selectedDhnChart, zoom]);

  useEffect(() => {
    const layer = dhnLayerRef.current;
    if (!layer) return;

    if (baseMode !== "dhn") {
      layer.setVisible(false);
      return;
    }

    const chart = dhnCharts.find((item) => item.number === selectedDhnChart);
    if (!chart) {
      layer.setVisible(false);
      return;
    }

    if (chart.source === "local") {
      layer.setSource(new XYZ({
        url: `${DHN_TILE_BASE}/${chart.number}/{z}/{x}/{y}.png`,
        attributions: "Carta Raster DHN/CHM",
        crossOrigin: "anonymous",
        transition: 0,
      }));
    } else if (chart.layerName) {
      layer.setSource(new TileWMS({
        // Proxy do próprio app: evita CORS no navegador e mantém a carta
        // funcionando da mesma forma em desktop, Android e iPhone.
        url: "/api/dhn-map",
        params: {
          LAYERS: chart.layerName,
          TILED: true,
          FORMAT: "image/png",
          TRANSPARENT: true,
          VERSION: "1.1.1",
        },
        serverType: "geoserver",
        crossOrigin: "anonymous",
        transition: 0,
      }));
    } else {
      layer.setVisible(false);
      return;
    }

    layer.setOpacity(dhnOpacity);
    layer.setVisible(true);
    setDhnLoadMessage(`Carta ${chart.number} · ${chart.title}`);
  }, [baseMode, dhnCharts, dhnOpacity, selectedDhnChart]);

  useEffect(() => {
    dhnLayerRef.current?.setOpacity(dhnOpacity);
  }, [dhnOpacity]);

  useEffect(() => {
    const refreshFreeSources = () => {
      // V166: uma única rota FREE. AISStream é principal e os demais provedores
      // são fallbacks no servidor; evita chamadas paralelas que causavam HTTP 429.
      void loadFreeMapLayer(true);
    };
    const warmup = window.setTimeout(refreshFreeSources, 1200);
    const timer = window.setInterval(refreshFreeSources, 60_000);
    return () => {
      window.clearTimeout(warmup);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    refreshCredits();
    loadAisLibrary();
    loadWaypoints();
    loadOfficialWaypoints();
    loadOfficialAreas();
    loadAdminFreeVessels();
    loadRoutes();
  }, []);

  useEffect(() => {
    renderWaypoints(waypoints);
  }, [waypoints]);

  useEffect(() => {
    renderOfficialWaypoints(officialWaypoints);
  }, [officialWaypoints]);

  useEffect(() => {
    renderOfficialAreas(officialAreas);
  }, [officialAreas]);

  useEffect(() => {
    drawOfficialAreaDraft(officialAreaDraftPoints, officialAreaColor, officialAreaTransparency);
  }, [officialAreaDraftPoints, officialAreaColor, officialAreaTransparency]);

  useEffect(() => {
    const timer = window.setInterval(() => { void loadOfficialWaypoints(); void loadOfficialAreas(); void loadAdminFreeVessels(); }, 120_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(()=>{ drawRouteDraft(routePoints); },[routePoints]);

  // V140: mantém no mapa todos os barcos persistidos na biblioteca do usuário.
  useEffect(() => {
    const persisted = savedVessels
      .map(savedItemToVessel)
      .filter((vessel): vessel is Vessel => Boolean(vessel));
    if (persisted.length) upsertMapVessels(persisted);
  }, [savedVessels]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    // V170: reaproveita imediatamente a última posição obtida no Dashboard,
    // sem API externa e sem alterar o ícone atual do MEU BARCO.
    try {
      const cached = JSON.parse(localStorage.getItem("painel-bordo-device-position") || "null");
      const lat = Number(cached?.lat);
      const lon = Number(cached?.lon);
      const heading = cached?.heading == null ? Number.NaN : Number(cached.heading);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const coords = { lat, lon };
        const resolvedHeading = Number.isFinite(heading) && heading >= 0 && heading < 360 ? heading : stableGpsHeadingRef.current;
        setDevicePosition(coords);
        drawGpsPositionMarker(coords, resolvedHeading);
        setAreaCenter(coords);
        if (!gpsCenteredRef.current) {
          gpsCenteredRef.current = true;
          centerOn(coords.lat, coords.lon, 11);
        }
      }
    } catch {}

    const mobile = window.matchMedia("(max-width: 900px)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (!mobile) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
        const sampleAt = Number(position.timestamp) || Date.now();
        const nativeSpeed = Number(position.coords.speed);
        const nativeHeading = Number(position.coords.heading);
        const previous = gpsPreviousRef.current;
        const movedKm = previous ? haversineKm(previous, coords) : 0;
        const movingBySpeed = Number.isFinite(nativeSpeed) && nativeSpeed >= 0.35;
        const movingByPosition = Boolean(previous) && movedKm >= 0.004;
        const validNativeHeading = Number.isFinite(nativeHeading) && nativeHeading >= 0 && nativeHeading < 360;
        let resolvedHeading = stableGpsHeadingRef.current;

        if ((movingBySpeed || movingByPosition) && validNativeHeading) {
          resolvedHeading = nativeHeading;
        } else if (movingByPosition && previous) {
          resolvedHeading = bearingDegrees(previous, coords);
        }

        if (resolvedHeading != null && Number.isFinite(resolvedHeading)) {
          stableGpsHeadingRef.current = resolvedHeading;
          setGpsHeadingDegrees(resolvedHeading);
        }

        let rawKnots = Number.isFinite(nativeSpeed) && nativeSpeed >= 0 ? nativeSpeed * 1.943844492 : null;
        if (rawKnots == null && previous && sampleAt > previous.at) {
          const hours = (sampleAt - previous.at) / 3_600_000;
          if (hours > 0) rawKnots = (haversineKm(previous, coords) / 1.852) / hours;
        }
        gpsPreviousRef.current = { ...coords, at: sampleAt };
        if (rawKnots != null && Number.isFinite(rawKnots) && rawKnots < 120) setGpsRawSpeedKnots(rawKnots);
        setDevicePosition(coords);
        drawGpsPositionMarker(coords, resolvedHeading);
        followNavigationPosition(coords);
        if (!gpsCenteredRef.current) {
          gpsCenteredRef.current = true;
          setAreaCenter(coords);
          centerOn(coords.lat, coords.lon, 11);
        }
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!freeNavigationActive || !devicePosition) return;

    if (!navigationStartRef.current) navigationStartRef.current = { ...devicePosition };
    const trail = navigationTrailRef.current;
    const lastTrail = trail[trail.length - 1];
    if (!lastTrail || haversineKm(lastTrail, devicePosition) >= 0.01) {
      trail.push({ ...devicePosition });
      if (trail.length > 1000) trail.splice(0, trail.length - 1000);
    }

    const damping = Math.max(0, Math.min(0.95, speedDampingPct / 100));
    if (gpsRawSpeedKnots != null && Number.isFinite(gpsRawSpeedKnots)) {
      smoothedSpeedRef.current = smoothedSpeedRef.current == null
        ? gpsRawSpeedKnots
        : smoothedSpeedRef.current * damping + gpsRawSpeedKnots * (1 - damping);
    }
    setNavigationSpeedKnots(smoothedSpeedRef.current);
    persistActiveNavigation();

    const source = navigationSourceRef.current;
    if (!source) return;
    source.clear();

    if (trail.length >= 2) {
      const track = new Feature({
        geometry: new LineString(trail.map((point) => fromLonLat([point.lon, point.lat]))),
      });
      track.setStyle(new Style({
        stroke: new Stroke({ color: "#ff4d57", width: 2.6 }),
        zIndex: 54,
      }));
      source.addFeature(track);
    }
  }, [freeNavigationActive, devicePosition, gpsRawSpeedKnots, speedDampingPct]);

  useEffect(() => {
    if (!navigationTarget || !devicePosition) return;

    const destination = {
      lat: Number(navigationTarget.latitude),
      lon: Number(navigationTarget.longitude),
    };
    if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lon)) return;

    if (!navigationStartRef.current) navigationStartRef.current = { ...devicePosition };
    const start = navigationStartRef.current;

    const trail = navigationTrailRef.current;
    const lastTrail = trail[trail.length - 1];
    if (!lastTrail || haversineKm(lastTrail, devicePosition) >= 0.01) {
      trail.push({ ...devicePosition });
      if (trail.length > 500) trail.splice(0, trail.length - 500);
    }
    persistActiveNavigation();

    const damping = Math.max(0, Math.min(0.95, speedDampingPct / 100));
    if (gpsRawSpeedKnots != null && Number.isFinite(gpsRawSpeedKnots)) {
      smoothedSpeedRef.current = smoothedSpeedRef.current == null
        ? gpsRawSpeedKnots
        : smoothedSpeedRef.current * damping + gpsRawSpeedKnots * (1 - damping);
    }
    const speedKnots = smoothedSpeedRef.current;
    const distanceNm = haversineKm(devicePosition, destination) / 1.852;
    const etaMinutes = speedKnots != null && speedKnots >= 0.3 ? (distanceNm / speedKnots) * 60 : null;
    const xteNm = start ? crossTrackErrorNm(start, destination, devicePosition) : 0;

    setNavigationSpeedKnots(speedKnots);
    setNavigationDistanceNm(distanceNm);
    setNavigationEtaMinutes(etaMinutes);
    setNavigationXteNm(xteNm);

    const source = navigationSourceRef.current;
    if (!source) return;
    source.clear();

    if (start) {
      const planned = new Feature({
        geometry: new LineString([
          fromLonLat([start.lon, start.lat]),
          fromLonLat([destination.lon, destination.lat]),
        ]),
      });
      planned.setStyle(new Style({
        stroke: new Stroke({ color: "rgba(86,170,255,.52)", width: 1.4, lineDash: [8, 8] }),
        zIndex: 47,
      }));
      source.addFeature(planned);

      const corridor = routeCorridorEdges(start, destination, xteLimitNm);
      const corridorLines = [
        { points: corridor.port, color: "rgba(255,91,107,.88)" },
        { points: corridor.starboard, color: "rgba(55,230,171,.88)" },
      ];
      corridorLines.forEach(({ points, color }) => {
        const edge = new Feature({
          geometry: new LineString(points.map((point) => fromLonLat([point.lon, point.lat]))),
        });
        edge.setStyle(new Style({
          stroke: new Stroke({ color, width: 2, lineDash: [10, 8] }),
          zIndex: 48,
        }));
        source.addFeature(edge);
      });
    }

    if (trail.length >= 2) {
      const track = new Feature({
        geometry: new LineString(trail.map((point) => fromLonLat([point.lon, point.lat]))),
      });
      track.setStyle(new Style({
        stroke: new Stroke({ color: "#2bd4aa", width: 2.2 }),
      }));
      source.addFeature(track);
    }

    const activeLeg = new Feature({
      geometry: new LineString([
        fromLonLat([devicePosition.lon, devicePosition.lat]),
        fromLonLat([destination.lon, destination.lat]),
      ]),
    });
    activeLeg.setStyle(new Style({
      stroke: new Stroke({ color: "#ffd05b", width: 3 }),
    }));
    source.addFeature(activeLeg);
  }, [navigationTarget, devicePosition, gpsRawSpeedKnots, speedDampingPct, xteLimitNm]);

  useEffect(()=>{
    if(!activeRoute || activeRouteIndex == null || navigationDistanceNm == null || navigationDistanceNm > 0.05) return;
    const next=activeRouteIndex+1;
    if(next < activeRoute.waypoints.length){ setActiveRouteIndex(next); navigateRoutePoint(next,activeRoute); setStatusMessage(`Waypoint ${activeRouteIndex+1} concluído — seguindo para ${next+1}.`); }
    else { setStatusMessage(`Rota ${activeRoute.name} concluída ✓`); setActiveRoute(null);setActiveRouteIndex(null);stopWaypointNavigation(); }
  },[navigationDistanceNm,activeRoute,activeRouteIndex]);

  useEffect(() => {
    const view = mapRef.current?.getView();
    if (!view) return;

    let degrees = 0;
    if (mapOrientationMode === "south") {
      degrees = 180;
    } else if (mapOrientationMode === "heading") {
      degrees = gpsHeadingDegrees ?? 0;
    } else if (mapOrientationMode === "course") {
      if (navigationTarget && devicePosition) {
        degrees = bearingDegrees(devicePosition, {
          lat: Number(navigationTarget.latitude),
          lon: Number(navigationTarget.longitude),
        });
      } else {
        degrees = gpsHeadingDegrees ?? 0;
      }
    }

    view.setRotation(-(degrees * Math.PI / 180));
  }, [mapOrientationMode, gpsHeadingDegrees, devicePosition, navigationTarget]);

  const navigationWaypointBearing = navigationTarget && devicePosition
    ? bearingDegrees(devicePosition, {
        lat: Number(navigationTarget.latitude),
        lon: Number(navigationTarget.longitude),
      })
    : null;
  const navigationArrivalClock = formatArrivalClock(new Date(), navigationEtaMinutes);


  const trackedSource = tracked ? sourceInfo(tracked.dataSource) : null;
  const trackedProviderTimeText = tracked ? (tracked.positionReceived || tracked.updateTime || "") : "";
  const trackedProviderDate = tracked ? parseProviderTime(trackedProviderTimeText) : null;
  const trackedHasProviderTime = Boolean(trackedProviderDate);
  const trackedFallbackTime = tracked?.receivedAt ? new Date(tracked.receivedAt).toISOString() : "";
  const trackedAge = tracked ? positionAgeLabel(trackedProviderTimeText || trackedFallbackTime) : null;
  const trackedDateTime = tracked ? trackedDateParts(trackedProviderTimeText || trackedFallbackTime) : null;
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

      <div className="ais-library-grid">
        <section className="ais-saved-folder">
          <div className="ais-library-head">
            <div><FolderHeart /><span><small>PASTA</small><b>Barcos salvos</b><em>{premiumSavedVessels.length} embarcação(ões)</em></span></div>
            {libraryLoading && <RefreshCw className="spin" />}
          </div>
          {premiumSavedVessels.length ? (
            <div className="ais-saved-list">
              {premiumSavedVessels.slice(0, 12).map((item) => {
                const hasPosition = item.lastLatitude != null && item.lastLongitude != null;
                return (
                  <article key={item.vesselKey}>
                    <button className="ais-saved-main" type="button" onClick={() => openSavedVessel(item)} disabled={!hasPosition}>
                      <span><Ship /></span>
                      <div><b>{item.name}</b><small>MMSI {item.mmsi || "—"} · IMO {item.imo || "—"}</small><em>{item.lastPositionReceived || item.lastUpdateTime || "Posição ainda não consultada"}</em></div>
                    </button>
                    <div className="ais-saved-actions">
                      <button type="button" className="update" title={item.folder === "marinesia" ? "Atualizar AIS Free" : item.folder === "shipfinder" ? "Atualizar ShipFinder" : `Atualizar dados · ${aisPricing.updateCredits} crédito(s)`} onClick={() => void refreshSavedVessel(item)}><RefreshCw /><span>{item.folder === "marinesia" ? "ATUALIZAR GRÁTIS" : item.folder === "shipfinder" ? "ATUALIZAR SHIPFINDER" : `ATUALIZAR · ${aisPricing.updateCredits} CR`}</span></button>
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
          {/* V209: controles manuais de carregamento removidos do mapa público.
              As camadas AIS continuam carregando/atualizando automaticamente em segundo plano. */}
          <button type="button" className={`ais-v143-map-tool ${waypointPanelOpen ? "active" : ""}`} onClick={openWaypointPanel} title="Criar waypoint">
            <Flag /><span>WP</span>
          </button>
          <button type="button" className={`ais-v143-map-tool ais-v167-route-tool ${routeMode || routesPanelOpen ? "active" : ""}`} onClick={toggleRouteMode} title="Criar rota">
            <Route /><span>ROTA</span>
          </button>
          {canManageOfficialAreas && <button type="button" className={`ais-v143-map-tool ais-v200-area-tool ${officialAreaDrawMode ? "active" : ""}`} onClick={toggleOfficialAreaDrawMode} title="Desenhar área/reserva administrativa">
            <MapPinned /><span>ÁREA</span>
          </button>}
          <button type="button" className={`ais-v143-map-tool measure ${measureMode ? "active" : ""}`} onClick={toggleMeasureMode} title="Medir distância livre no mapa">
            <Ruler /><span>MEDIR</span>
          </button>
          <button
            type="button"
            className={`ais-v143-map-tool settings ${mapSettingsOpen ? "active" : ""}`}
            onClick={() => { setMapSettingsOpen((open) => !open); setWaypointPanelOpen(false); }}
            title="Configurações do mapa"
          >
            <Settings /><span>MAPA</span>
          </button>
          {/* V209: legenda técnica das fontes AIS fica somente no painel administrativo. */}
          {/* V140: botão/camada de cartas DHN removidos da interface AIS. */}
        </div>

        {canManageOfficialAreas && officialAreaDrawMode && (
          <div className="ais-v200-area-panel">
            <div className="ais-v200-area-head"><span><MapPinned /><b>ÁREA ADMIN</b><em>{officialAreaDraftPoints.length} PONTOS</em></span><button type="button" onClick={cancelOfficialAreaDraw}>×</button></div>
            <input value={officialAreaName} onChange={(e) => setOfficialAreaName(e.target.value.slice(0, 80))} placeholder="Nome da área / reserva" />
            <div className="ais-v200-area-colors">
              {(["green", "yellow", "red"] as OfficialAreaColor[]).map((color) => <button type="button" key={color} className={officialAreaColor === color ? "active" : ""} onClick={() => setOfficialAreaColor(color)}><i style={{ background: officialAreaHex(color) }} /><span>{color === "green" ? "VERDE" : color === "yellow" ? "AMARELO" : "VERMELHO"}</span></button>)}
            </div>
            <label className="ais-v200-area-opacity"><span>TRANSPARÊNCIA <b>{officialAreaTransparency}%</b></span><input type="range" min="0" max="100" step="1" value={officialAreaTransparency} onChange={(e) => setOfficialAreaTransparency(Number(e.target.value))} /></label>
            <small>Toque/clique no mapa para criar os vértices. O contorno fecha automaticamente ao salvar.</small>
            <div className="ais-v200-area-actions"><button type="button" onClick={() => setOfficialAreaDraft(officialAreaDraftPointsRef.current.slice(0, -1))} disabled={!officialAreaDraftPoints.length}><Undo2 /> DESFAZER</button><button type="button" className="save" onClick={() => void saveOfficialArea()} disabled={officialAreaSaving || officialAreaDraftPoints.length < 3}>{officialAreaSaving ? <RefreshCw className="spin" /> : <Save />} FECHAR E SALVAR</button></div>
          </div>
        )}

        {selectedOfficialWaypoint && (
          <div className="ais-v198-official-card">
            <button type="button" className="close" onClick={() => setSelectedOfficialWaypoint(null)} aria-label="Fechar waypoint oficial">×</button>
            <img src={officialWaypointIcon(selectedOfficialWaypoint.waypointType)} alt="" />
            <div>
              <small>WAYPOINT OFICIAL · {officialWaypointTypeLabel(selectedOfficialWaypoint.waypointType)}</small>
              <b>{selectedOfficialWaypoint.name}</b>
              <span>{formatCoordOperational(Number(selectedOfficialWaypoint.latitude), true)} · {formatCoordOperational(Number(selectedOfficialWaypoint.longitude), false)}</span>
              {selectedOfficialWaypoint.description && <p>{selectedOfficialWaypoint.description}</p>}
            </div>
            <button type="button" className="center" onClick={() => centerOn(Number(selectedOfficialWaypoint.latitude), Number(selectedOfficialWaypoint.longitude), Math.max(12, mapRef.current?.getView().getZoom() || 12))}><Crosshair /> CENTRALIZAR</button>
          </div>
        )}

        {ENABLE_DHN_CHARTS && dhnPanelOpen && (
          <div className="ais-v137-chart-panel">
            <div className="ais-v137-chart-head">
              <span><MapPinned /><b>CARTA DE PESCA</b></span>
              <button type="button" onClick={() => setDhnPanelOpen(false)}>×</button>
            </div>

            <button
              type="button"
              className={`ais-v137-auto ${dhnAuto ? "active" : ""}`}
              onClick={() => setDhnAuto((value) => !value)}
            >
              <Crosshair /> {dhnAuto ? "AUTOMÁTICA PELO MAPA" : "SELEÇÃO MANUAL"}
            </button>

            <label className="ais-v137-chart-select">
              <span>Carta DHN</span>
              <select
                value={selectedDhnChart}
                onChange={(e) => { setDhnAuto(false); setSelectedDhnChart(e.target.value); setMapMode("dhn"); }}
                disabled={!dhnCharts.length}
              >
                {!dhnCharts.length && <option value="">Carregando cartas...</option>}
                {dhnCharts.map((chart) => (
                  <option key={chart.number} value={chart.number}>
                    {chart.number} · {chart.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="ais-v137-opacity">
              <span>Transparência <b>{Math.round(dhnOpacity * 100)}%</b></span>
              <input
                type="range"
                min="20"
                max="90"
                value={Math.round(dhnOpacity * 100)}
                onChange={(e) => setDhnOpacity(Number(e.target.value) / 100)}
              />
            </label>

            <small>{dhnLoadMessage}</small>
            <button type="button" className="ais-v137-off" onClick={() => { setMapMode("map"); setDhnPanelOpen(false); }}>
              DESLIGAR CARTA
            </button>
          </div>
        )}

        {/* V209: barra técnica de fontes/refresh removida do mapa público para liberar área útil.
            Batimetria, cartas e atualizações automáticas continuam ativas e inalteradas. */}

        <div className={`ais-v147-orientation ${orientationMenuOpen ? "open" : ""}`}>
          <button
            type="button"
            className="ais-v147-orientation-main"
            onClick={() => setOrientationMenuOpen((open) => !open)}
            title="Modo de orientação do mapa"
          >
            {navigationTarget || freeNavigationActive ? <Ship /> : <Navigation />}
            <span>{orientationLabel(mapOrientationMode)}</span>
          </button>
          {orientationMenuOpen && (
            <div className="ais-v147-orientation-menu">
              {([
                ["heading", "PROA UP"],
                ["course", "RUMO UP"],
                ["north", "NORTE UP"],
                ["south", "SUL UP"],
              ] as Array<[MapOrientationMode, string]>).map(([mode, label]) => (
                <button
                  type="button"
                  key={mode}
                  className={mapOrientationMode === mode ? "active" : ""}
                  onClick={() => { setMapOrientationMode(mode); setOrientationMenuOpen(false); }}
                >
                  {mode === "heading" ? <Ship /> : <Navigation />}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
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

        {devicePosition && !navigationTarget && !freeNavigationActive && (
          <div className="ais-v143-gps-card">
            <div><LocateFixed /><b>GPS ATUAL</b></div>
            <strong>{formatCoordOperational(devicePosition.lat, true)}</strong>
            <strong>{formatCoordOperational(devicePosition.lon, false)}</strong>
          </div>
        )}

        {waypointPanelOpen && (
          <div className="ais-v143-waypoint-panel">
            <div className="ais-v143-waypoint-head">
              <span><Flag /><b>WAYPOINT</b><em>{waypoints.length}</em></span>
              <button type="button" onClick={() => setWaypointPanelOpen(false)}>×</button>
            </div>
            <div className="ais-v146-waypoint-coords">
              <label><span>LAT S</span><input inputMode="numeric" maxLength={6} value={waypointLatDigits} onChange={(e) => { setWaypointLatDigits(e.target.value.replace(/\D/g, "").slice(0, 6)); setWaypointCoordError(""); }} placeholder="254565" /></label>
              <label><span>LON W</span><input inputMode="numeric" maxLength={7} value={waypointLonDigits} onChange={(e) => { setWaypointLonDigits(e.target.value.replace(/\D/g, "").slice(0, 7)); setWaypointCoordError(""); }} placeholder="473545" /></label>
            </div>
            {waypointCoordError && <div className="ais-v146-waypoint-error">{waypointCoordError}</div>}
            <input value={waypointName} onChange={(e) => setWaypointName(e.target.value.slice(0, 40))} placeholder="Nome do waypoint" />
            <div className="ais-v143-waypoint-icons">
              {(["circle","diamond","triangle","cross","star"] as WaypointIcon[]).map((icon) => (
                <button type="button" key={icon} className={waypointIcon === icon ? "active" : ""} onClick={() => setWaypointIcon(icon)} title={icon}>
                  {waypointSymbol(icon)}
                </button>
              ))}
            </div>
            <div className="ais-v143-waypoint-colors">
              {["#ffb52e","#2bd4aa","#4aa8ff","#ff5f6d","#f5f5f5"].map((color) => (
                <button type="button" key={color} className={waypointColor === color ? "active" : ""} style={{ background: color }} onClick={() => setWaypointColor(color)} aria-label={`Cor ${color}`} />
              ))}
            </div>
            <div className="ais-v143-waypoint-actions">
              {selectedWaypointId != null && <button type="button" className="danger" onClick={() => void deleteWaypoint(selectedWaypointId)}><Trash2 /></button>}
              <button type="button" className="save" onClick={() => void saveWaypoint()} disabled={waypointSaving}>
                <Save /> {waypointSaving ? "SALVANDO" : "SALVAR"}
              </button>
            </div>
            {selectedWaypointId != null && (
              <button type="button" className="ais-v146-goto" onClick={() => startWaypointNavigation()}>
                <Ship /> IR PARA
              </button>
            )}
          </div>
        )}

        {routesPanelOpen && (
          <div className="ais-v167-route-panel">
            <div className="ais-v167-route-head"><span><Route/><b>{editingRouteId ? "ROTA" : "CRIAR ROTA"}</b><em>{routePoints.length} pts</em></span><button onClick={()=>setRoutesPanelOpen(false)}>×</button></div>
            <div className="ais-v167-route-actions">
              <button onClick={toggleRouteMode}>{routeMode ? "PARAR PONTOS" : "ADICIONAR PONTO"}</button>
              <button onClick={undoRoutePoint} disabled={!routePoints.length}><Undo2/> DESFAZER</button>
              <button onClick={saveRoute} disabled={!routePoints.length}><Save/> SALVAR ROTA</button>
              {editingRouteId && <button className="go" onClick={()=>startFullRoute()}><Navigation/> INICIAR ROTA</button>}
              <button className="cancel" onClick={cancelRoute}>CANCELAR</button>
            </div>
            {editingRouteId && <div className="ais-v167-route-fields"><input value={routeName} onChange={e=>setRouteName(e.target.value)} placeholder="Nome da rota"/><input value={routeDescription} onChange={e=>setRouteDescription(e.target.value)} placeholder="Descrição opcional"/></div>}
            <div className="ais-v167-route-points">{routePoints.map((p,i)=><div key={i}><button className="point" onClick={()=>navigateRoutePoint(i)} title="IR PARA">{i+1}</button><small>{formatCoordOperational(p.latitude,true)} · {formatCoordOperational(p.longitude,false)} · IR PARA</small><button className="del" onClick={()=>setDraftRoute(routePointsRef.current.filter((_,j)=>j!==i))}>×</button></div>)}</div>
            <div className="ais-v167-my-routes"><b>MINHAS ROTAS</b>{routes.map(r=><div key={r.id}><button className="open" onClick={()=>openRoute(r)}><span>{r.name}</span><small>{r.waypoints.length} pontos</small></button><button onClick={()=>startFullRoute(r)} title="Navegar"><Navigation/></button><button onClick={()=>duplicateRoute(r)} title="Duplicar">⧉</button><button onClick={()=>deleteRoute(r.id)} title="Excluir"><Trash2/></button></div>)}</div>
          </div>
        )}

        {mapSettingsOpen && (
          <div className="ais-v146-settings-panel">
            <div className="ais-v146-settings-head"><span><Settings /><b>CONFIGURAÇÃO DO MAPA</b></span><button type="button" onClick={() => setMapSettingsOpen(false)}>×</button></div>
            <label>
              <span>XTE MÁXIMO <b>{xteLimitNm.toFixed(2)} MN</b></span>
              <input type="number" min="0.05" max="5" step="0.05" value={xteLimitNm} onChange={(e) => setXteLimitNm(Math.max(0.05, Math.min(5, Number(e.target.value) || 0.25)))} />
            </label>
            <label>
              <span>DAMPING VELOCIDADE <b>{speedDampingPct}%</b></span>
              <input type="range" min="0" max="90" step="5" value={speedDampingPct} onChange={(e) => setSpeedDampingPct(Number(e.target.value))} />
            </label>
            <small>XTE padrão: 0,25 MN ≈ 470 m para cada bordo. As linhas pontilhadas mostram bombordo e boreste.</small>
          </div>
        )}

        {navigationTarget && (
          <div className={`ais-v146-nav-card ais-v150-telemetry ais-v151-telemetry ais-v154-waypoint-telemetry ${navigationXteNm != null && Math.abs(navigationXteNm) > xteLimitNm ? "xte-alert" : ""}`}>
            <div className="ais-v150-nav-head">
              <span className="ais-v150-destination">
                <Ship />
                <span><small>NAVEGAÇÃO ATIVA</small><b>{navigationTarget.name}</b></span>
              </span>
              <em>{orientationLabel(mapOrientationMode)}</em>
              <button type="button" onClick={stopWaypointNavigation} aria-label="Fechar navegação">×</button>
            </div>
            <div className="ais-v150-nav-grid">
              <span><small>VELOCIDADE</small><b>{navigationSpeedKnots != null ? navigationSpeedKnots.toFixed(1) : "—"}</b><em>MN/h</em></span>
              <span><small>DISTÂNCIA</small><b>{navigationDistanceNm != null ? navigationDistanceNm.toFixed(2) : "—"}</b><em>MN</em></span>
              <span><small>CHEGADA</small><b>{navigationArrivalClock}</b><em>HORA</em></span>
              <span><small>RUMO WP</small><b>{formatCourseDegrees(navigationWaypointBearing)}</b><em>GRAUS</em></span>
            </div>
            <div className="ais-v150-nav-footer">
              <span className="ais-v150-corridor">
                <i className="port" />
                <b>± {xteLimitNm.toFixed(2)} MN</b>
                <small>≈ {Math.ceil((xteLimitNm * 1852) / 10) * 10} m · BOMBORDO / BORESTE</small>
                <i className="starboard" />
              </span>
              <span className={navigationXteNm != null && Math.abs(navigationXteNm) > xteLimitNm ? "ais-v150-status alert" : "ais-v150-status"}>
                {navigationXteNm != null && Math.abs(navigationXteNm) > xteLimitNm ? "FORA DO CORREDOR" : "DENTRO DO CORREDOR"}
              </span>
              <button type="button" onClick={stopWaypointNavigation}>PARAR</button>
            </div>
          </div>
        )}

        {measureMode && (
          <div className="ais-v143-measure-badge">
            <Ruler />
            <span>
              {measureResult
                ? <><b>{measureResult.nm.toFixed(2)} MN</b><small>milhas náuticas</small></>
                : measureStart
                  ? <><b>INÍCIO MARCADO</b><small>toque no ponto final</small></>
                  : <><b>RÉGUA LIVRE</b><small>toque no início</small></>}
            </span>
            {(measureStart || measureResult) && <button type="button" onClick={clearMeasurement}>×</button>}
          </div>
        )}

        {mapProbe && (
          <div className="ais-v141-point-card">
            <div className="ais-v141-point-head">
              <span><Crosshair /><b>PONTO NO MAPA</b></span>
              <button type="button" onClick={clearMapProbe} aria-label="Fechar ponto">×</button>
            </div>
            <div className="ais-v141-point-coords">
              <span><small>LATITUDE</small><strong>{formatCoordOperational(mapProbe.lat, true)}</strong></span>
              <span><small>LONGITUDE</small><strong>{formatCoordOperational(mapProbe.lon, false)}</strong></span>
            </div>
          </div>
        )}

        {freeNavigationActive && !navigationTarget && (
          <div className="ais-v154-free-nav-card">
            <div>
              <span><small>VELOCIDADE</small><b>{navigationSpeedKnots != null ? navigationSpeedKnots.toFixed(1) : "—"}</b><em>MN/h</em></span>
              <span><small>RUMO</small><b>{formatCourseDegrees(gpsHeadingDegrees)}</b><em>NAVEGAÇÃO</em></span>
            </div>
            <button type="button" onClick={stopFreeNavigation}>PARAR</button>
          </div>
        )}

        {!navigationTarget && (
          <button
            type="button"
            className={`ais-v154-free-nav-trigger ${freeNavigationActive ? "active" : ""}`}
            onClick={() => { setFreePanelOpen(false); setPremiumPanelOpen(false); startFreeNavigation(); }}
          >
            <Navigation />
            <span>{freeNavigationActive ? "NAVEGANDO" : "NAVEGAR"}</span>
            <em>{freeNavigationActive ? "ATIVO" : "GPS"}</em>
          </button>
        )}

        <button
          type="button"
          className={`ais-v210-free-trigger ${freePanelOpen ? "active" : ""}`}
          onClick={() => {
            setFreePanelOpen((open) => !open);
            setPremiumPanelOpen(false);
            setFreeSearchError("");
          }}
          aria-expanded={freePanelOpen}
        >
          <Search />
          <span>BUSCAR FREE</span>
          <em>FREE</em>
        </button>

        {freePanelOpen && (
          <div className="ais-v210-free-panel">
            <div className="ais-v210-free-head">
              <span><Search /><b>BUSCA AIS FREE</b></span>
              <button type="button" onClick={() => setFreePanelOpen(false)} aria-label="Fechar Busca FREE">×</button>
            </div>
            <small>Pesquisa gratuita de embarcações · sem cobrança de créditos</small>
            <GfwFreeSearch request={aisFetch} locating={freeSearchLoading} locate={(vessel) => {
              setFreeSearchQuery(vessel.name || vessel.mmsi || vessel.imo);
              setFreePanelOpen(false);
              void openFreeResult({
                name: vessel.name,
                mmsi: vessel.mmsi,
                imo: vessel.imo,
                country: "",
                countryIso: vessel.flag,
                shipType: "",
                typeSpecific: "",
                callsign: vessel.callsign,
                freeProvider: undefined,
              });
            }}>
              <form
                className="ais-v138-free-form"
                onSubmit={(event) => { event.preventDefault(); void searchFreeVessel(); }}
              >
                <Search />
                <input
                  value={freeSearchQuery}
                  onChange={(event) => setFreeSearchQuery(event.target.value)}
                  placeholder="PESQUISAR BARCO FREE"
                  autoComplete="off"
                  aria-label="Pesquisar barco no AIS Free"
                />
                <button type="submit" disabled={freeSearchLoading}>
                  {freeSearchLoading ? <RefreshCw className="spin" /> : <Search />}
                  <span>BUSCAR</span>
                </button>
              </form>

              {freeSearchError && <div className="ais-v138-search-error free">{freeSearchError}</div>}
              {freeSearchResults.length > 0 && (
                <div className="ais-v138-search-results free">
                  {freeSearchResults.slice(0, 8).map((match, index) => (
                    <button
                      type="button"
                      key={"free-" + (match.mmsi || match.imo || match.name || index)}
                      onClick={() => { setFreePanelOpen(false); void openFreeResult(match); }}
                      disabled={freeSearchLoading}
                    >
                      <Ship />
                      <span>
                        <b>{match.name || match.mmsi || match.imo}</b>
                        <small>MMSI {match.mmsi || "—"} · IMO {match.imo || "—"}</small>
                      </span>
                      <em>FREE</em>
                    </button>
                  ))}
                </div>
              )}
            </GfwFreeSearch>
          </div>
        )}

        <button
          type="button"
          className={`ais-v138-premium-trigger ${premiumPanelOpen ? "active" : ""}`}
          onClick={() => {
            setPremiumPanelOpen((open) => !open);
            setFreePanelOpen(false);
            setPremiumSearchError("");
          }}
          aria-expanded={premiumPanelOpen}
        >
          <Search />
          <span>BUSCA PREMIUM</span>
          <em>{aisPricing.locateCredits} CR</em>
        </button>

        {premiumPanelOpen && (
          <div className="ais-v138-premium-panel">
            <div className="ais-v138-premium-head">
              <span><Search /><b>BUSCA AIS PREMIUM</b></span>
              <button type="button" onClick={() => setPremiumPanelOpen(false)}>×</button>
            </div>
            <small>Custo da posição: {aisPricing.locateCredits} crédito(s) · {formatBrl(aisPricing.locateCredits * creditUnitPrice)}</small>
            <form onSubmit={(event) => { event.preventDefault(); void searchPremiumVessel(); }}>
              <Search />
              <input
                value={premiumSearchQuery}
                onChange={(event) => setPremiumSearchQuery(event.target.value)}
                placeholder="Nome, MMSI ou IMO"
                autoComplete="off"
                aria-label="Pesquisar barco no AIS Premium"
              />
              <button type="submit" disabled={premiumSearchLoading}>
                {premiumSearchLoading ? <RefreshCw className="spin" /> : <Search />}
                BUSCAR PREMIUM
              </button>
            </form>
            {premiumSearchError && <div className="ais-v138-search-error premium">{premiumSearchError}</div>}
            {premiumSearchResults.length > 0 && (
              <div className="ais-v138-search-results premium">
                {premiumSearchResults.slice(0, 8).map((match, index) => (
                  <button
                    type="button"
                    key={"premium-" + (match.mmsi || match.imo || match.name || index)}
                    onClick={() => { setPremiumPanelOpen(false); void openPremiumResult(match); }}
                    disabled={premiumSearchLoading}
                  >
                    <Ship />
                    <span>
                      <b>{match.name || match.mmsi || match.imo}</b>
                      <small>MMSI {match.mmsi || "—"} · IMO {match.imo || "—"}</small>
                    </span>
                    <em>PREMIUM</em>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="ais-v138-premium-area"
              onClick={() => { setSearchProvider("premium"); void searchArea("premium"); }}
              disabled={status === "loading" || !areaCenter}
            >
              <Crosshair /> BUSCAR ÁREA 50 KM · {aisPricing.areaCredits} CR
            </button>
          </div>
        )}

        <div className="ais-v70-mobile-dock ais-v119-dock ais-v138-dock">
          <button type="button" className={mobilePanel === "areaSearch" ? "active area" : "area"} onClick={() => { const opening = mobilePanel !== "areaSearch"; setMobilePanel(opening ? "areaSearch" : null); if (opening && !areaCenter) chooseAreaCenterFromMap(); }}><Crosshair /><span>50 km</span></button>
          <button type="button" className={mobilePanel === "saved" ? "active saved" : "saved"} onClick={() => setMobilePanel(mobilePanel === "saved" ? null : "saved")}><FolderHeart /><span>Barcos</span><em>{premiumSavedVessels.length}</em></button>
          <button type="button" className={mobilePanel === "waypoints" ? "active waypoints" : "waypoints"} onClick={() => setMobilePanel(mobilePanel === "waypoints" ? null : "waypoints")}><Flag /><span>Waypoints</span><em>{waypoints.length}</em></button>
          <button type="button" className={mobilePanel === "history" ? "active history" : "history"} onClick={() => setMobilePanel(mobilePanel === "history" ? null : "history")}><History /><span>Histórico</span><em>{historyItems.length}</em></button>
        </div>

        {mobilePanel && (
          <div className={`ais-v70-mobile-panel ${mobilePanel}`}>
            <div className="ais-v70-mobile-panel-head">
              <b>{mobilePanel === "areaSearch" ? "Buscar em 50 km" : mobilePanel === "saved" ? "Barcos salvos" : mobilePanel === "areaSaved" ? "Resultados 50 km" : mobilePanel === "waypoints" ? "Waypoints salvos" : "Histórico AIS"}</b>
              <button type="button" onClick={() => setMobilePanel(null)}>×</button>
            </div>

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
                    <label><span>Latitude Sul</span><span className="coord-free-input"><input type="text" inputMode="numeric" value={manualLatDigits} onChange={(e) => { setManualLatDigits(formatCoordinateInput(e.target.value)); setManualCoordError(""); }} placeholder="25°4530" /></span></label>
                    <label><span>Longitude Oeste</span><span className="coord-free-input"><input type="text" inputMode="numeric" value={manualLonDigits} onChange={(e) => { setManualLonDigits(formatCoordinateInput(e.target.value)); setManualCoordError(""); }} placeholder="46°2550" /></span></label>
                    <button type="button" onClick={() => applyManualAreaCoordinates(false)}><MapPinned /> Usar posição</button>
                  </div>
                )}
                {manualCoordError && <p className="ais-v74-coordinate-error mobile">{manualCoordError}</p>}

                <button type="button" className="ais-v127-area-saved" onClick={() => setMobilePanel("areaSaved")}><FolderHeart /> Ver resultados salvos <em>{areaSavedVessels.length}</em></button>
              </div>
            )}

            {mobilePanel === "saved" && <div className="ais-v70-mobile-list saved">{premiumSavedVessels.length ? premiumSavedVessels.slice(0, 30).map((item) => <article className="ais-mobile-saved-row" key={item.vesselKey}>
              <button type="button" className="ais-mobile-saved-main" onClick={() => { openSavedVessel(item); setMobilePanel(null); }}><Ship /><span><b>{item.name}</b><small>{item.lastLatitude != null ? `${formatCoordMarine(Number(item.lastLatitude), true)} · ${formatCoordMarine(Number(item.lastLongitude), false)}` : "Sem posição salva"}</small></span></button>
              <button type="button" className="ais-mobile-saved-update" onClick={() => void refreshSavedVessel(item)}><RefreshCw /><span>{item.folder === "marinesia" ? "ATUALIZAR GRÁTIS" : item.folder === "shipfinder" ? "ATUALIZAR SHIPFINDER" : `ATUALIZAR · ${aisPricing.updateCredits} CR`}</span></button>
            </article>) : <p>Nenhum barco salvo.</p>}</div>}

            {mobilePanel === "areaSaved" && <div className="ais-v70-mobile-list area-saved">
              <div className="ais-area-saved-alert">
                <div>
                  <b>Lista temporária de 50 km</b>
                  <small>Esses resultados apagam automaticamente em {AREA_RESULTS_TTL_HOURS} horas.</small>
                </div>
                <button type="button" className="ais-area-saved-clear" onClick={() => void clearAreaSavedVessels()} disabled={!areaSavedVessels.length}><Trash2 /><span>EXCLUIR TODOS</span></button>
              </div>
              {areaSavedVessels.length ? areaSavedVessels.slice(0, 80).map((item) => {
                const saving = savingKeys.has(item.vesselKey);
                return <article className="ais-mobile-saved-row area-row" key={item.vesselKey}>
                  <button type="button" className="ais-mobile-saved-main" onClick={() => { openSavedVessel(item); setMobilePanel(null); }}><Ship /><span><b>{item.name}</b><small>{item.lastLatitude != null ? `${formatCoordOperational(Number(item.lastLatitude), true)} · ${formatCoordOperational(Number(item.lastLongitude), false)}` : "Sem posição"}</small><em>{areaSavedRemainingLabel(item)}</em></span></button>
                  <div className="ais-mobile-saved-actions area-actions">
                    <button type="button" className="ais-mobile-saved-update" onClick={() => void refreshSavedVessel(item)}><RefreshCw /><span>ATUALIZAR</span></button>
                    <button type="button" className={`ais-mobile-saved-update save ${saving ? "saving" : ""}`} onClick={() => void saveAreaResultToRegular(item)} disabled={saving}><Bookmark /><span>{saving ? "SALVANDO..." : "SALVAR"}</span></button>
                    <button type="button" className="ais-mobile-saved-update danger" onClick={() => void removeAreaSavedVessel(item.vesselKey)}><Trash2 /><span>EXCLUIR</span></button>
                  </div>
                </article>;
              }) : <p>Nenhuma busca premium de 50 km salva ainda.</p>}
            </div>}

            {mobilePanel === "waypoints" && (
              <div className="ais-v70-mobile-list waypoints">
                {waypoints.length ? waypoints.slice(0, 60).map((item) => (
                  <article className="ais-v144-waypoint-row" key={item.id}>
                    <button type="button" className="ais-v144-waypoint-main" onClick={() => openSavedWaypoint(item)}>
                      <span className="ais-v144-waypoint-symbol" style={{ color: item.color }}>{waypointSymbol(item.icon)}</span>
                      <span>
                        <b>{item.name}</b>
                        <small>{formatCoordOperational(Number(item.latitude), true)} · {formatCoordOperational(Number(item.longitude), false)}</small>
                      </span>
                    </button>
                    <button type="button" className="ais-v144-waypoint-delete" onClick={() => void deleteWaypoint(item.id)} title="Excluir waypoint"><Trash2 /></button>
                  </article>
                )) : <p>Nenhum waypoint salvo.</p>}
              </div>
            )}

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
            <b>{freeMapVesselCount ? "Toque em um barco no mapa" : "Nenhum barco selecionado"}</b>
            <span>{freeMapVesselCount ? "A camada AIS automática não consome créditos. A pesquisa manual continua separada." : "Procure o nome acima. Ao escolher a embarcação, a posição aparece aqui."}</span>
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
              <span><small>{trackedHasProviderTime ? "DATA RASTREADA" : "DATA DA CONSULTA"}</small><b>{trackedDateTime.date}</b></span>
              <span><small>{trackedHasProviderTime ? "HORA" : "HORA DA CONSULTA"}</small><b>{trackedDateTime.time}</b></span>
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
                        <button type="button" className="primary" onClick={() => void refreshTrackedVessel()} disabled={freeSearchLoading || premiumSearchLoading}>
                          <RefreshCw /> Atualizar posição
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
        <b>AIS profissional · FREE e PREMIUM separados</b>
        <span>
          A busca FREE usa somente fontes gratuitas pelo endpoint próprio. A busca PREMIUM usa somente Data Docked, valida créditos e cobra apenas conforme a regra atual após retorno válido. Todas as chaves permanecem no backend.
        </span>
      </div>
    </section>
  );
}
