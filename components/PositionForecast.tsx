"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Compass,
  Download,
  Droplets,
  Folder,
  Gauge,
  History,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Save,
  Share2,
  Thermometer,
  Trash2,
  Waves,
  Wind,
  X,
} from "lucide-react";
import { createPositionForecastPdf, downloadPositionForecastPdf } from "../lib/positionForecastPdf";
import NauticalMap from "./NauticalMap";

const LAST_FORECAST_KEY = "painel-last-position-forecast-v68";

function digitsToDecimal(raw: string, direction: "S" | "W") {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const degreeLength = 2;
  const degrees = Number(digits.slice(0, degreeLength));
  const minuteDigits = digits.slice(degreeLength);
  const minutes = Number(`${minuteDigits.slice(0, 2)}.${minuteDigits.slice(2) || "0"}`);
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || minutes >= 60) return null;
  return -(degrees + minutes / 60);
}

function decimalToDigits(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  const absolute = Math.abs(Number(value));
  const degrees = Math.floor(absolute);
  const minutes = ((absolute - degrees) * 60).toFixed(2).replace(".", "");
  return `${String(degrees).padStart(2, "0")}${minutes}`;
}

function nauticalPosition(lat: number, lon: number) {
  function part(value: number, direction: "S" | "W") {
    const a = Math.abs(Number(value));
    const deg = Math.floor(a);
    const min = (a - deg) * 60;
    return `${String(deg).padStart(2, "0")}º ${min.toFixed(2)}' ${direction}`;
  }
  return `${part(lat, "S")} · ${part(lon, "W")}`;
}

function CoordinateField({ label, direction, value, onChange }: {
  label: string;
  direction: "S" | "W";
  value: string;
  onChange: (value: string) => void;
}) {
  const preview = value.length === 6
    ? `${value.slice(0, 2)}º ${value.slice(2, 4)},${value.slice(4)}' ${direction}`
    : "";
  return (
    <label className="position-coordinate">
      <span>{label} <small>{direction === "S" ? "Sul" : "Oeste"}</small></span>
      <span className="coord-free-input">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="off"
          value={value}
          placeholder={direction === "S" ? "252178" : "474769"}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <span className="coord-degree" aria-hidden="true">°</span>
      </span>
      <em>{preview ? `Formato: ${preview}` : "Digite somente números — pode apagar e digitar novamente"}</em>
    </label>
  );
}

function toMph(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? number / 1.609344 : null;
}

