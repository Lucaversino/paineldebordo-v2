"use client";

import { useEffect, useState } from "react";
import { Activity, BrainCircuit, Droplets, MoonStar, RefreshCw, Thermometer, Waves, Wind } from "lucide-react";

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

  // Quando a componente norte/sul é muito pequena, a corrente está praticamente transversal.
  const label = absNorthSouth < Math.max(0.05, knots * 0.2) && absEastWest > absNorthSouth
    ? `VAI MAIS PARA ${eastWest >= 0 ? "LESTE" : "OESTE"}`
    : `VAI PARA ${northSouth >= 0 ? "NORTE" : "SUL"}`;

  return { knots, label, cardinal, northSouthKnots: absNorthSouth };
}

export default function OceanIntelligence() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOcean = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/ocean-intelligence", { cache: "no-store", signal: AbortSignal.timeout(9000) });
      if (response.ok) setData(await response.json());
    } catch {
      // O Dashboard continua utilizável mesmo se uma fonte oceânica estiver lenta.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOcean(), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading) return <section className="ocean-intel loading"><div><BrainCircuit /><b>INTELIGÊNCIA OCEÂNICA</b></div><p>O painel principal já está pronto. Carregando dados oceânicos em segundo plano…</p></section>;
  if (!data) return <section className="ocean-intel loading"><div><BrainCircuit /><b>INTELIGÊNCIA OCEÂNICA</b></div><p>Dados oceânicos indisponíveis agora. O restante do painel continua funcionando.</p><button type="button" onClick={() => void loadOcean(true)}><RefreshCw className={refreshing ? "spin" : ""}/> Tentar novamente</button></section>;

  const e = data.environment;
  const a = data.analysis;
  return <section className="ocean-intel">
    <div className="ocean-head"><div><BrainCircuit/><span><small>ASSISTENTE DE PESCA</small><b>Inteligência oceânica + análise das largadas</b></span></div><div className="ocean-head-actions"><button type="button" onClick={() => void loadOcean(true)} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""}/> Atualizar</button><em>confiança {a.confidence}</em></div></div>
    {!e ? <div className="ocean-empty">Registre uma largada com coordenadas para liberar os dados do ponto de pesca.</div> : <>
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
        <article><Thermometer/><small>TEMPERATURA DO MAR</small><b>{n(e.sea?.sstC)} °C</b><span>Posição da largada #{e.position.setNumber}</span><i>{n(e.position.lat,4)}, {n(e.position.lon,4)}</i></article>
        <article><Activity/><small>CLOROFILA-a</small><b>{e.chlorophyll ? `${n(e.chlorophyll.mgM3,2)} mg/m³` : "Sem leitura"}</b><span>{e.chlorophyll ? "Satélite VIIRS" : "Nuvem/grade pode impedir leitura"}</span><i>{e.chlorophyll?.time ? new Date(e.chlorophyll.time).toLocaleDateString("pt-BR") : "NOAA CoastWatch"}</i></article>
      </div>
      <div className="sunline"><span>☀️ Sol nasce <b>{tm(e.sun?.sunrise)}</b></span><span>🌅 Sol se põe <b>{tm(e.sun?.sunset)}</b></span></div>
    </>}
    <div className="ai-analysis"><div><small>ANÁLISE ESTATÍSTICA LOCAL</small><h3>{a.sampleCount} largadas com captura analisadas</h3></div><div className="ai-findings">
      <span><small>Melhor horário observado</small><b>{a.bestHour?.label || "Aguardando dados"}</b><em>{a.bestHour ? `${n(a.bestHour.avgKg,0)} kg/largada • ${a.bestHour.samples} amostras` : ""}</em></span>
      <span><small>Melhor profundidade observada</small><b>{a.bestDepth?.label || "Aguardando dados"}</b><em>{a.bestDepth ? `${n(a.bestDepth.avgKg,0)} kg/largada • ${a.bestDepth.samples} amostras` : ""}</em></span>
      <span><small>Fase lunar com maior média</small><b>{a.bestMoon?.label || "Aguardando dados"}</b><em>{a.bestMoon ? `${n(a.bestMoon.avgKg,0)} kg/largada • ${a.bestMoon.samples} amostras` : ""}</em></span>
    </div><p>{a.notes?.[0]} O sistema mostra tamanho da amostra para evitar conclusões falsas.</p></div>
  </section>;
}
