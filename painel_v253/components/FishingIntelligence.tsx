"use client";
import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Database, Fish, MapPinned, Moon, Waves, Wind } from "lucide-react";
import { formatCoordinate } from "../lib/tripReports";

const n = (v:any) => Number(v || 0);
const kg = (v:number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v)} kg`;
const avg = (a:number[]) => a.length ? a.reduce((s,v)=>s+v,0)/a.length : null;
const fmt = (v:number|null, suffix="") => v == null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v)}${suffix}`;

export default function FishingIntelligence(){
  const [store,setStore]=useState<any>({trips:[],sets:[],catches:[]});
  const [snapshots,setSnapshots]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ Promise.all([
    fetch("/api/manage",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject()),
    fetch("/api/environmental-snapshots",{cache:"no-store"}).then(r=>r.ok?r.json():({snapshots:[]})),
  ]).then(([m,e])=>{setStore(m);setSnapshots(e.snapshots||[])}).finally(()=>setLoading(false)); },[]);

  const data=useMemo(()=>{
    const finished=new Set((store.trips||[]).filter((t:any)=>t.status==="FINISHED").map((t:any)=>n(t.id)));
    const sets=(store.sets||[]).filter((s:any)=>finished.has(n(s.tripId)));
    const catches=(store.catches||[]).filter((c:any)=>finished.has(n(c.tripId)));
    const catchBySet=new Map<number,number>();
    catches.forEach((c:any)=>catchBySet.set(n(c.fishingSetId), (catchBySet.get(n(c.fishingSetId))||0)+n(c.weightKg)));
    const rows=sets.map((s:any)=>({s,kg:catchBySet.get(n(s.id))||0, env:snapshots.find((x:any)=>n(x.fishingSetId)===n(s.id))}));
    const productive=rows.filter((r:any)=>r.kg>0);
    const month=new Map<number,{kg:number,count:number}>(); const hour=new Map<number,{kg:number,count:number}>();
    productive.forEach((r:any)=>{ const d=new Date(r.s.startedAt); if(!isNaN(d.getTime())){const m=d.getMonth(); const h=d.getHours(); const M=month.get(m)||{kg:0,count:0};M.kg+=r.kg;M.count++;month.set(m,M); const H=hour.get(h)||{kg:0,count:0};H.kg+=r.kg;H.count++;hour.set(h,H);} });
    const bestMonth=[...month.entries()].sort((a,b)=>(b[1].kg/b[1].count)-(a[1].kg/a[1].count))[0];
    const bestHour=[...hour.entries()].sort((a,b)=>(b[1].kg/b[1].count)-(a[1].kg/a[1].count))[0];
    const best=[...productive].sort((a,b)=>b.kg-a.kg)[0];
    const envRows=productive.filter((r:any)=>r.env && (r.env.status==="COMPLETE"||r.env.status==="PARTIAL"));
    const weighted=(field:string)=>{const vals=envRows.map((r:any)=>({v:Number(r.env?.[field]),w:r.kg})).filter((x:any)=>Number.isFinite(x.v)&&x.w>0); const total=vals.reduce((s:any,x:any)=>s+x.w,0); return total?vals.reduce((s:any,x:any)=>s+x.v*x.w,0)/total:null};
    return {sets,productive,rows,total:catches.reduce((s:number,c:any)=>s+n(c.weightKg),0),best,bestMonth,bestHour,envCount:envRows.length, wind:weighted("windSpeedKmh"),wave:weighted("waveHeightM"),temp:weighted("seaTemperatureC"),chl:weighted("chlorophyllMgM3")};
  },[store,snapshots]);
  if(loading) return <section className="ops"><div className="loading">Carregando inteligência histórica…</div></section>;
  const monthName=data.bestMonth ? new Intl.DateTimeFormat("pt-BR",{month:"long"}).format(new Date(2026,data.bestMonth[0],1)) : "—";
  return <section className="ops fishing-intelligence">
    <div className="opshead"><div><small>V193 • BASE DE INTELIGÊNCIA DA PESCA</small><h2>Inteligência da Pesca</h2></div></div>
    <div className="intel-notice"><BrainCircuit/><div><b>O painel começou a transformar histórico em conhecimento.</b><span>Esta versão analisa somente dados reais já registrados. Não inventa probabilidade de peixe e não altera o funcionamento das largadas da V192.</span></div></div>
    <div className="intel-grid">
      <article><Database/><small>BASE HISTÓRICA</small><b>{data.sets.length} largadas</b><span>{data.envCount} com dados ambientais • {kg(data.total)} registrados</span></article>
      <article><Fish/><small>MELHOR LARGADA REGISTRADA</small><b>{data.best?kg(data.best.kg):"Sem dados"}</b><span>{data.best?`${formatCoordinate(data.best.s.startLatitude,true)} / ${formatCoordinate(data.best.s.startLongitude,false)}`:"Continue registrando as capturas."}</span></article>
      <article><Moon/><small>PADRÃO DE ÉPOCA</small><b>{monthName}</b><span>{data.bestMonth?`Média de ${kg(data.bestMonth[1].kg/data.bestMonth[1].count)} por largada registrada no mês.`:"Ainda sem amostras suficientes."}</span></article>
      <article><MapPinned/><small>HORÁRIO HISTÓRICO</small><b>{data.bestHour?`${String(data.bestHour[0]).padStart(2,"0")}:00–${String((data.bestHour[0]+1)%24).padStart(2,"0")}:00`:"—"}</b><span>{data.bestHour?`Média de ${kg(data.bestHour[1].kg/data.bestHour[1].count)} nas largadas iniciadas nessa faixa.`:"Ainda sem amostras suficientes."}</span></article>
    </div>
    <div className="intel-environment"><h3>Assinatura ambiental das capturas registradas</h3><p>Médias ponderadas pela quantidade capturada. Servem para procurar padrões; não significam que uma condição isolada causa maior captura.</p><div className="intel-grid compact">
      <article><Wind/><small>VENTO</small><b>{fmt(data.wind," km/h")}</b></article><article><Waves/><small>ONDAS</small><b>{fmt(data.wave," m")}</b></article><article><Waves/><small>TEMP. DO MAR</small><b>{fmt(data.temp," °C")}</b></article><article><Fish/><small>CLOROFILA</small><b>{fmt(data.chl," mg/m³")}</b></article>
    </div></div>
    <div className="intel-next"><b>Preparado para a próxima fase</b><span>Quanto mais viagens e largadas forem registradas, melhor fica a base. Uma versão futura poderá comparar a situação atual com largadas historicamente semelhantes, sempre mostrando quantidade de amostras e nível de confiança.</span></div>
  </section>;
}
