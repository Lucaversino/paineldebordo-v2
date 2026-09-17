"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Minus, Plus } from "lucide-react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import Overlay from "ol/Overlay";
import { fromLonLat } from "ol/proj";

const OCEAN_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}";
const SEAMARK_TILES = "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png";

type Props = {
  lat: number;
  lon: number;
};

export default function NauticalMap({ lat, lon }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Overlay | null>(null);
  const [zoom, setZoom] = useState(10);

  useEffect(() => {
    if (!hostRef.current || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const marker = document.createElement("div");
    marker.className = "nautical-position-marker";
    marker.innerHTML = '<span></span><i>POSIÇÃO ANALISADA</i>';

    const markerOverlay = new Overlay({
      element: marker,
      positioning: "center-center",
      stopEvent: false,
    });

    const view = new View({
      center: fromLonLat([lon, lat]),
      zoom: 10,
      minZoom: 3,
      maxZoom: 16,
      constrainResolution: true,
    });

    const map = new Map({
      target: hostRef.current,
      controls: [],
      layers: [
        new TileLayer({
          source: new XYZ({
            url: OCEAN_TILES,
            crossOrigin: "anonymous",
            attributions: "Esri · GEBCO · NOAA e outros provedores",
          }),
        }),
        new TileLayer({
          opacity: 0.95,
          source: new XYZ({
            url: SEAMARK_TILES,
            crossOrigin: "anonymous",
            maxZoom: 18,
            attributions: "OpenSeaMap",
          }),
        }),
      ],
      overlays: [markerOverlay],
      view,
    });

    markerOverlay.setPosition(fromLonLat([lon, lat]));
    const onResolution = () => setZoom(Math.round(view.getZoom() || 10));
    view.on("change:resolution", onResolution);

    mapRef.current = map;
    markerRef.current = markerOverlay;
    setZoom(Math.round(view.getZoom() || 10));

    const ro = new ResizeObserver(() => map.updateSize());
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      view.un("change:resolution", onResolution);
      map.setTarget(undefined);
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [lat, lon]);

  function changeZoom(delta: number) {
    const view = mapRef.current?.getView();
    if (!view) return;
    const next = Math.max(3, Math.min(16, (view.getZoom() || 10) + delta));
    view.animate({ zoom: next, duration: 180 });
  }

  function centerPosition() {
    const view = mapRef.current?.getView();
    if (!view) return;
    view.animate({ center: fromLonLat([lon, lat]), zoom: Math.max(10, view.getZoom() || 10), duration: 300 });
    markerRef.current?.setPosition(fromLonLat([lon, lat]));
  }

  return (
    <article className="position-panel nautical-map-panel">
      <div className="position-panel-title nautical-map-title">
        <div>
          <small>CARTA NÁUTICA</small>
          <h3>Posição analisada na carta oceânica</h3>
          <p>Batimetria, curvas de profundidade e sinais náuticos quando disponíveis na região.</p>
        </div>
        <span>Zoom {zoom}</span>
      </div>

      <div className="nautical-map-shell">
        <div ref={hostRef} className="nautical-map-canvas" aria-label="Carta náutica da posição consultada" />
        <div className="nautical-map-controls" aria-label="Controles do mapa">
          <button type="button" onClick={() => changeZoom(1)} title="Aumentar zoom"><Plus /></button>
          <button type="button" onClick={() => changeZoom(-1)} title="Diminuir zoom"><Minus /></button>
          <button type="button" onClick={centerPosition} title="Centralizar na posição"><Crosshair /></button>
        </div>
        <div className="nautical-map-coordinate">
          <b>POSIÇÃO</b>
          <span>{Math.abs(lat).toFixed(4)}° S · {Math.abs(lon).toFixed(4)}° W</span>
        </div>
      </div>

      <div className="nautical-map-footer">
        <span><i className="nautical-depth-dot" /> Profundidades/curvas: carta oceânica Esri/GEBCO</span>
        <span><i className="nautical-seamark-dot" /> Sinais náuticos: OpenSeaMap</span>
      </div>
      <small className="nautical-warning">Carta de apoio visual. A cobertura e a precisão variam por região; não usar como única referência para navegação.</small>
    </article>
  );
}