function fmt(value: any, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function shortTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function fullDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function chlorophyllColor(value: number | null, min: number, max: number) {
  if (value == null || !Number.isFinite(value)) return "hsl(195 25% 16%)";
  const span = Math.max(0.01, max - min);
  const t = Math.max(0, Math.min(1, (value - min) / span));
  const hue = 205 - t * 155;
  return `hsl(${hue} 72% ${34 + t * 12}%)`;
}

function windColor(value: number | null, max: number) {
  if (value == null || !Number.isFinite(value)) return "hsl(195 25% 16%)";
  const t = Math.max(0, Math.min(1, value / Math.max(15, max)));
  const hue = 190 - t * 155;
  return `hsl(${hue} 75% ${34 + t * 10}%)`;
}

function LibraryItem({ item, saved, onOpen, onSave, onDelete }: {
  item: any;
  saved?: boolean;
  onOpen: () => void;
  onSave?: () => void;
  onDelete: () => void;
}) {
  const current = item?.payload?.current || {};
  return (
    <article className="forecast-library-item">
      <div className="forecast-library-main">
        <b>{item.title || (saved ? "Previsão salva" : "Consulta de previsão")}</b>
        <span>{item.positionLabel || nauticalPosition(Number(item.latitude), Number(item.longitude))}</span>
        <small>{fullDateTime(item.createdAt)}</small>
      </div>
      <div className="forecast-library-weather">
        <span><Wind /> {fmt(current.windSpeedKmh, 0)} km/h</span>
        <span><Waves /> {fmt(current.waveHeightM)} m</span>
        <span><Navigation /> {fmt(toMph(current.currentKmh), 2)} mph · {current.currentDirection || "—"}</span>
      </div>
      <div className="forecast-library-actions">
        <button onClick={onOpen}>Abrir</button>
        {!saved && onSave && <button className="save" onClick={onSave}><Bookmark /> Salvar</button>}
        <button className="danger" onClick={onDelete} aria-label="Excluir"><Trash2 /></button>
      </div>
    </article>
  );
}

export default function PositionForecast() {
  const [latDigits, setLatDigits] = useState("");
  const [lonDigits, setLonDigits] = useState("");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mapMode, setMapMode] = useState<"wind" | "chlorophyll">("wind");
  const [history, setHistory] = useState<any[]>([]);
  const [saved, setSaved] = useState<any[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [saveDialog, setSaveDialog] = useState<{ payload: any; latitudeRaw: string; longitudeRaw: string } | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("");

  const lat = digitsToDecimal(latDigits, "S");
  const lon = digitsToDecimal(lonDigits, "W");

  useEffect(() => {
    let restoredLocally = false;
    try {
      const raw = localStorage.getItem(LAST_FORECAST_KEY);
      if (raw) {
        const last = JSON.parse(raw);
        if (last?.payload?.position) {
          setData(last.payload);
          setLatDigits(last.latitudeRaw || decimalToDigits(Number(last.payload.position.lat)));
          setLonDigits(last.longitudeRaw || decimalToDigits(Number(last.payload.position.lon)));
          restoredLocally = true;
        }
      }
    } catch {}

    void (async () => {
      const json = await loadLibrary();
      if (!restoredLocally && json?.history?.[0]?.payload?.position) {
        const last = json.history[0];
        setData(last.payload);
        setLatDigits(last.latitudeRaw || decimalToDigits(Number(last.payload.position.lat)));
        setLonDigits(last.longitudeRaw || decimalToDigits(Number(last.payload.position.lon)));
      }
    })();
  }, []);

  async function loadLibrary() {
    setLibraryBusy(true);
    try {
      const response = await fetch("/api/forecast-library", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const json = await response.json().catch(() => ({}));
      if (response.ok) {
        setHistory(Array.isArray(json.history) ? json.history : []);
        setSaved(Array.isArray(json.saved) ? json.saved : []);
        return json;
      }
    } catch {}
    finally { setLibraryBusy(false); }
    return null;
  }

  async function rememberForecast(payload: any, latitudeRaw: string, longitudeRaw: string) {
    try {
      localStorage.setItem(LAST_FORECAST_KEY, JSON.stringify({ payload, latitudeRaw, longitudeRaw, savedAt: new Date().toISOString() }));
    } catch {}
    try {
      const latitude = Number(payload?.position?.lat);
      const longitude = Number(payload?.position?.lon);
      const response = await fetch("/api/forecast-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "history",
          payload,
          latitude,
          longitude,
          latitudeRaw,
          longitudeRaw,
          positionLabel: nauticalPosition(latitude, longitude),
          source: "Open-Meteo / NOAA",
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.ok && json.history) setHistory((old) => [json.history, ...old.filter((x) => x.id !== json.history.id)].slice(0, 20));
    } catch {}
  }

  function useCurrentLocation() {
    setError("");
    setNotice("");
    setGpsStatus("");

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("GPS/localização não está disponível neste aparelho ou navegador.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        if (latitude >= 0 || longitude >= 0) {
          setLocating(false);
          setError("A localização atual não está no quadrante Sul/Oeste usado por este módulo.");
          return;
        }

        setLatDigits(decimalToDigits(latitude));
        setLonDigits(decimalToDigits(longitude));
        setGpsStatus(`GPS capturado · precisão aproximada ±${Math.round(accuracy || 0)} m`);
        setNotice("Latitude e longitude preenchidas com a localização atual do celular.");
        setLocating(false);
      },
      (geoError) => {
        setLocating(false);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError("Localização bloqueada. Permita o acesso ao GPS para este site e tente novamente.");
        } else if (geoError.code === geoError.TIMEOUT) {
          setError("O GPS demorou para responder. Tente novamente em uma área com melhor sinal.");
        } else {
          setError("Não foi possível obter a localização atual do celular.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }

  async function consult() {
    if (lat == null || lon == null) {
      setError("Confira latitude e longitude. Exemplo: 252178 / 474769.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/position-forecast?lat=${lat}&lon=${lon}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Falha na consulta.");
      setData(json);
      await rememberForecast(json, latDigits, lonDigits);
      setNotice("Previsão carregada e adicionada ao histórico.");
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      setError(timedOut ? "A previsão demorou demais para responder. Tente novamente; o painel não ficará travado." : (e instanceof Error ? e.message : "Não foi possível consultar agora."));
    } finally {
      setBusy(false);
    }
  }

  async function useLastSet() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/ocean-intelligence", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const json = await response.json();
      const position = json?.environment?.position;
      if (!position) throw new Error("Ainda não há posição registrada nas largadas.");
      const nextLat = decimalToDigits(Number(position.lat));
      const nextLon = decimalToDigits(Number(position.lon));
      setLatDigits(nextLat);
      setLonDigits(nextLon);
      const forecastResponse = await fetch(`/api/position-forecast?lat=${Number(position.lat)}&lon=${Number(position.lon)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const forecastJson = await forecastResponse.json().catch(() => ({}));
      if (!forecastResponse.ok) throw new Error(forecastJson.error || "Falha na consulta.");
      setData(forecastJson);
      await rememberForecast(forecastJson, nextLat, nextLon);
      setNotice("Última largada carregada e adicionada ao histórico.");
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      setError(timedOut ? "A consulta da última largada demorou demais. Tente novamente." : (e instanceof Error ? e.message : "Não foi possível carregar a última posição."));
    } finally {
      setBusy(false);
    }
  }

  function clearSearch() {
    setLatDigits("");
    setLonDigits("");
    setError("");
    setNotice("Campos limpos. A previsão atual continua aberta abaixo para você consultar outra posição.");
  }

  function openForecast(item: any) {
    if (!item?.payload?.position) return;
    setData(item.payload);
    setLatDigits(item.latitudeRaw || decimalToDigits(Number(item.payload.position.lat)));
    setLonDigits(item.longitudeRaw || decimalToDigits(Number(item.payload.position.lon)));
    setError("");
    setNotice(item.title ? `Previsão “${item.title}” aberta sem nova consulta.` : "Previsão do histórico aberta sem nova consulta.");
    try {
      localStorage.setItem(LAST_FORECAST_KEY, JSON.stringify({ payload: item.payload, latitudeRaw: item.latitudeRaw, longitudeRaw: item.longitudeRaw, savedAt: new Date().toISOString() }));
    } catch {}
    setTimeout(() => document.querySelector(".position-current-head")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function startSave(payload = data, latitudeRaw = latDigits, longitudeRaw = lonDigits, suggested = "") {
    if (!payload) return;
    setSaveTitle(suggested);
    setSaveDialog({ payload, latitudeRaw, longitudeRaw });
  }

  async function saveForecast() {
    if (!saveDialog || !saveTitle.trim()) return;
    setSaveBusy(true);
    setError("");
    try {
      const latitude = Number(saveDialog.payload?.position?.lat);
      const longitude = Number(saveDialog.payload?.position?.lon);
      const response = await fetch("/api/forecast-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          title: saveTitle.trim(),
          payload: saveDialog.payload,
          latitude,
          longitude,
          latitudeRaw: saveDialog.latitudeRaw,
          longitudeRaw: saveDialog.longitudeRaw,
          positionLabel: nauticalPosition(latitude, longitude),
          source: "Open-Meteo / NOAA",
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Não foi possível salvar.");
      if (json.saved) setSaved((old) => [json.saved, ...old]);
      setSaveDialog(null);
      setSaveTitle("");
      setNotice("Previsão salva com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a previsão.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function deleteLibraryItem(type: "history" | "saved", id: number) {
    try {
      const response = await fetch(`/api/forecast-library?type=${type}&id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      if (type === "history") setHistory((old) => old.filter((x) => x.id !== id));
      else setSaved((old) => old.filter((x) => x.id !== id));
      setNotice(type === "history" ? "Consulta removida do histórico." : "Previsão removida dos salvos.");
    } catch {
      setError("Não foi possível excluir agora.");
    }
  }

  async function clearHistory() {
    if (!history.length) return;
    if (!window.confirm("Limpar todo o histórico de previsões? As previsões salvas não serão apagadas.")) return;
    try {
      const response = await fetch("/api/forecast-library?type=history", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setHistory([]);
      setNotice("Histórico de previsões limpo.");
    } catch {
      setError("Não foi possível limpar o histórico agora.");
    }
  }

  function exportPdf() {
    if (!data) return;
    downloadPositionForecastPdf(data);
  }

  async function shareWhatsApp() {
    if (!data || shareBusy) return;
    setShareBusy(true);
    try {
      const doc = createPositionForecastPdf(data);
      const blob = doc.output("blob");
      const file = new File([blob], `previsao-oceanica-${new Date().toISOString().slice(0, 10)}.pdf`, { type: "application/pdf" });
      const summary = [
        "PAINEL DE BORDO — PREVISÃO OCEÂNICA",
        `Posição: ${nauticalPosition(Number(data.position.lat), Number(data.position.lon))}`,
        data.position?.geography?.label ? `Referência: ${data.position.geography.label}` : null,
        data.position?.depthM != null ? `Profundidade estimada: ${fmt(data.position.depthM, 0)} m (GEBCO_2026)` : null,
        `Vento: ${fmt(data.current.windSpeedKmh)} km/h ${data.current.windDirection} | rajadas ${fmt(data.current.gustKmh)} km/h`,
        `Ondas: ${fmt(data.current.waveHeightM)} m ${data.current.waveDirection} | período ${fmt(data.current.wavePeriodS)} s`,
        `Corrente de maré: ${fmt(toMph(data.current.currentKmh), 2)} mph · ${data.current.currentDirection || "—"}`,
        `Temperatura do mar: ${fmt(data.current.seaTemperatureC)} °C`,
        `Clorofila-a: ${fmt(data.current.chlorophyllMgM3, 2)} mg/m³`,
      ].filter(Boolean).join("\n");

      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      if (navigator.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await navigator.share({ title: "Previsão oceânica", text: summary, files: [file] });
      } else {
        downloadPositionForecastPdf(data);
        window.open(`https://wa.me/?text=${encodeURIComponent(`${summary}\n\nO PDF da previsão foi baixado para anexar na conversa.`)}`, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError("Não foi possível compartilhar agora. Tente exportar o PDF.");
      }
    } finally {
      setShareBusy(false);
    }
  }

  const mapValues = mapMode === "wind" ? data?.maps?.wind || [] : data?.maps?.chlorophyll || [];
  const chlorophyllNumbers = useMemo(() => (data?.maps?.chlorophyll || []).map((x: any) => Number(x.mgM3)).filter(Number.isFinite), [data]);
  const chlMin = chlorophyllNumbers.length ? Math.min(...chlorophyllNumbers) : 0;
  const chlMax = chlorophyllNumbers.length ? Math.max(...chlorophyllNumbers) : 1;
  const windMax = useMemo(() => Math.max(1, ...(data?.maps?.wind || []).map((x: any) => Number(x.speedKmh) || 0)), [data]);

  return (
    <section className="position-forecast-page">
      <div className="position-title">
        <div>
          <small>MÓDULO OCEÂNICO</small>
          <h2>Ventos e Mar</h2>
          <p>Consulte uma posição por latitude e longitude. A última previsão fica aberta e pode ser salva.</p>
        </div>
        <div className="position-title-badge"><Compass /> PREVISÃO POR POSIÇÃO</div>
      </div>

      <div className="position-search-card">
        <div className="position-search-head">
          <div><LocateFixed /><span><b>Informe a posição</b><small>Mesmo formato usado nas largadas</small></span></div>
        </div>
        <div className="position-coordinate-grid">
          <CoordinateField label="Latitude" direction="S" value={latDigits} onChange={(value) => { setLatDigits(value); setGpsStatus(""); setError(""); setNotice(""); }} />
          <CoordinateField label="Longitude" direction="W" value={lonDigits} onChange={(value) => { setLonDigits(value); setGpsStatus(""); setError(""); setNotice(""); }} />
        </div>

        <button type="button" className="position-use-gps" onClick={useCurrentLocation} disabled={busy || locating}>
          <LocateFixed className={locating ? "spin" : ""}/>
          <span>
            <b>{locating ? "BUSCANDO GPS..." : "USAR LOCALIZAÇÃO ATUAL"}</b>
            <small>Preenche latitude e longitude pelo GPS do celular</small>
          </span>
        </button>
        {gpsStatus && <div className="position-gps-status">{gpsStatus}</div>}

        <div className="position-search-actions position-v68-search-actions">
          <button className="position-consult" onClick={consult} disabled={busy || locating}>{busy ? <RefreshCw className="spin" /> : <Navigation />} {busy ? "CONSULTANDO..." : "CONSULTAR PREVISÃO"}</button>
          <button className="position-last" onClick={useLastSet} disabled={busy || locating}>Usar última largada</button>
          <button className="position-clear" onClick={clearSearch} disabled={busy || locating}><X /> Limpar campos</button>
        </div>
        {notice && <p className="position-notice">{notice}</p>}
        {error && <p className="position-error">{error}</p>}
      </div>

      <div className="forecast-library-grid">
        <section className="forecast-library-panel saved-panel">
          <div className="forecast-library-head">
            <div><Folder /><span><small>PASTA</small><b>Previsões salvas</b><em>{saved.length} salva(s)</em></span></div>
            {libraryBusy && <RefreshCw className="spin" />}
          </div>
          <div className="forecast-library-list">
            {saved.map((item) => (
              <LibraryItem key={`saved-${item.id}`} item={item} saved onOpen={() => openForecast(item)} onDelete={() => deleteLibraryItem("saved", item.id)} />
            ))}
            {!saved.length && <div className="forecast-library-empty"><Bookmark /><span>Salve pontos importantes e dê um nome, como “Castilho 35 m” ou “Ponto da corvina”.</span></div>}
          </div>
        </section>

        <section className="forecast-library-panel history-panel">
          <div className="forecast-library-head">
            <div><History /><span><small>CONSULTAS</small><b>Histórico de previsões</b><em>{history.length} de 20</em></span></div>
            <button className="forecast-clear-history" onClick={clearHistory} disabled={!history.length}><Trash2 /> Limpar histórico</button>
          </div>
          <div className="forecast-library-list">
            {history.map((item) => (
              <LibraryItem key={`history-${item.id}`} item={item} onOpen={() => openForecast(item)} onSave={() => startSave(item.payload, item.latitudeRaw || "", item.longitudeRaw || "")} onDelete={() => deleteLibraryItem("history", item.id)} />
            ))}
            {!history.length && <div className="forecast-library-empty"><History /><span>Suas próximas consultas aparecerão aqui automaticamente.</span></div>}
          </div>
        </section>
      </div>

      {!data ? (
        <div className="position-empty">
          <Wind />
          <h3>Digite uma posição para começar</h3>
          <p>O painel mostrará vento, rajadas, ondas por horário, correntes de maré, temperatura do mar e clorofila.</p>
        </div>
      ) : (
        <>
          <div className="position-current-head">
            <div className="position-current-coordinates"><small>CONDIÇÕES AGORA</small><p className="position-nautical-label position-nautical-main">{nauticalPosition(Number(data.position.lat), Number(data.position.lon))}</p></div>
            <div className="position-current-actions">
              <button className="position-save-current" onClick={() => startSave()}><Save /> Salvar previsão</button>
              <button onClick={exportPdf}><Download /> Exportar PDF</button>
              <button onClick={shareWhatsApp} disabled={shareBusy}><Share2 /> {shareBusy ? "Compartilhando..." : "WhatsApp"}</button>
              <span className={`condition-pill ${String(data.current.condition || "").toLowerCase().replace(" ", "-")}`}>{data.current.condition}</span>
            </div>
          </div>

          <div className="position-location-details">
            <article>
              <MapPin />
              <span>
                <small>REFERÊNCIA GEOGRÁFICA</small>
                <b>{data.position?.geography?.label || "Referência indisponível"}</b>
                <em>{data.position?.geography?.distanceKm != null && data.position?.geography?.distanceKm > 1 ? `Aprox. ${fmt(data.position.geography.distanceKm, 1)} km da referência encontrada` : "Cidade/estado mais próximo disponível"}</em>
              </span>
            </article>
            <article>
              <Gauge />
              <span>
                <small>METRAGEM DA POSIÇÃO</small>
                <b>{data.position?.depthM != null ? `${fmt(data.position.depthM, 0)} m` : "Sem leitura"}</b>
                <em>Profundidade estimada · GEBCO_2026</em>
              </span>
            </article>
          </div>

          <div className="position-kpis">
            <article><Wind /><small>VENTO</small><strong>{fmt(data.current.windSpeedKmh)} km/h</strong><b>{data.current.windDirection} · {fmt(data.current.windDirectionDeg, 0)}°</b><span>Rajadas {fmt(data.current.gustKmh)} km/h</span></article>
            <article><Waves /><small>MAR / ONDA</small><strong>{fmt(data.current.waveHeightM)} m</strong><b>{data.current.waveDirection}</b><span>Período {fmt(data.current.wavePeriodS)} s · swell {fmt(data.current.swellHeightM)} m</span></article>
            <article><Navigation /><small>CORRENTE DE MARÉ</small><strong>{fmt(toMph(data.current.currentKmh), 2)} mph</strong><b>{data.current.currentDirection || "—"} · {fmt(data.current.currentDirectionDeg, 0)}°</b><span>milhas por hora · modelo oceânico</span></article>
            <article><Thermometer /><small>TEMPERATURA DO MAR</small><strong>{fmt(data.current.seaTemperatureC)} °C</strong><b>Superfície</b><span>Temperatura superficial modelada</span></article>
            <article><Droplets /><small>CLOROFILA-A</small><strong>{fmt(data.current.chlorophyllMgM3, 2)} mg/m³</strong><b>Satélite VIIRS</b><span>{data.current.chlorophyllTime ? String(data.current.chlorophyllTime).slice(0, 10) : "Sem leitura"}</span></article>
          </div>

          <article className="position-panel hourly-panel">
            <div className="position-panel-title hourly-title">
              <div><small>PRÓXIMAS HORAS</small><h3>Vento, ondas e correntes de maré por horário</h3><p>Até 72 horas · intervalos de 3 horas · tudo visível no desktop</p></div>
              <span>{(data.forecast || []).length} horários</span>
            </div>
            <div className="hourly-forecast-grid">
              {(data.forecast || []).map((item: any, index: number) => (
                <div className="hourly-card" key={`${item.time}-${index}`}>
                  <time>{shortTime(item.time)}</time>
                  <div className="hourly-block wind-block">
                    <div className="hourly-icon"><Wind /></div>
                    <span>VENTO</span>
                    <strong><i className="wind-arrow" style={{ transform: `rotate(${Number(item.windDirectionDeg || 0)}deg)` }}>↑</i>{fmt(item.windSpeedKmh, 0)} <small>km/h</small></strong>
                    <b>{item.windDirection}</b>
                    <em>Rajadas {fmt(item.gustKmh, 0)} km/h</em>
                  </div>
                  <div className="hourly-block wave-block">
                    <div className="hourly-icon"><Waves /></div>
                    <span>ONDA</span>
                    <strong>{fmt(item.waveHeightM)} <small>m</small></strong>
                    <b>{item.waveDirection || "—"}</b>
                    <em>Período {fmt(item.wavePeriodS)} s · swell {fmt(item.swellHeightM)} m</em>
                  </div>
                  <div className="hourly-block tide-block-mini">
                    <div className="hourly-icon"><Navigation /></div>
                    <span>CORRENTE DE MARÉ</span>
                    <strong>{fmt(toMph(item.currentKmh), 2)} <small>mph</small></strong>
                    <b>{item.currentDirection || "—"}</b>
                    <em>milhas/h · {fmt(item.currentDirectionDeg, 0)}°</em>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="position-panel tide-panel tide-panel-wide">
            <div className="position-panel-title"><div><small>NÍVEL DO MAR</small><h3>Próximos picos modelados</h3></div><span>alta e baixa</span></div>
            <div className="tide-peaks-grid">
              {(data.tide.extrema || []).map((item: any, index: number) => (
                <div key={`${item.time}-${index}`}><span className={item.type === "HIGH" ? "tide-high" : "tide-low"}>{item.type === "HIGH" ? "ALTA" : "BAIXA"}</span><b>{shortTime(item.time)}</b><strong>{fmt(item.height, 2)} m</strong></div>
              ))}
              {!data.tide.extrema?.length && <p>Sem picos detectados na janela atual.</p>}
            </div>
            <small className="model-note">Nível do mar modelado. Não usar como referência de navegação costeira.</small>
          </article>

          <article className="position-panel environmental-map-panel">
            <div className="position-panel-title map-title">
              <div><small>MAPA AMBIENTAL</small><h3>Área ao redor da posição</h3><p>Grade simples de aproximadamente 20 km entre pontos.</p></div>
              <div className="map-mode-buttons">
                <button className={mapMode === "wind" ? "active" : ""} onClick={() => setMapMode("wind")}><Wind /> Vento</button>
                <button className={mapMode === "chlorophyll" ? "active" : ""} onClick={() => setMapMode("chlorophyll")}><Droplets /> Clorofila</button>
              </div>
            </div>
            <div className="environment-grid-wrap">
              <div className="north-label">N</div>
              <div className="environment-grid">
                {mapValues.map((item: any, index: number) => {
                  const value = mapMode === "wind" ? Number(item.speedKmh) : Number(item.mgM3);
                  const color = mapMode === "wind" ? windColor(Number.isFinite(value) ? value : null, windMax) : chlorophyllColor(Number.isFinite(value) ? value : null, chlMin, chlMax);
                  const center = item.row === 1 && item.col === 1;
                  return (
                    <div className={`environment-cell ${center ? "center" : ""}`} key={`${item.row}-${item.col}-${index}`} style={{ background: color }}>
                      {center && <i>POSIÇÃO</i>}
                      {mapMode === "wind" ? (
                        <><span className="map-arrow" style={{ transform: `rotate(${Number(item.directionDeg || 0)}deg)` }}>↑</span><strong>{fmt(item.speedKmh, 0)} km/h</strong><small>{item.direction}</small></>
                      ) : (
                        <><Droplets /><strong>{fmt(item.mgM3, 2)}</strong><small>mg/m³</small></>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="map-compass"><span>O</span><b>•</b><span>L</span></div>
              <div className="south-label">S</div>
            </div>
            <div className="map-legend">
              <span>{mapMode === "wind" ? "Menos vento" : "Menor concentração"}</span>
              <i className={mapMode === "wind" ? "wind-scale" : "chlorophyll-scale"} />
              <span>{mapMode === "wind" ? "Mais vento" : "Maior concentração"}</span>
            </div>
          </article>

          <NauticalMap lat={Number(data.position.lat)} lon={Number(data.position.lon)} />

          <div className="position-source-note">
            <b>Fontes:</b> {data.sources.weather} · {data.sources.marine} · {data.sources.chlorophyll} · OpenStreetMap
            <span>{data.disclaimer}</span>
          </div>
        </>
      )}

      {saveDialog && (
        <div className="forecast-save-overlay" role="dialog" aria-modal="true">
          <div className="forecast-save-modal">
            <button className="forecast-save-close" onClick={() => setSaveDialog(null)}><X /></button>
            <div className="forecast-save-icon"><Save /></div>
            <small>SALVAR PREVISÃO</small>
            <h3>Dê um nome para este ponto</h3>
            <p>{nauticalPosition(Number(saveDialog.payload.position.lat), Number(saveDialog.payload.position.lon))}</p>
            <label>
              <span>Nome da previsão</span>
              <input autoFocus maxLength={60} value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} placeholder="Ex.: Corvina Castilho, Ponto 35 m..." onKeyDown={(e) => { if (e.key === "Enter") void saveForecast(); }} />
            </label>
            <div className="forecast-save-actions">
              <button onClick={() => setSaveDialog(null)}>Cancelar</button>
              <button className="primary" onClick={saveForecast} disabled={saveBusy || !saveTitle.trim()}>{saveBusy ? <RefreshCw className="spin" /> : <Save />} {saveBusy ? "Salvando..." : "Salvar previsão"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
