"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Minus, Plus } from "lucide-react";
import Feature from "ol/Feature";
import Map from "ol/Map";
import View from "ol/View";
import Point from "ol/geom/Point";
import HeatmapLayer from "ol/layer/Heatmap";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import Overlay from "ol/Overlay";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { boundingExtent } from "ol/extent";
import { fromLonLat } from "ol/proj";
import Style from "ol/style/Style";
import Text from "ol/style/Text";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";

export type EnvironmentalMapMode = "wind" | "chlorophyll";

type GridPoint = {
  lat: number;
  lon: number;
  row?: number;
  col?: number;
  speedKmh?: number | null;
  directionDeg?: number | null;
  direction?: string | null;
  mgM3?: number | null;
};

type Props = {
  lat: number;
  lon: number;
  mode: EnvironmentalMapMode;
  wind: GridPoint[];
  chlorophyll: GridPoint[];
};

function nauticalPart(value: number, dir: "S" | "W") {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  return `${String(degrees).padStart(2, "0")}º ${minutes.toFixed(2).replace(".", ",")}' ${dir}`;
}

function fmt(value: number, digits = 1) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function EnvironmentalOverlayMap({ lat, lon, mode, wind, chlorophyll }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const heatRef = useRef<HeatmapLayer | null>(null);
  const labelsRef = useRef<VectorLayer<VectorSource> | null>(null);
  const markerRef = useRef<Overlay | null>(null);
  const [zoom, setZoom] = useState(8);

  const points = mode === "wind" ? wind : chlorophyll;
  const numbers = useMemo(() => points
    .map((item) => Number(mode === "wind" ? item.speedKmh : item.mgM3))
    .filter(Number.isFinite), [mode, points]);
  const min = numbers.length ? Math.min(...numbers) : 0;
  const max = numbers.length ? Math.max(...numbers) : 1;

  useEffect(() => {
    if (!hostRef.current || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const centerMarker = document.createElement("div");
    centerMarker.className = "environment-position-marker";
    centerMarker.innerHTML = '<span></span><i>POSIÇÃO</i>';

    const markerOverlay = new Overlay({
      element: centerMarker,
      positioning: "center-center",
      stopEvent: false,
    });

    const view = new View({
      center: fromLonLat([lon, lat]),
      zoom: 8,
      minZoom: 5,
      maxZoom: 14,
      constrainResolution: true,
    });

    const base = new TileLayer({ source: new OSM(), opacity: 0.62 });
    const heat = new HeatmapLayer({
      source: new VectorSource(),
      blur: 42,
      radius: 54,
      opacity: 0.76,
      gradient: ["#0b4f8a", "#0588a5", "#00a97a", "#32c71d", "#d6d91a", "#f29a24", "#df4931"],
      weight: "weight",
    });
    const labels = new VectorLayer({ source: new VectorSource() });

    const map = new Map({
      target: hostRef.current,
      controls: [],
      layers: [base, heat, labels],
      overlays: [markerOverlay],
      view,
    });

    markerOverlay.setPosition(fromLonLat([lon, lat]));
    const onResolution = () => setZoom(Math.round(view.getZoom() || 8));
    view.on("change:resolution", onResolution);

    mapRef.current = map;
    heatRef.current = heat;
    labelsRef.current = labels;
    markerRef.current = markerOverlay;

    const ro = new ResizeObserver(() => map.updateSize());
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      view.un("change:resolution", onResolution);
      map.setTarget(undefined);
      mapRef.current = null;
      heatRef.current = null;
      labelsRef.current = null;
      markerRef.current = null;
    };
  }, [lat, lon]);

  useEffect(() => {
    const heatSource = heatRef.current?.getSource();
    const labelSource = labelsRef.current?.getSource();
    const map = mapRef.current;
    if (!heatSource || !labelSource || !map) return;

    heatSource.clear();
    labelSource.clear();

    const finite = points.filter((item) => {
      const value = Number(mode === "wind" ? item.speedKmh : item.mgM3);
      return Number.isFinite(value) && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon));
    });
    const finiteNumbers = finite.map((item) => Number(mode === "wind" ? item.speedKmh : item.mgM3));
    const localMin = finiteNumbers.length ? Math.min(...finiteNumbers) : 0;
    const localMax = finiteNumbers.length ? Math.max(...finiteNumbers) : 1;
    const span = Math.max(0.01, localMax - localMin);

    for (const item of finite) {
      const value = Number(mode === "wind" ? item.speedKmh : item.mgM3);
      const normalized = Math.max(0, Math.min(1, (value - localMin) / span));
      const coordinate = fromLonLat([Number(item.lon), Number(item.lat)]);
      const heatFeature = new Feature({ geometry: new Point(coordinate), weight: 0.42 + normalized * 0.58 });
      heatSource.addFeature(heatFeature);

      const labelFeature = new Feature({ geometry: new Point(coordinate) });
      if (mode === "wind") {
        const rotation = (Number(item.directionDeg || 0) * Math.PI) / 180;
        labelFeature.setStyle([
          new Style({
            text: new Text({
              text: "↑",
              rotation,
              font: "900 23px system-ui, sans-serif",
              fill: new Fill({ color: "#ffffff" }),
              stroke: new Stroke({ color: "rgba(0,0,0,.72)", width: 4 }),
              offsetY: -8,
            }),
          }),
          new Style({
            text: new Text({
              text: `${fmt(value, 0)} km/h`,
              font: "900 11px system-ui, sans-serif",
              fill: new Fill({ color: "#ffffff" }),
              stroke: new Stroke({ color: "rgba(0,0,0,.82)", width: 4 }),
              offsetY: 15,
            }),
          }),
        ]);
      } else {
        labelFeature.setStyle(new Style({
          text: new Text({
            text: fmt(value, 2),
            font: "900 11px system-ui, sans-serif",
            fill: new Fill({ color: "#ffffff" }),
            stroke: new Stroke({ color: "rgba(0,0,0,.82)", width: 4 }),
          }),
        }));
      }
      labelSource.addFeature(labelFeature);
    }

    const coords = finite.map((item) => fromLonLat([Number(item.lon), Number(item.lat)]));
    if (coords.length > 1) {
      map.getView().fit(boundingExtent(coords), { padding: [55, 35, 55, 35], maxZoom: 8, duration: 250 });
    } else {
      map.getView().setCenter(fromLonLat([lon, lat]));
    }

    heatRef.current?.setGradient(mode === "wind"
      ? ["#1599ba", "#2bc9bd", "#61cf46", "#d9d92b", "#f0a12f", "#e65437", "#a9327f"]
      : ["#1168b5", "#058f9c", "#00ad70", "#21c626", "#a8d51c", "#efd321", "#e9891e"]);
  }, [mode, points, lat, lon]);

  function changeZoom(delta: number) {
    const view = mapRef.current?.getView();
    if (!view) return;
    const next = Math.max(5, Math.min(14, (view.getZoom() || 8) + delta));
    view.animate({ zoom: next, duration: 180 });
  }

  function centerPosition() {
    const view = mapRef.current?.getView();
    if (!view) return;
    view.animate({ center: fromLonLat([lon, lat]), zoom: Math.max(8, view.getZoom() || 8), duration: 260 });
    markerRef.current?.setPosition(fromLonLat([lon, lat]));
  }

  return (
    <div className="environment-map-shell">
      <div ref={hostRef} className="environment-map-canvas" aria-label={mode === "wind" ? "Mapa colorido de vento" : "Mapa colorido de clorofila"} />
      <div className="environment-map-controls">
        <button type="button" onClick={() => changeZoom(1)} title="Aumentar zoom"><Plus /></button>
        <button type="button" onClick={() => changeZoom(-1)} title="Diminuir zoom"><Minus /></button>
        <button type="button" onClick={centerPosition} title="Centralizar"><Crosshair /></button>
      </div>
      <div className="environment-map-badge">{mode === "wind" ? "VENTO ATUAL" : "CLOROFILA · SATÉLITE"}</div>
      <div className="environment-map-coordinate">
        <b>{nauticalPart(lat, "S")}</b>
        <b>{nauticalPart(lon, "W")}</b>
      </div>
      <div className="environment-map-zoom">ZOOM {zoom}</div>
      <div className="environment-map-scale">
        <span>{mode === "wind" ? `${fmt(min, 0)} km/h` : `${fmt(min, 2)} mg/m³`}</span>
        <i className={mode === "wind" ? "wind-scale" : "chlorophyll-scale"} />
        <span>{mode === "wind" ? `${fmt(max, 0)} km/h` : `${fmt(max, 2)} mg/m³`}</span>
      </div>
      <small className="environment-map-note">Mapa interpolado a partir dos pontos consultados ao redor da posição. As cores acompanham o mapa durante zoom e movimento.</small>
    </div>
  );
}
