"use client";
import { useEffect, useState } from "react";
import { BrainCircuit, Droplets, MoonStar, Waves, Wind, Thermometer, Activity } from "lucide-react";

const n=(v:any,d=1)=>v==null||Number.isNaN(Number(v))?"—":new Intl.NumberFormat("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}).format(Number(v));
const tm=(v?:string|null)=>v?new Date(v).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):"—";

export default function OceanIntelligence(){
 const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true; fetch("/api/ocean-intelligence",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(j=>alive&&setData(j)).finally(()=>alive&&setLoading(false)); return()=>{alive=false}},[]);
 if(loading) return <section className="ocean-intel loading"><div><BrainCircuit/><b>INTELIGÊNCIA OCEÂNICA</b></div><p>Carregando lua, vento, mar, clorofila e histórico das largadas…</p></section>;
 if(!data) return null;
 const e=data.environment,a=data.analysis;
 return <section className="ocean-intel">
  <div className="ocean-head"><div><BrainCircuit/><span><small>ASSISTENTE DE PESCA</small><b>Inteligência oceânica + análise das largadas</b></span></div><em>confiança {a.confidence}</em></div>
  {!e?<div className="ocean-empty">Registre uma largada com coordenadas para liberar os dados do ponto de pesca.</div>:<>
   <div className="ocean-grid">
    <article><MoonStar/><small>LUA AGORA</small><b>{e.lunar.name}</b><span>{n(e.lunar.illumination*100,0)}% iluminada</span><i>Nasce {tm(e.lunar.moonrise)} • põe {tm(e.lunar.moonset)}</i></article>
    <article><Wind/><small>VENTO</small><b>{n(e.wind?.speedKmh)} km/h {e.wind?.direction||""}</b><span>Rajadas {n(e.wind?.gustKmh)} km/h</span><i>Atualização {tm(e.wind?.time)}</i></article>
    <article><Waves/><small>MAR / ONDA</small><b>{n(e.sea?.waveHeightM)} m</b><span>Período {n(e.sea?.wavePeriodS)} s • swell {n(e.sea?.swellHeightM)} m</span><i>Corrente {n(e.sea?.currentKmh)} km/h</i></article>
    <article><Droplets/><small>MARÉ MODELADA</small><b>{n(e.sea?.seaLevelMslM,2)} m MSL</b><span>{e.sea?.extrema?.[0]?`${e.sea.extrema[0].type==="HIGH"?"Próx. alta":"Próx. baixa"} ${tm(e.sea.extrema[0].time)}`:"Sem extremo próximo"}</span><i>Não usar para navegação</i></article>
    <article><Thermometer/><small>TEMPERATURA DO MAR</small><b>{n(e.sea?.sstC)} °C</b><span>Posição da largada #{e.position.setNumber}</span><i>{n(e.position.lat,4)}, {n(e.position.lon,4)}</i></article>
    <article><Activity/><small>CLOROFILA-a</small><b>{e.chlorophyll?`${n(e.chlorophyll.mgM3,2)} mg/m³`:"Sem leitura"}</b><span>{e.chlorophyll?"Satélite VIIRS":"Nuvem/grade pode impedir leitura"}</span><i>{e.chlorophyll?.time?new Date(e.chlorophyll.time).toLocaleDateString("pt-BR"):"NOAA CoastWatch"}</i></article>
   </div>
   <div className="sunline"><span>☀️ Sol nasce <b>{tm(e.sun?.sunrise)}</b></span><span>🌅 Sol se põe <b>{tm(e.sun?.sunset)}</b></span></div>
  </>}
  <div className="ai-analysis"><div><small>ANÁLISE PROFUNDA DAS LARGADAS</small><h3>{a.sampleCount} largadas com captura analisadas</h3></div><div className="ai-findings">
   <span><small>Melhor horário observado</small><b>{a.bestHour?.label||"Aguardando dados"}</b><em>{a.bestHour?`${n(a.bestHour.avgKg,0)} kg/largada • ${a.bestHour.samples} amostras`:""}</em></span>
   <span><small>Melhor profundidade observada</small><b>{a.bestDepth?.label||"Aguardando dados"}</b><em>{a.bestDepth?`${n(a.bestDepth.avgKg,0)} kg/largada • ${a.bestDepth.samples} amostras`:""}</em></span>
   <span><small>Fase lunar com maior média</small><b>{a.bestMoon?.label||"Aguardando dados"}</b><em>{a.bestMoon?`${n(a.bestMoon.avgKg,0)} kg/largada • ${a.bestMoon.samples} amostras`:""}</em></span>
  </div><p>{a.notes?.[0]} A IA operacional usa somente seus registros reais e mostra tamanho da amostra para evitar conclusões falsas.</p></div>
  <footer>Fontes: Open-Meteo + NOAA CoastWatch. Dados de maré são modelados e não substituem tábua de marés/carta náutica.</footer>
 </section>;
}
