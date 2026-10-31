"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CloudSun, RefreshCw, Waves, StickyNote } from "lucide-react";
import { getOfflineManage } from "../lib/offlinePanel";

type RecordAny = Record<string, any>;
type Store = { trips: RecordAny[]; sets: RecordAny[]; catches: RecordAny[] };
type ForecastDay = { date: string; wind?: number; gust?: number; wave?: number; rain?: number; description?: string };
const fmt = (x: number) => new Intl.NumberFormat("pt-BR", {maximumFractionDigits: 1}).format(x);
const keyOf = (value: unknown): string => {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw); if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const toDate = (k: string) => new Date(`${k}T12:00:00`);
const addDays = (k: string, n: number) => { const d=toDate(k); d.setDate(d.getDate()+n); return keyOf(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`); };
const diff = (a: string,b: string) => Math.round((toDate(b).getTime()-toDate(a).getTime())/86400000);
const todayKey = () => { const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()); const get=(type:string)=>parts.find(p=>p.type===type)?.value||""; return `${get("year")}-${get("month")}-${get("day")}`; };
const weatherDescription = (code: number) => code >= 95 ? "Temporal" : code >= 80 ? "Pancadas" : code >= 61 ? "Chuva" : code >= 45 ? "Neblina" : code >= 3 ? "Nublado" : code >= 1 ? "Parcial" : "Sol";

export default function TripCalendar() {
  const [store, setStore] = useState<Store>({ trips:[], sets:[], catches:[] });
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [month,setMonth] = useState("");
  const [lost,setLost] = useState<Record<string,string>>({});
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [noteNotice,setNoteNotice] = useState("");
  const [selection,setSelection] = useState("");
  const [weather,setWeather] = useState<Record<string,ForecastDay>>({});
  const [weatherStatus,setWeatherStatus] = useState("Previsão ainda não carregada");
  const trip = store.trips.find(t=>t.status === "IN_PROGRESS");
  const tripId = trip?.id;
  const start = keyOf(trip?.departureDate);
  const end = keyOf(trip?.expectedReturnDate);
  const today = todayKey();
  const storageKey = tripId ? `painel-calendar-lost-days-${tripId}` : "";
  const noteKey = tripId ? `painel-calendar-notes-${tripId}` : "";
  async function load() {
    setLoading(true); setError("");
    try {
      const res=await fetch("/api/manage",{cache:"no-store"});
      if(!res.ok) throw Error("Não foi possível consultar a viagem atual.");
      const data=await res.json(); setStore({trips:data.trips||[],sets:data.sets||[],catches:data.catches||[]});
    } catch(e) {
      const cached=getOfflineManage();
      if(cached) {setStore({trips:cached.trips||[],sets:cached.sets||[],catches:cached.catches||[]});setError("Exibindo dados salvos neste dispositivo: podem estar desatualizados.");}
      else setError(e instanceof Error?e.message:"Falha ao carregar o calendário.");
    } finally {setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  useEffect(()=>{if(start && !month) setMonth(start.slice(0,7));},[start,month]);
  useEffect(()=>{if(!storageKey)return;try{setLost(JSON.parse(localStorage.getItem(storageKey)||"{}"));}catch{setLost({});}},[storageKey]);
  useEffect(()=>{if(!noteKey){setNotes({});return;}try{const data=JSON.parse(localStorage.getItem(noteKey)||"{}");setNotes(data && typeof data === "object" && !Array.isArray(data)?data:{});}catch{setNotes({});}},[noteKey]);
  function updateNote(date:string,text:string){
    if(!noteKey)return;
    const next={...notes};
    if(text.trim()) next[date]=text.trim();else delete next[date];
    try{localStorage.setItem(noteKey,JSON.stringify(next));setNotes(next);setNoteNotice("Anotação salva neste dispositivo.");}
    catch{setNoteNotice("Não foi possível salvar. Verifique o armazenamento do navegador.");}
  }
  function updateLost(date:string,reason:string) {if(!storageKey)return;const next={...lost};if(reason.trim())next[date]=reason.trim();else delete next[date];setLost(next);localStorage.setItem(storageKey,JSON.stringify(next));}
  const sets=useMemo(()=>store.sets.filter(s=>String(s.tripId)===String(tripId)),[store.sets,tripId]);
  const catchRows=useMemo(()=>store.catches.filter(c=>String(c.tripId)===String(tripId) && c.catchType!=="DISCARD"),[store.catches,tripId]);
  // Usa a mesma data operacional da largada exibida no calendário (início),
  // inclusive quando o recolhimento ocorre no dia seguinte. Evita largada sem kg.
  // Sem vínculo com largada, preserva a data própria da captura.
  const setById=useMemo(()=>new Map(sets.map(s=>[String(s.id),s])),[sets]);
  const captureDay=(c:RecordAny) => {
    const fishingSet=c.fishingSetId!=null?setById.get(String(c.fishingSetId)):null;
    return keyOf(fishingSet?.startedAt||fishingSet?.finishedAt||c.caughtAt);
  };
  const production=useMemo(()=>{
    const map:Record<string,number>={};
    for(const c of catchRows){
      const k=captureDay(c);
      const weight=Number(c.weightKg);
      if(k && Number.isFinite(weight) && weight>0)map[k]=(map[k]||0)+weight;
    }
    return map;
  },[catchRows,setById]);
  const setDays=useMemo(()=>new Set(sets.map(s=>keyOf(s.startedAt)).filter(Boolean)),[sets]);
  const total=Object.values(production).reduce((a,b)=>a+b,0);
  const officialTotal=Number(trip?.total??0);
  const totalMismatch=Number.isFinite(officialTotal)&&Math.abs(total-officialTotal)>0.01;
  const goal=Math.max(0,Number(trip?.targetKg||0));
  const calendarStart=start||today;
  const calendarEnd=end||today;
  const elapsed=Math.max(0,diff(calendarStart,today));
  const duration=Math.max(1,diff(calendarStart,calendarEnd));
  const travelPct=Math.min(100,Math.max(0,Math.round(elapsed/duration*100)));
  const remaining=Math.max(0,diff(today,calendarEnd));
  const missed=Object.keys(lost).filter(d=>d>=calendarStart && d<=today).length;
  const lastSet=[...sets].filter(s=>Number.isFinite(Number(s.endLatitude??s.startLatitude))&&Number.isFinite(Number(s.endLongitude??s.startLongitude))).sort((a,b)=>new Date(b.finishedAt||b.startedAt).getTime()-new Date(a.finishedAt||a.startedAt).getTime())[0];
  const lat=lastSet?Number(lastSet.endLatitude??lastSet.startLatitude):null;
  const lon=lastSet?Number(lastSet.endLongitude??lastSet.startLongitude):null;
  async function loadForecast(){
    if(lat===null||lon===null){setWeatherStatus("Registre uma posição na largada para consultar a previsão.");return;}
    setWeatherStatus("Atualizando previsão...");
    try {
      const params=new URLSearchParams({latitude:String(lat),longitude:String(lon),daily:"weather_code,wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum",timezone:"America/Sao_Paulo",forecast_days:"7"});
      const result=await Promise.all([fetch(`https://api.open-meteo.com/v1/forecast?${params}`,{cache:"no-store"}),fetch(`https://marine-api.open-meteo.com/v1/marine?${new URLSearchParams({latitude:String(lat),longitude:String(lon),daily:"wave_height_max",timezone:"America/Sao_Paulo",forecast_days:"7"})}`,{cache:"no-store"}).catch(()=>null)]);
      if(!result[0].ok) throw Error("Serviço meteorológico indisponível.");
      const forecast=await result[0].json(); const marine=result[1]?.ok?await result[1].json().catch(()=>null):null;
      const map:Record<string,ForecastDay>={};
      (forecast.daily?.time||[]).forEach((d:string,i:number)=>{map[d]={date:d,wind:forecast.daily.wind_speed_10m_max?.[i],gust:forecast.daily.wind_gusts_10m_max?.[i],rain:forecast.daily.precipitation_sum?.[i],wave:marine?.daily?.wave_height_max?.[marine.daily.time?.indexOf(d)],description:weatherDescription(Number(forecast.daily.weather_code?.[i]??0))};});
      setWeather(map);setWeatherStatus(`Previsão atualizada: ${new Date().toLocaleString("pt-BR")}. Fonte: Open-Meteo. Região da última largada.`);
    }catch(e){setWeather({});setWeatherStatus(e instanceof Error?e.message:"Erro ao consultar previsão.");}
  }
  useEffect(()=>{if(lat!==null&&lon!==null)void loadForecast();},[lat,lon]);
  const [year,mo]=month ? month.split("-").map(Number):[new Date().getFullYear(),new Date().getMonth()+1];
  const first=new Date(year,mo-1,1); const cells:(string|null)[]=Array.from({length:(first.getDay()+6)%7},()=>null);
  for(let day=1;day<=new Date(year,mo,0).getDate();day++)cells.push(`${year}-${String(mo).padStart(2,"0")}-${String(day).padStart(2,"0")}`);
  function moveMonth(n:number){const d=new Date(year,mo-1+n,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);}
  if(loading)return <section className="tripcal"><p>Carregando calendário da viagem...</p></section>;
  if(!trip)return <section className="tripcal"><h2>Calendário de viagem</h2><p>Não existe viagem em andamento. Inicie uma viagem para acompanhar o calendário.</p><button onClick={()=>void load()}>Atualizar</button></section>;
  const chosen=selection||today;
  const dailyRows=catchRows.filter(c=>{
    return captureDay(c)===chosen;
  });
  return <section className="tripcal">
    <div className="tripcal-head"><div><small>PLANEJAMENTO OPERACIONAL</small><h2><CalendarDays size={26}/> Calendário da viagem</h2><p>{trip.name} · Saída {start||"não informada"} · Chegada prevista {end||"não informada"}</p></div><button type="button" onClick={()=>void load()}><RefreshCw size={16}/> Atualizar registros</button></div>
    {error&&<p className="tripcal-note">{error}</p>}
    {totalMismatch&&<p className="tripcal-note" role="alert">Atenção: soma diária {fmt(total)} kg, mas o total da viagem no Dashboard é {fmt(officialTotal)} kg. Atualize os registros e confira capturas sem vínculo, diferenças de cadastro ou registros não sincronizados.</p>}
    <div className="tripcal-metrics"><article><small>Produção acumulada</small><b>{fmt(total)} kg</b><span>Meta: {fmt(goal)} kg</span></article><article><small>Meta de pesca</small><b>{goal?fmt(Math.min(100,total/goal*100)):"—"}%</b><span>Percentual dos quilos previstos</span></article><article><small>Tempo da viagem</small><b>{travelPct}%</b><span>{elapsed} de {duration} dias transcorridos</span></article><article><small>Até o retorno estimado</small><b>{remaining} dias</b><span>{end&&today>end?"Prazo de retorno já passou":"Dias restantes"}</span></article><article><small>Dias perdidos marcados</small><b>{missed}</b><span>Marcação manual neste dispositivo</span></article></div>
    <div className="tripcal-grid"><div className="tripcal-calendar"><div className="tripcal-month"><button onClick={()=>moveMonth(-1)} aria-label="Mês anterior"><ChevronLeft/></button><h3>{first.toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</h3><button onClick={()=>moveMonth(1)} aria-label="Próximo mês"><ChevronRight/></button></div><div className="tripcal-days">{["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(x=><strong key={x}>{x}</strong>)}{cells.map((d,i)=>d?<button key={d} className={["tripcal-day",d===today?"today":"",d===chosen?"selected":"",lost[d]?"lost":"",d<calendarStart||d>calendarEnd?"outside":""].join(" ")} onClick={()=>setSelection(d)}><b>{Number(d.slice(-2))}</b>{d===start&&<small className="tripcal-tag">Saída</small>}{d===end&&<small className="tripcal-tag">Retorno</small>}{Number(production[d]||0)>0&&<span className="tripcal-kg">{fmt(production[d])} kg</span>}{setDays.has(d)&&<small>🎣 Largada</small>}{lost[d]&&<small className="tripcal-lost">Dia perdido</small>}{notes[d]&&<small className="tripcal-note-indicator">📝 Anotação</small>}{weather[d]&&<small className="tripcal-weather">{weather[d].description} · {Math.round(weather[d].wind||0)} km/h</small>}</button>:<span key={`pad${i}`}/>)}</div></div>
    <aside className="tripcal-detail"><h3>{toDate(chosen).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</h3><p><b>Produção registrada:</b> {fmt(production[chosen]||0)} kg</p><p><b>Largadas iniciadas:</b> {sets.filter(s=>keyOf(s.startedAt)===chosen).length}</p><small>Produção contabilizada no dia de início da largada, inclusive se o recolhimento foi no dia seguinte. Capturas sem largada usam sua data registrada.</small>{dailyRows.length>0&&<div className="tripcal-catch-detail"><strong>Capturas do dia</strong>{dailyRows.map(c=><div key={c.id}><span>{c.species||"Espécie"}</span><b>{fmt(Number(c.weightKg||0))} kg</b></div>)}</div>}{weather[chosen]?<div className="tripcal-weatherbox"><b><CloudSun size={18}/> Previsão do dia</b><p>{weather[chosen].description} · Vento até {fmt(weather[chosen].wind||0)} km/h</p><p>Rajadas: {fmt(weather[chosen].gust||0)} km/h · Chuva: {fmt(weather[chosen].rain||0)} mm</p><p><Waves size={16}/> Ondas: {weather[chosen].wave==null?"Indisponível":`${fmt(weather[chosen].wave)} m`}</p></div>:<p>Sem previsão disponível para esta data. O calendário não inventa previsões passadas.</p>}
    {chosen>=calendarStart&&chosen<=today&&<label className="tripcal-mark"><span>Dia sem trabalho (marcação manual)</span><select value={lost[chosen]||""} onChange={e=>updateLost(chosen,e.target.value)}><option value="">Não marcado</option><option value="Mau tempo">Mau tempo</option><option value="Problema mecânico">Problema mecânico</option><option value="Descanso">Descanso</option><option value="Outro motivo">Outro motivo</option></select><small>Um dia sem peixe não é automaticamente um dia perdido.</small></label>}
    <div className="tripcal-note-editor"><label htmlFor="tripcal-note"><StickyNote size={16}/> Anotações deste dia</label><textarea id="tripcal-note" key={`${tripId}-${chosen}`} rows={5} maxLength={3000} defaultValue={notes[chosen]||""} onChange={e=>{setNoteNotice("");}} placeholder="Ex.: mudança de área, manutenção, avistamentos, condições de pesca..." /><div><button type="button" onClick={()=>updateNote(chosen,(document.getElementById("tripcal-note") as HTMLTextAreaElement)?.value||"")}>Salvar anotação</button>{notes[chosen]&&<button type="button" onClick={()=>{updateNote(chosen,"");const input=document.getElementById("tripcal-note") as HTMLTextAreaElement|null;if(input)input.value="";}}>Apagar</button>}</div>{noteNotice&&<small role="status">{noteNotice}</small>}<small>As anotações são privadas e ficam neste navegador; ainda não sincronizam com outros dispositivos.</small></div>
    <button type="button" onClick={()=>void loadForecast()}><RefreshCw size={15}/> Atualizar previsão</button><small>{weatherStatus}</small><small>A previsão é regional, da última posição de largada. Consulte a fonte oficial antes de navegar.</small></aside></div>
  </section>;
}
