"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", {maximumFractionDigits:1}).format(n);
const stamp = (value?: string) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const dateKey = (value: string) => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
export function TripMiniDashboard({trip, sets, catches, onAnalyze}: {trip:any;sets:any[];catches:any[];onAnalyze?:()=>void}) {
  const tripSets = sets.filter(s=>Number(s.tripId)===Number(trip.id));
  const tripCatches = catches.filter(c=>Number(c.tripId)===Number(trip.id));
  const total = tripCatches.filter(c=>c.catchType!=="DISCARD").reduce((a,c)=>a+Number(c.weightKg||0),0);
  const target = Number(trip.targetKg||0);
  const dataByDay = new Map<string,number>();
  tripCatches.filter(c=>c.catchType!=="DISCARD").forEach(c=>{const key=dateKey(c.caughtAt);if(key)dataByDay.set(key,(dataByDay.get(key)||0)+Number(c.weightKg||0));});
  const data=Array.from(dataByDay).sort(([x],[y])=>x.localeCompare(y)).map(([date,kg])=>({date:date.slice(8)+"/"+date.slice(5,7),kg}));
  const start = new Date(trip.departureDate).getTime();
  const end = new Date(trip.status==="FINISHED"&&trip.returnDate?trip.returnDate:trip.expectedReturnDate).getTime();
  const now = trip.status==="IN_PROGRESS"?Date.now():end;
  const days = Number.isFinite(start)&&Number.isFinite(end)&&end>start? Math.max(1,Math.ceil((end-start)/86400000)):null;
  const elapsed = Number.isFinite(start)? Math.max(0,Math.ceil((Math.min(now,end||now)-start)/86400000)):0;
  const remaining = trip.status==="IN_PROGRESS" && Number.isFinite(end)?Math.max(0,Math.ceil((end-Date.now())/86400000)):0;
  const pct=target>0?total/target*100:0;
  return <div className="trip-mini-dashboard">
    <div className="trip-mini-stats">
      <div><small>Capturado</small><b>{fmt(total)} kg</b></div>
      <div><small>Meta atingida</small><b>{fmt(pct)}%</b></div>
      <div><small>Largadas</small><b>{tripSets.length}</b></div>
      <div><small>{trip.status==="IN_PROGRESS"?"Dias restantes":"Duração prevista"}</small><b>{trip.status==="IN_PROGRESS"?remaining:days??"—"}</b></div>
    </div>
    <div className="trip-progress-track"><span style={{width:`${Math.min(100,Math.max(0,pct))}%`}} /></div>
    <div className="trip-mini-chart"><strong>Produção diária registrada</strong>{data.length?<ResponsiveContainer width="100%" height={150}><BarChart data={data} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid stroke="#20434b" strokeDasharray="3 3"/><XAxis dataKey="date" stroke="#85b6be" fontSize={10}/><YAxis stroke="#85b6be" fontSize={10} width={55}/><Tooltip formatter={(v)=>`${fmt(Number(v))} kg`}/><Bar dataKey="kg" fill="#24cba5" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>:<p>Sem capturas registradas para o gráfico.</p>}</div>
    <div className="trip-mini-footer"><span>Saída: {stamp(trip.departureDate)}</span><span>Retorno previsto: {stamp(trip.expectedReturnDate)}</span>{days!==null&&<span>Tempo decorrido: {Math.min(100,Math.round(elapsed/days*100))}%</span>}{onAnalyze&&<button type="button" onClick={onAnalyze}>Abrir análise completa</button>}</div>
  </div>;
}
export function TripScheduleEditor({trip,onSaved}: {trip:any;onSaved:()=>void}) {
  const [opened,setOpened]=useState(false);
  const [start,setStart]=useState(String(trip.departureDate||"").slice(0,10));
  const [end,setEnd]=useState(String(trip.expectedReturnDate||"").slice(0,10));
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  async function submit(e:React.FormEvent){e.preventDefault();setError("");setPending(true);try{
    const r=await fetch("/api/manage",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({type:"tripSchedule",id:trip.id,departureDate:start,expectedReturnDate:end})});
    const j=await r.json();if(!r.ok)throw Error(j.error||"Falha ao salvar datas");setOpened(false);onSaved();
  }catch(e){setError(e instanceof Error?e.message:"Falha ao salvar");}finally{setPending(false)}}
  return <div className="trip-schedule-editor"><button type="button" className="editbtn" onClick={()=>setOpened(v=>!v)}>Editar saída e retorno previsto</button>{opened&&<form onSubmit={submit} className="trip-schedule-form"><label>Data de saída<input type="date" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>Chegada estimada<input type="date" value={end} onChange={e=>setEnd(e.target.value)} required min={start}/></label><button className="save" disabled={pending}>{pending?"Salvando...":"Salvar e sincronizar"}</button>{error&&<p role="alert">{error}</p>}</form>}</div>;
}
