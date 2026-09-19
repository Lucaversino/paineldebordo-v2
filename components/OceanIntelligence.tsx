"use client";

import { useEffect, useState } from "react";
import { Activity, BrainCircuit, Crosshair, Droplets, MapPin, MoonStar, Pencil, RefreshCw, RotateCcw, Thermometer, Waves, Wind, X } from "lucide-react";

const n = (v: any, d = 1) => v == null || Number.isNaN(Number(v)) ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v));
const tm = (v?: string | null) => v ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

const toKnots = (kmh: any) => {
  const value = Number(kmh);
  return Number.isFinite(value) ? value / 1.852 : null;
};

function currentFlow(speedKmh: any, directionDeg: any) {
  const knots = toKnots(speedKmh);
  const deg = Number(directionDeg);
  if (knots == null || !Number.isFinite(deg)) {
    return { knots, label: "DIREÇÃO INDISPONÍVEL", cardinal: "—", northSouthKnots: null };
  }

  const normalized = ((deg % 360) + 360) % 360;
  const northSouth = knots * Math.cos(normalized * Math.PI / 180);
  const eastWest = knots * Math.sin(normalized * Math.PI / 180);
  const absNorthSouth = Math.abs(northSouth);
  const absEastWest = Math.abs(eastWest);
  const cardinalPoints = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  const cardinal = cardinalPoints[Math.round(normalized / 45) % 8];

  const label = absNorthSouth < Math.max(0.05, knots * 0.2) && absEastWest > absNorthSouth
    ? `VAI MAIS PARA ${eastWest >= 0 ? "LESTE" : "OESTE"}`
    : `VAI PARA ${northSouth >= 0 ? "NORTE" : "SUL"}`;

  return { knots, label, cardinal, northSouthKnots: absNorthSouth };
}

function formatDmm(value: any, axis: "lat" | "lon") {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return "—";
  const abs = Math.abs(raw);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  const hemi = axis === "lat" ? (raw < 0 ? "S" : "N") : (raw < 0 ? "W" : "E");
  const degreeWidth = axis === "lon" ? 3 : 2;
  return `${String(degrees).padStart(degreeWidth, "0")}º ${minutes.toFixed(3).replace(".", ",")} ${hemi}`;
}

function quickCoordinateDigits(value: any) {
  const raw = String(value ?? "").replace(/\D/g, "").slice(0, 6);
  return raw;
}

function quickCoordinateDisplay(value: any, direction: "S" | "W" | "N" | "E") {
  const digits = quickCoordinateDigits(value);
  if (!digits) return "";
  const degrees = digits.slice(0, 2);
  const minutes = digits.slice(2);
  return `${degrees}${digits.length > 2 ? "º " : ""}${minutes}${digits.length >= 2 ? ` ${direction}` : ""}`;
}

function decimalToQuickCoordinate(value: any, axis: "lat" | "lon") {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return "";
  const abs = Math.abs(raw);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  const digits = `${String(degrees).padStart(2, "0")}${String(Math.round(minutes * 100)).padStart(4, "0").slice(0, 4)}`;
  return digits;
}

