"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Crosshair, History, MapPinned, Minus, Plus, RefreshCw, Search, Ship, Trash2, X } from "lucide-react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from "ol/style";
import { fromLonLat } from "ol/proj";

type Props = { defaultLat?: number | null; defaultLon?: number | null };
type Position = {
  name: string;
  lat: number;
  lon: number;
  positionReceived?: string;
  updateTime?: string;
  dataSource?: string;
  vesselRef: string;
};
type Pricing = { locateCredits: number; updateCredits: number; locateBrl: number; updateBrl: number; adminFree: boolean };
type Wallet = { balance: number; freeAisAccess?: boolean; isSuperAdmin?: boolean };
type HistoryItem = {
  id: number;
  vesselKey: string;
  name: string;
  latitude: number;
  longitude: number;
  positionReceived?: string | null;
  updateTime?: string | null;
  queriedAt: string;
};
type SavedItem = {
  id: number;
  vesselKey: string;
  name: string;
  mmsi?: string | null;
  imo?: string | null;
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  lastPositionReceived?: string | null;
  lastUpdateTime?: string | null;
};
type Pending = { type: "locate" | "update"; name: string; vesselRef?: string } | null;

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function marineCoord(value: number, latitude: boolean) {
  const dir = latitude ? (value < 0 ? "S" : "N") : (value < 0 ? "W" : "E");
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  return `${degrees}°${minutes.toFixed(3).padStart(6, "0")}'${dir}`;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function datePart(position: Position | HistoryItem | SavedItem) {
  const source = "positionReceived" in position ? position.positionReceived : position.lastPositionReceived;
  const fallback = "updateTime" in position ? position.updateTime : position.lastUpdateTime;
  const d = parseDate(source || fallback || null);
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

function timePart(position: Position | HistoryItem | SavedItem) {
  const source = "positionReceived" in position ? position.positionReceived : position.lastPositionReceived;
  const fallback = "updateTime" in position ? position.updateTime : position.lastUpdateTime;
  const d = parseDate(source || fallback || null);
  return d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function AISPage({ defaultLat, defaultLon }: Props) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerSourceRef = useRef<VectorSource | null>(null);
  const trailSourceRef = useRef<VectorSource | null>(null);
  const [query, setQuery] = useState("");
  const [tracked, setTracked] = useState<Position | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [status, setStatus] = useState("Digite o nome do barco para localizar");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const loadBilling = async () => {
    const response = await fetch("/api/ais", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      if (data.wallet) setWallet(data.wallet);
      if (data.pricing) setPricing(data.pricing);
    }
  };

  const loadLibrary = async () => {
    const response = await fetch("/api/ais-library", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setHistory(Array.isArray(data.history) ? data.history : []);
      setSaved(Array.isArray(data.saved) ? data.saved : []);
    }
  };

  useEffect(() => { void Promise.all([loadBilling(), loadLibrary()]); }, []);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;
    const markerSource = new VectorSource();
    const trailSource = new VectorSource();
    markerSourceRef.current = markerSource;
    trailSourceRef.current = trailSource;
    const map = new Map({
      target: mapElement.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        new VectorLayer({ source: trailSource }),
        new VectorLayer({ source: markerSource }),
      ],
      view: new View({ center: fromLonLat([Number(defaultLon ?? -48.55), Number(defaultLat ?? -27.15)]), zoom: 8 }),
      controls: [],
    });
    mapRef.current = map;
    return () => { map.setTarget(undefined); mapRef.current = null; };
  }, [defaultLat, defaultLon]);

  const matchingHistory = useMemo(() => {
    if (!tracked) return [];
    const name = tracked.name.toUpperCase();
    return history.filter((item) => item.name.toUpperCase() === name || item.vesselKey === tracked.vesselRef).slice().reverse();
  }, [history, tracked]);

  function draw(position: Position, withTrail = true) {
    const markerSource = markerSourceRef.current;
    const trailSource = trailSourceRef.current;
    if (!markerSource || !trailSource) return;
    markerSource.clear();
    trailSource.clear();
    const feature = new Feature({ geometry: new Point(fromLonLat([position.lon, position.lat])) });
    feature.setStyle(new Style({
      image: new CircleStyle({ radius: 10, fill: new Fill({ color: "#20d8ad" }), stroke: new Stroke({ color: "#062c31", width: 4 }) }),
      text: new Text({ text: position.name, offsetY: -22, font: "700 13px sans-serif", fill: new Fill({ color: "#ffffff" }), stroke: new Stroke({ color: "#062026", width: 4 }) }),
    }));
    markerSource.addFeature(feature);

    if (withTrail) {
      const points = [...matchingHistory.map((item) => fromLonLat([Number(item.longitude), Number(item.latitude)])), fromLonLat([position.lon, position.lat])];
      if (points.length >= 2) {
        const line = new Feature({ geometry: new LineString(points) });
        line.setStyle(new Style({ stroke: new Stroke({ color: "#20d8ad", width: 3, lineDash: [8, 6] }) }));
        trailSource.addFeature(line);
      }
    }
    mapRef.current?.getView().animate({ center: fromLonLat([position.lon, position.lat]), zoom: 12, duration: 450 });
  }

  useEffect(() => { if (tracked) draw(tracked); }, [tracked, matchingHistory.length]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!pricing || !wallet) { setNotice("Aguarde o sistema carregar o valor oficial da consulta."); return; }
    const name = query.trim();
    if (name.length < 2) { setNotice("Digite o nome da embarcação."); return; }
    setNotice("");
    setPending({ type: "locate", name });
  }

  async function executePending() {
    if (!pending || loading) return;
    const action = pending;
    setPending(null);
    setLoading(true);
    setNotice("");
    setStatus(action.type === "update" ? "Atualizando posição..." : "Localizando embarcação...");
    try {
      const response = await fetch("/api/ais", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: action.type, name: action.name, vesselRef: action.vesselRef }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(data?.error || "Não foi possível consultar a posição.");
      const vessel = data.vessel as Position;
      setTracked(vessel);
      setQuery(vessel.name || action.name);
      const nextBalance = Number(data?.billing?.balance ?? wallet?.balance ?? 0);
      setWallet((current) => ({ ...(current || { balance: 0 }), balance: nextBalance }));
      window.dispatchEvent(new CustomEvent("painel-billing-changed", { detail: { balance: nextBalance } }));
      setStatus(data?.billing?.free ? "GRÁTIS — ADMIN" : `${vessel.name} localizado`);
      await loadLibrary();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao consultar o AIS.");
      setStatus("Consulta não concluída");
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrent() {
    if (!tracked || saving) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/ais-library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          vessel: {
            name: tracked.name,
            mmsi: tracked.vesselRef,
            lat: tracked.lat,
            lon: tracked.lon,
            positionReceived: tracked.positionReceived,
            updateTime: tracked.updateTime,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível salvar o barco.");
      setNotice("Barco salvo na sua pasta.");
      await loadLibrary();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar o barco.");
    } finally { setSaving(false); }
  }

  function openHistory(item: HistoryItem) {
    const p: Position = {
      name: item.name,
      lat: Number(item.latitude),
      lon: Number(item.longitude),
      positionReceived: item.positionReceived || undefined,
      updateTime: item.updateTime || undefined,
      vesselRef: item.vesselKey || item.name,
    };
    setTracked(p);
    setQuery(item.name);
    setStatus("Posição aberta do histórico — 0 créditos");
  }

  function openSaved(item: SavedItem) {
    if (item.lastLatitude == null || item.lastLongitude == null) return;
    const ref = String(item.mmsi || item.imo || item.vesselKey).replace(/\D/g, "");
    setTracked({
      name: item.name,
      lat: Number(item.lastLatitude),
      lon: Number(item.lastLongitude),
      positionReceived: item.lastPositionReceived || undefined,
      updateTime: item.lastUpdateTime || undefined,
      vesselRef: ref,
    });
    setQuery(item.name);
    setStatus("Barco salvo aberto — 0 créditos");
  }

  async function clearHistory() {
    if (!confirm("Limpar todo o seu histórico AIS?")) return;
    await fetch("/api/ais-library?type=history", { method: "DELETE" });
    setHistory([]);
    setShowHistory(false);
    trailSourceRef.current?.clear();
  }

  const currentCost = pricing ? (pending?.type === "update" ? pricing.updateCredits : pricing.locateCredits) : 0;
  const currentBrl = pricing ? (pending?.type === "update" ? pricing.updateBrl : pricing.locateBrl) : 0;
  const afterBalance = Math.max(0, (wallet?.balance || 0) - currentCost);

  return (
    <section className="ais76-page">
      <div className="ais76-head">
        <div><small>MONITORAMENTO MARÍTIMO</small><h2>AIS — consulta simples</h2><p>Nome do barco, posição, data e hora. Sem atualização automática.</p></div>
        <button className="ais76-wallet" type="button"><span>MEUS CRÉDITOS</span><b>{!wallet ? "Carregando..." : wallet.freeAisAccess ? "GRÁTIS — ADMIN" : `${wallet.balance} créditos`}</b></button>
      </div>

      <form className="ais76-search" onSubmit={submit}>
        <label><span>NOME DO BARCO</span><div><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite o nome da embarcação" autoComplete="off" /></div></label>
        <button type="submit" disabled={loading || !pricing}>{loading ? <RefreshCw className="spin" /> : <MapPinned />} {!pricing ? "CARREGANDO VALOR..." : pricing.adminFree ? "LOCALIZAR BARCO — GRÁTIS" : `LOCALIZAR BARCO — ${pricing.locateCredits} CRÉDITOS`}</button>
        {pricing && !pricing.adminFree && <small>{pricing.locateCredits} créditos = {brl(pricing.locateBrl)}</small>}
      </form>

      {notice && <div className="ais76-notice">{notice}</div>}
      <div className="ais76-status">{status}</div>

      <div className="ais76-folders">
        <details>
          <summary><Bookmark /> Barcos salvos <em>{saved.length}</em></summary>
          <div className="ais76-mini-list">{saved.length ? saved.slice(0, 12).map((item) => <button key={item.id} type="button" onClick={() => openSaved(item)}><Ship /><span><b>{item.name}</b><small>{item.lastLatitude == null ? "Sem posição salva" : `${marineCoord(Number(item.lastLatitude), true)} · ${marineCoord(Number(item.lastLongitude), false)}`}</small></span></button>) : <p>Nenhum barco salvo.</p>}</div>
        </details>
        <details open={showHistory} onToggle={(e) => setShowHistory((e.currentTarget as HTMLDetailsElement).open)}>
          <summary><History /> Meu histórico AIS <em>{history.length}</em></summary>
          <div className="ais76-history-actions"><button type="button" onClick={clearHistory}><Trash2 /> Limpar histórico</button></div>
          <div className="ais76-mini-list">{history.length ? history.slice(0, 20).map((item) => <button key={item.id} type="button" onClick={() => openHistory(item)}><History /><span><b>{item.name}</b><small>{marineCoord(Number(item.latitude), true)} · {marineCoord(Number(item.longitude), false)} · {datePart(item)} {timePart(item)}</small></span></button>) : <p>Histórico vazio.</p>}</div>
        </details>
      </div>

      <div className="ais76-map-wrap">
        <div ref={mapElement} className="ais76-map" />
        <div className="ais76-map-controls">
          <button type="button" onClick={() => mapRef.current?.getView().setZoom((mapRef.current.getView().getZoom() || 8) + 1)}><Plus /></button>
          <button type="button" onClick={() => mapRef.current?.getView().setZoom((mapRef.current.getView().getZoom() || 8) - 1)}><Minus /></button>
          {tracked && <button type="button" onClick={() => draw(tracked)}><Crosshair /></button>}
        </div>
      </div>

      {tracked && (
        <article className="ais76-result">
          <div className="ais76-result-title"><Ship /><div><small>EMBARCAÇÃO LOCALIZADA</small><h3>{tracked.name}</h3></div></div>
          <div className="ais76-position"><span>📍 POSIÇÃO</span><b>{marineCoord(tracked.lat, true)}</b><b>{marineCoord(tracked.lon, false)}</b></div>
          <div className="ais76-date-row"><div><span>📅 DATA</span><b>{datePart(tracked)}</b></div><div><span>🕒 HORA</span><b>{timePart(tracked)}</b></div></div>
          <div className="ais76-result-actions">
            <button type="button" onClick={() => draw(tracked)}><MapPinned /> VER NO MAPA</button>
            <button type="button" disabled={!pricing} onClick={() => setPending({ type: "update", name: tracked.name, vesselRef: tracked.vesselRef })}><RefreshCw /> {!pricing ? "CARREGANDO VALOR..." : pricing.adminFree ? "ATUALIZAR — GRÁTIS" : `ATUALIZAR POSIÇÃO — ${pricing.updateCredits} CRÉDITOS`}</button>
            <button type="button" onClick={() => setShowHistory(true)}><History /> VER HISTÓRICO</button>
            <button type="button" onClick={saveCurrent} disabled={saving}><Bookmark /> {saving ? "SALVANDO..." : "SALVAR BARCO"}</button>
          </div>
        </article>
      )}

      {pending && (
        <div className="ais76-confirm-overlay" onMouseDown={() => setPending(null)}>
          <section onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" type="button" onClick={() => setPending(null)}><X /></button>
            <small>{pending.type === "update" ? "NOVA CONSULTA AIS" : "LOCALIZAR EMBARCAÇÃO"}</small>
            <h3>{pending.name}</h3>
            {pricing?.adminFree ? <div className="ais76-free">GRÁTIS — ADMIN</div> : <>
              <div className="ais76-confirm-cost"><span>Custo</span><b>{currentCost} créditos</b><em>{brl(currentBrl)}</em></div>
              <div className="ais76-balance-preview"><span>Saldo atual <b>{wallet?.balance ?? "—"}</b></span><span>Saldo após consulta <b>{wallet ? afterBalance : "—"}</b></span></div>
            </>}
            <div className="ais76-confirm-actions"><button type="button" className="secondary" onClick={() => setPending(null)}>CANCELAR</button><button type="button" className="primary" onClick={executePending}>LOCALIZAR</button></div>
          </section>
        </div>
      )}
    </section>
  );
}
