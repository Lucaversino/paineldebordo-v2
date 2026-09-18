"use client";

import { useMemo, useState } from "react";
import {
  Compass,
  Download,
  Droplets,
  Gauge,
  LocateFixed,
  Navigation,
  RefreshCw,
  Share2,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import { createPositionForecastPdf, downloadPositionForecastPdf } from "../lib/positionForecastPdf";
import NauticalMap from "./NauticalMap";

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

function CoordinateField({ label, direction, value, onChange }: {
  label: string;
  direction: "S" | "W";
  value: string;
  onChange: (value: string) => void;
}) {
  const display = value ? `${value.slice(0, 2)}${value.length > 2 ? "º" : ""}${value.slice(2)} ${direction}` : "";
  return (
    <label className="position-coordinate">
      <span>{label} <small>{direction === "S" ? "Sul" : "Oeste"}</small></span>
      <input
        inputMode="numeric"
        autoComplete="off"
        value={display}
        placeholder={direction === "S" ? "252178" : "474769"}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <em>Digite somente números</em>
    </label>
  );
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

export default function PositionForecast() {
  const [latDigits, setLatDigits] = useState("");
  const [lonDigits, setLonDigits] = useState("");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [error, setError] = useState("");
  const [mapMode, setMapMode] = useState<"wind" | "chlorophyll">("wind");

  const lat = digitsToDecimal(latDigits, "S");
  const lon = digitsToDecimal(lonDigits, "W");

  async function consult() {
    if (lat == null || lon == null) {
      setError("Confira latitude e longitude. Exemplo: 252178 / 474769.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/position-forecast?lat=${lat}&lon=${lon}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Falha na consulta.");
      setData(json);
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
    try {
      const response = await fetch("/api/ocean-intelligence", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const json = await response.json();
      const position = json?.environment?.position;
      if (!position) throw new Error("Ainda não há posição registrada nas largadas.");
      setLatDigits(decimalToDigits(Number(position.lat)));
      setLonDigits(decimalToDigits(Number(position.lon)));
      const forecastResponse = await fetch(`/api/position-forecast?lat=${Number(position.lat)}&lon=${Number(position.lon)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const forecastJson = await forecastResponse.json().catch(() => ({}));
      if (!forecastResponse.ok) throw new Error(forecastJson.error || "Falha na consulta.");
      setData(forecastJson);
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      setError(timedOut ? "A consulta da última largada demorou demais. Tente novamente." : (e instanceof Error ? e.message : "Não foi possível carregar a última posição."));
    } finally {
      setBusy(false);
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
        `Posição: ${Math.abs(Number(data.position.lat)).toFixed(4)}° S / ${Math.abs(Number(data.position.lon)).toFixed(4)}° W`,
        `Vento: ${fmt(data.current.windSpeedKmh)} km/h ${data.current.windDirection} | rajadas ${fmt(data.current.gustKmh)} km/h`,
        `Ondas: ${fmt(data.current.waveHeightM)} m ${data.current.waveDirection} | período ${fmt(data.current.wavePeriodS)} s`,
        `Maré modelada: ${fmt(data.current.seaLevelMslM, 2)} m`,
        `Temperatura do mar: ${fmt(data.current.seaTemperatureC)} °C`,
        `Clorofila-a: ${fmt(data.current.chlorophyllMgM3, 2)} mg/m³`,
      ].join("\n");

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
          <p>Consulte uma posição por latitude e longitude. Previsão profissional sem complicação.</p>
        </div>
        <div className="position-title-badge"><Compass /> PREVISÃO POR POSIÇÃO</div>
      </div>

      <div className="position-search-card">
        <div className="position-search-head">
          <div><LocateFixed /><span><b>Informe a posição</b><small>Mesmo formato usado nas largadas</small></span></div>
        </div>
        <div className="position-coordinate-grid">
          <CoordinateField label="Latitude" direction="S" value={latDigits} onChange={setLatDigits} />
          <CoordinateField label="Longitude" direction="W" value={lonDigits} onChange={setLonDigits} />
        </div>
        <div className="position-search-actions">
          <button className="position-consult" onClick={consult} disabled={busy}>{busy ? <RefreshCw className="spin" /> : <Navigation />} {busy ? "CONSULTANDO..." : "CONSULTAR PREVISÃO"}</button>
          <button className="position-last" onClick={useLastSet} disabled={busy}>Usar última largada</button>
        </div>
        {error && <p className="position-error">{error}</p>}
      </div>

      {!data ? (
        <div className="position-empty">
          <Wind />
          <h3>Digite uma posição para começar</h3>
          <p>O painel mostrará vento, rajadas, ondas por horário, maré modelada, temperatura do mar, corrente e clorofila.</p>
        </div>
      ) : (
        <>
          <div className="position-current-head">
            <div><small>CONDIÇÕES AGORA</small><h3>{Math.abs(data.position.lat).toFixed(4)}° S · {Math.abs(data.position.lon).toFixed(4)}° W</h3></div>
            <div className="position-current-actions">
              <button onClick={exportPdf}><Download /> Exportar PDF</button>
              <button onClick={shareWhatsApp} disabled={shareBusy}><Share2 /> {shareBusy ? "Compartilhando..." : "WhatsApp"}</button>
              <span className={`condition-pill ${String(data.current.condition || "").toLowerCase().replace(" ", "-")}`}>{data.current.condition}</span>
            </div>
          </div>

          <div className="position-kpis">
            <article><Wind /><small>VENTO</small><strong>{fmt(data.current.windSpeedKmh)} km/h</strong><b>{data.current.windDirection} · {fmt(data.current.windDirectionDeg, 0)}°</b><span>Rajadas {fmt(data.current.gustKmh)} km/h</span></article>
            <article><Waves /><small>MAR / ONDA</small><strong>{fmt(data.current.waveHeightM)} m</strong><b>{data.current.waveDirection}</b><span>Período {fmt(data.current.wavePeriodS)} s · swell {fmt(data.current.swellHeightM)} m</span></article>
            <article><Gauge /><small>MARÉ MODELADA</small><strong>{fmt(data.current.seaLevelMslM, 2)} m</strong><b>{data.tide.extrema?.[0] ? (data.tide.extrema[0].type === "HIGH" ? "Próxima alta" : "Próxima baixa") : "Sem pico detectado"}</b><span>{data.tide.extrema?.[0] ? `${shortTime(data.tide.extrema[0].time)} · ${fmt(data.tide.extrema[0].height, 2)} m` : "Janela atual sem extremo claro"}</span></article>
            <article><Thermometer /><small>TEMPERATURA DO MAR</small><strong>{fmt(data.current.seaTemperatureC)} °C</strong><b>Superfície</b><span>Corrente {fmt(data.current.currentKmh)} km/h · {data.current.currentDirection}</span></article>
            <article><Droplets /><small>CLOROFILA-A</small><strong>{fmt(data.current.chlorophyllMgM3, 2)} mg/m³</strong><b>Satélite VIIRS</b><span>{data.current.chlorophyllTime ? String(data.current.chlorophyllTime).slice(0, 10) : "Sem leitura"}</span></article>
          </div>

          <article className="position-panel hourly-panel">
            <div className="position-panel-title hourly-title">
              <div><small>PRÓXIMAS HORAS</small><h3>Vento, ondas e maré por horário</h3><p>Até 72 horas · intervalos de 3 horas · tudo visível no desktop</p></div>
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
                    <div className="hourly-icon"><Gauge /></div>
                    <span>MARÉ MODELADA</span>
                    <strong>{fmt(item.seaLevelMslM, 2)} <small>m</small></strong>
                    <em>Temp. {fmt(item.seaTemperatureC)} °C</em>
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
    </section>
  );
}