function parseMarineCoordinate(input: string, axis: "lat" | "lon") {
  const original = input.trim().toUpperCase();
  if (!original) return null;
  const hemiMatch = original.match(/[NSEW]/);
  const hemi = hemiMatch?.[0] || null;
  const cleaned = original
    .replace(/,/g, ".")
    .replace(/[NSEWº°'’\"]+/g, " ")
    .trim();
  const pieces = cleaned.split(/\s+/).filter(Boolean);
  let value: number;

  const compact = cleaned.replace(/\D/g, "");
  if (/^\d{6}$/.test(compact)) {
    const deg = Number(compact.slice(0, 2));
    const minutes = Number(`${compact.slice(2, 4)}.${compact.slice(4)}`);
    if (!Number.isFinite(deg) || !Number.isFinite(minutes) || minutes >= 60) return null;
    value = deg + minutes / 60;
  } else if (pieces.length >= 2) {
    const deg = Number(pieces[0]);
    let minutesText = pieces[1];
    let minutes = Number(minutesText);
    // Formato rápido: 25º 4565 S = 25º 45,65' S.
    if (!minutesText.includes(".") && /^\d{3,5}$/.test(minutesText) && minutes >= 60) {
      minutes = Number(`${minutesText.slice(0, 2)}.${minutesText.slice(2)}`);
    }
    if (!Number.isFinite(deg) || !Number.isFinite(minutes) || minutes < 0 || minutes >= 60) return null;
    value = Math.abs(deg) + minutes / 60;
  } else {
    value = Math.abs(Number(cleaned));
    if (!Number.isFinite(value)) return null;
  }

  const max = axis === "lat" ? 90 : 180;
  if (value > max) return null;
  const negative = hemi ? hemi === "S" || hemi === "W" : true;
  return negative ? -value : value;
}

type ManualPosition = { lat: number; lon: number } | null;

export default function OceanIntelligence() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [manualPosition, setManualPosition] = useState<ManualPosition>(null);
  const [positionEditor, setPositionEditor] = useState(false);
  const [latInput, setLatInput] = useState("");
  const [lonInput, setLonInput] = useState("");
  const [positionError, setPositionError] = useState("");
  const [locating, setLocating] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("");

  const loadOcean = async (manual = false, override?: ManualPosition) => {
    if (manual) setRefreshing(true);
    try {
      const point = override === undefined ? manualPosition : override;
      const params = point ? `?lat=${encodeURIComponent(point.lat)}&lon=${encodeURIComponent(point.lon)}` : "";
      const response = await fetch(`/api/ocean-intelligence${params}`, { cache: "no-store", signal: AbortSignal.timeout(9000) });
      if (response.ok) setData(await response.json());
    } catch {
      // O Dashboard continua utilizável mesmo se uma fonte oceânica estiver lenta.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let savedPoint: ManualPosition = null;
    try {
      const saved = sessionStorage.getItem("ocean-analysis-position-v90");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lon)) {
          savedPoint = { lat: parsed.lat, lon: parsed.lon };
          setManualPosition(savedPoint);
        }
      }
    } catch {}
    const timer = window.setTimeout(() => void loadOcean(false, savedPoint), 1400);
    return () => window.clearTimeout(timer);
    // O carregamento inicial usa a posição automática ou a posição manual desta sessão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPositionEditor = () => {
    const p = data?.environment?.position;
    setLatInput(p?.lat != null ? decimalToQuickCoordinate(p.lat, "lat") : "");
    setLonInput(p?.lon != null ? decimalToQuickCoordinate(p.lon, "lon") : "");
    setPositionError("");
    setGpsStatus("");
    setPositionEditor(true);
  };

  const updateQuickCoordinate = (raw: string, axis: "lat" | "lon") => {
    const digits = quickCoordinateDigits(raw);
    if (axis === "lat") setLatInput(digits);
    else setLonInput(digits);
    setPositionError("");
    setGpsStatus("");
  };

  const useCurrentGpsPosition = () => {
    setPositionError("");
    setGpsStatus("");

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPositionError("GPS/localização não está disponível neste aparelho ou navegador.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setLatInput(decimalToQuickCoordinate(latitude, "lat"));
        setLonInput(decimalToQuickCoordinate(longitude, "lon"));
        setGpsStatus(`GPS capturado · precisão aproximada ±${Math.round(accuracy || 0)} m`);
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setPositionError("Localização bloqueada. Permita o acesso ao GPS para este site e tente novamente.");
        } else if (error.code === error.TIMEOUT) {
          setPositionError("O GPS demorou para responder. Vá para uma área com melhor sinal e tente novamente.");
        } else {
          setPositionError("Não foi possível obter a localização atual do celular.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  const applyPosition = async () => {
    const lat = parseMarineCoordinate(latInput, "lat");
    const lon = parseMarineCoordinate(lonInput, "lon");
    if (lat == null || lon == null) {
      setPositionError("Confira a posição. Exemplo: 25º 4565 S e 46º 3545 W.");
      return;
    }
    const point = { lat, lon };
    setManualPosition(point);
    try { sessionStorage.setItem("ocean-analysis-position-v90", JSON.stringify(point)); } catch {}
    setPositionEditor(false);
    await loadOcean(true, point);
  };

  const resetPosition = async () => {
    setManualPosition(null);
    try { sessionStorage.removeItem("ocean-analysis-position-v90"); } catch {}
    setPositionEditor(false);
    await loadOcean(true, null);
  };

  if (loading) return <section className="ocean-intel loading"><div><BrainCircuit /><b>INTELIGÊNCIA OCEÂNICA</b></div><p>O painel principal já está pronto. Carregando dados oceânicos em segundo plano…</p></section>;
  if (!data) return <section className="ocean-intel loading"><div><BrainCircuit /><b>INTELIGÊNCIA OCEÂNICA</b></div><p>Dados oceânicos indisponíveis agora. O restante do painel continua funcionando.</p><button type="button" onClick={() => void loadOcean(true)}><RefreshCw className={refreshing ? "spin" : ""}/> Tentar novamente</button></section>;

  const e = data.environment;
  const a = data.analysis;
  const positionLabel = e?.position?.source === "MANUAL"
    ? "POSIÇÃO MANUAL"
    : e?.position?.source === "FIRST_SET_LATEST_DAY"
      ? "1ª POSIÇÃO DO ÚLTIMO DIA"
      : "1ª POSIÇÃO DA LARGADA DE HOJE";

  return <section className="ocean-intel">
    <div className="ocean-head"><div><BrainCircuit/><span><small>ASSISTENTE DE PESCA</small><b>Inteligência oceânica + análise das largadas</b></span></div><div className="ocean-head-actions"><button type="button" onClick={() => void loadOcean(true)} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""}/> Atualizar</button><em>confiança {a.confidence}</em></div></div>

    {e?.position && <div className="ocean-position-bar">
      <div className="ocean-position-icon"><MapPin/></div>
      <div className="ocean-position-copy">
        <small>{positionLabel}{e.position.setNumber != null ? ` • LARGADA #${e.position.setNumber}` : ""}</small>
        <b>{formatDmm(e.position.lat, "lat")} <span>/</span> {formatDmm(e.position.lon, "lon")}</b>
      </div>
      <div className="ocean-position-actions">
        <button type="button" onClick={openPositionEditor}><Pencil/> Alterar posição</button>
        {e.position.source === "MANUAL" && <button type="button" className="secondary" onClick={() => void resetPosition()}><RotateCcw/> Usar 1ª largada</button>}
      </div>
    </div>}

    {!e ? <div className="ocean-empty ocean-empty-position"><span>Registre uma largada com coordenadas para usar automaticamente a primeira posição do dia.</span><button type="button" onClick={openPositionEditor}><MapPin/> Alterar posição para analisar</button></div> : <>
      <div className="ocean-grid">
        <article><MoonStar/><small>LUA AGORA</small><b>{e.lunar.name}</b><span>{n(e.lunar.illumination * 100,0)}% iluminada</span><i>Nasce {tm(e.lunar.moonrise)} • põe {tm(e.lunar.moonset)}</i></article>
        <article><Wind/><small>VENTO</small><b>{n(e.wind?.speedKmh)} km/h</b><span>Direção: {e.wind?.direction || "—"}{e.wind?.directionDeg != null ? ` (${n(e.wind.directionDeg,0)}°)` : ""}</span><i>Rajadas {n(e.wind?.gustKmh)} km/h • Atualização {tm(e.wind?.time)}</i></article>
        <article><Waves/><small>MAR / ONDA</small><b>{n(e.sea?.waveHeightM)} m</b><span>Período {n(e.sea?.wavePeriodS)} s • swell {n(e.sea?.swellHeightM)} m</span><i>{e.sea?.time ? `Atualização ${tm(e.sea.time)}` : "Modelo oceânico"}</i></article>
        {(() => {
          const flow = currentFlow(e.sea?.currentKmh, e.sea?.currentDirectionDeg);
          return <article>
            <Droplets/>
            <small>CORRENTE DE MARÉ</small>
            <b>{flow.knots == null ? "—" : `${n(flow.knots,2)} MN/h`}</b>
            <span>{flow.label}{flow.cardinal !== "—" ? ` • ${flow.cardinal} ${n(e.sea?.currentDirectionDeg,0)}°` : ""}</span>
            <i>{flow.knots == null ? "Sem leitura de corrente" : `${n(flow.knots,2)} nós • em 1 h ≈ ${n(flow.knots,2)} milha náutica`}</i>
          </article>;
        })()}
        <article><Thermometer/><small>TEMPERATURA DO MAR</small><b>{n(e.sea?.sstC)} °C</b><span>{e.position.source === "MANUAL" ? "Posição escolhida para análise" : `Ponto da largada #${e.position.setNumber}`}</span><i>{formatDmm(e.position.lat, "lat")} • {formatDmm(e.position.lon, "lon")}</i></article>
        <article><Activity/><small>CLOROFILA-a</small><b>{e.chlorophyll ? `${n(e.chlorophyll.mgM3,2)} mg/m³` : "Sem leitura"}</b><span>{e.chlorophyll ? "Satélite VIIRS" : "Nuvem/grade pode impedir leitura"}</span><i>{e.chlorophyll?.time ? new Date(e.chlorophyll.time).toLocaleDateString("pt-BR") : "NOAA CoastWatch"}</i></article>
      </div>
      <div className="sunline"><span>☀️ Sol nasce <b>{tm(e.sun?.sunrise)}</b></span><span>🌅 Sol se põe <b>{tm(e.sun?.sunset)}</b></span></div>
    </>}
    <div className="ai-analysis"><div><small>ANÁLISE ESTATÍSTICA LOCAL</small><h3>{a.sampleCount} largadas com captura analisadas</h3></div><div className="ai-findings">
      <span><small>Melhor horário observado</small><b>{a.bestHour?.label || "Aguardando dados"}</b><em>{a.bestHour ? `${n(a.bestHour.avgKg,0)} kg/largada • ${a.bestHour.samples} amostras` : ""}</em></span>
      <span><small>Melhor profundidade observada</small><b>{a.bestDepth?.label || "Aguardando dados"}</b><em>{a.bestDepth ? `${n(a.bestDepth.avgKg,0)} kg/largada • ${a.bestDepth.samples} amostras` : ""}</em></span>
      <span><small>Fase lunar com maior média</small><b>{a.bestMoon?.label || "Aguardando dados"}</b><em>{a.bestMoon ? `${n(a.bestMoon.avgKg,0)} kg/largada • ${a.bestMoon.samples} amostras` : ""}</em></span>
    </div><p>{a.notes?.[0]} O sistema mostra tamanho da amostra para evitar conclusões falsas.</p></div>

    {positionEditor && <div className="ocean-position-modal" role="dialog" aria-modal="true" aria-label="Alterar posição da análise">
      <section>
        <button type="button" className="ocean-position-close" onClick={() => setPositionEditor(false)} aria-label="Fechar"><X/></button>
        <small>POSIÇÃO PARA ANÁLISE</small>
        <h3>Alterar posição</h3>
        <p>Digite somente os números, igual à Nova Largada. O painel formata automaticamente em graus/minutos. Ou use o GPS do celular.</p>
        <button type="button" className="ocean-position-gps" onClick={useCurrentGpsPosition} disabled={locating}>
          <Crosshair className={locating ? "spin" : ""}/>
          <span><b>{locating ? "BUSCANDO GPS..." : "USAR LOCALIZAÇÃO ATUAL"}</b><small>Preencher latitude e longitude automaticamente</small></span>
        </button>
        {gpsStatus && <div className="ocean-position-gps-ok">{gpsStatus}</div>}
        <label>LATITUDE
          <input
            type="text"
            value={latInput}
            onChange={e => updateQuickCoordinate(e.target.value, "lat")}
            placeholder="254565"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="off"
          />
          <small className="ocean-position-input-hint">{latInput.length === 6 ? `Formato: ${quickCoordinateDisplay(latInput, "S")}` : "Digite somente números — campo livre para apagar"}</small>
        </label>
        <label>LONGITUDE
          <input
            type="text"
            value={lonInput}
            onChange={e => updateQuickCoordinate(e.target.value, "lon")}
            placeholder="463545"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="off"
          />
          <small className="ocean-position-input-hint">{lonInput.length === 6 ? `Formato: ${quickCoordinateDisplay(lonInput, "W")}` : "Digite somente números — campo livre para apagar"}</small>
        </label>
        {positionError && <div className="ocean-position-error">{positionError}</div>}
        <div className="ocean-position-modal-actions">
          <button type="button" className="secondary" onClick={() => setPositionEditor(false)}>Cancelar</button>
          <button type="button" className="primary" onClick={() => void applyPosition()}>Analisar nesta posição</button>
        </div>
      </section>
    </div>}
  </section>;
}
