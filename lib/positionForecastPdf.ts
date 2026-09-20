import jsPDF from "jspdf";
import { buildForecastFinalAnalysis } from "./forecastFinalAnalysis";

const C={navy:[4,32,39] as [number,number,number],teal:[31,207,160] as [number,number,number],panel:[8,48,55] as [number,number,number],panel2:[11,61,68] as [number,number,number],white:[246,255,252] as [number,number,number],muted:[145,190,194] as [number,number,number],blue:[75,190,235] as [number,number,number],violet:[185,145,255] as [number,number,number]};
const n=(v:any,d=1)=>{const x=Number(v);return Number.isFinite(x)?x.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}):"—"};
const mph=(v:any)=>{const x=Number(v);return Number.isFinite(x)?n(x/1.609344,2):"—"};
const date=(v:any)=>{if(!v)return "—";const d=new Date(String(v).length===10?`${v}T12:00:00`:v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit",hour:String(v).includes("T")?"2-digit":undefined,minute:String(v).includes("T")?"2-digit":undefined})};
function pos(lat:number,lon:number){const p=(v:number,s:string)=>{const a=Math.abs(v),g=Math.floor(a),m=(a-g)*60;return `${g}° ${m.toFixed(2)}' ${s}`};return `${p(lat,"S")}  ·  ${p(lon,"W")}`}
function txt(doc:jsPDF,t:string,x:number,y:number,size=10,bold=false,color:C['white']|[number,number,number]=C.white){doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);doc.setTextColor(...color);doc.text(t,x,y)}
function card(doc:jsPDF,x:number,y:number,w:number,h:number,label:string,value:string,detail:string,color:[number,number,number]=C.teal){doc.setFillColor(...C.panel);doc.roundedRect(x,y,w,h,4,4,"F");doc.setDrawColor(...color);doc.setLineWidth(.7);doc.line(x+4,y+4,x+4,y+h-4);txt(doc,label,x+9,y+9,7,true,C.muted);txt(doc,value,x+9,y+20,15,true,C.white);txt(doc,detail,x+9,y+h-7,7,false,C.muted)}
function header(doc:jsPDF,data:any,subtitle:string){
  const lat=Number(data?.position?.lat||0),lon=Number(data?.position?.lon||0);
  const consulted=data?.queriedAt?new Date(data.queriedAt):new Date();
  const when=Number.isNaN(consulted.getTime())?new Date().toLocaleString("pt-BR"):consulted.toLocaleString("pt-BR");
  const place=data?.position?.geography?.label||"Área oceânica / referência geográfica indisponível";
  const depth=Number(data?.position?.depthM);
  const depthText=Number.isFinite(depth)?`${n(depth,0)} m`:`—`;
  doc.setFillColor(...C.navy);doc.rect(0,0,297,39,"F");doc.setFillColor(...C.teal);doc.rect(0,0,6,39,"F");
  txt(doc,"PAINEL DE BORDO",14,10,14,true);txt(doc,subtitle,14,17,7,true,C.teal);
  txt(doc,"POSIÇÃO CONSULTADA",14,25,6,true,C.muted);txt(doc,pos(lat,lon),14,34,15,true,C.white);
  txt(doc,"DATA E HORA",145,24,6,true,C.muted);txt(doc,when,145,32,9,true,C.white);
  txt(doc,"PROFUNDIDADE",225,24,6,true,C.muted);txt(doc,depthText,225,32,11,true,C.blue);
  txt(doc,"LOCAL GEOGRÁFICO",145,9,6,true,C.muted);txt(doc,place.length>62?place.slice(0,59)+"...":place,145,16,7,true,C.white);
}
function footer(doc:jsPDF){const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setDrawColor(...C.teal);doc.line(12,198,285,198);txt(doc,"Dados modelados para apoio operacional. Não usar como referência única de navegação.",12,203,6,false,[80,110,114]);txt(doc,`Página ${i}`,285,203,6,false,[80,110,114])}}
function wrapped(doc:jsPDF,t:string,x:number,y:number,w:number,size=7,color:[number,number,number]=C.muted,bold=false){doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);doc.setTextColor(...color);const lines=doc.splitTextToSize(t,w);doc.text(lines,x,y);return lines.length}
function analysisPage(doc:jsPDF,data:any){
  const analysis=buildForecastFinalAnalysis(data);
  doc.addPage();
  header(doc,data,"ANÁLISE FINAL · INTERPRETAÇÃO SIMPLES DOS DADOS");
  doc.setFillColor(...C.panel2);doc.roundedRect(14,47,269,24,4,4,"F");
  txt(doc,"CONDIÇÃO GERAL",20,55,6,true,C.muted);txt(doc,analysis.headline,20,64,15,true,C.teal);
  wrapped(doc,analysis.summary,82,56,192,8,C.white,true);
  const tone:any={teal:C.teal,blue:C.blue,violet:C.violet,amber:[245,176,65],green:[75,220,145]};
  analysis.items.forEach((item:any,i:number)=>{
    const col=i%3,row=Math.floor(i/3),x=14+col*91,y=79+row*48;
    const accent=(tone[item.tone]||C.teal) as [number,number,number];
    doc.setFillColor(...C.panel);doc.roundedRect(x,y,86,42,4,4,"F");doc.setFillColor(...accent);doc.roundedRect(x,y,3,42,2,2,"F");
    txt(doc,item.title,x+8,y+8,6,true,C.muted);txt(doc,item.value,x+8,y+17,10,true,C.white);wrapped(doc,item.text,x+8,y+24,72,6,C.muted,false);
  });
  doc.setFillColor(...C.panel2);doc.roundedRect(14,174,269,13,4,4,"F");
  txt(doc,"COMO ENTENDER",20,181,6,true,C.teal);wrapped(doc,"Satélite = observação atual da superfície. Copernicus = previsão/tendência para os próximos dias. Diferenças entre eles podem ser normais por método e resolução.",58,180,217,6,C.white,false);
  wrapped(doc,analysis.fishingNote,14,191,269,5.5,[80,110,114],false);
}
export function createPositionForecastPdf(data:any){const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});header(doc,data,"PREVISÃO OCEÂNICA · VENTO · MAR · CORRENTE · CLOROFILA");txt(doc,"CONDIÇÕES AGORA",14,47,8,true,[35,100,103]);const cur=data?.current||{};const cards:any[]=[["VENTO",`${n(cur.windSpeedKmh,0)} km/h`,`${cur.windDirection||"—"} · rajadas ${n(cur.gustKmh,0)} km/h`,C.teal],["ONDA",`${n(cur.waveHeightM)} m`,`${cur.waveDirection||"—"} · período ${n(cur.wavePeriodS)} s`,C.blue],["CORRENTE",`${mph(cur.currentKmh)} mph`,`${cur.currentDirection||"—"} · ${n(cur.currentDirectionDeg,0)}°`,C.violet],["TEMP. MAR",`${n(cur.seaTemperatureC)} °C`,`Superfície`,[245,176,65]],["CLOROFILA-A",`${n(cur.chlorophyllMgM3,2)} mg/m³`,`${cur.chlorophyllSource?.includes("VIIRS")?"VIIRS · SATÉLITE · observação atual":"Sem observação de satélite"}`,[75,220,145]]];cards.forEach((c,i)=>card(doc,14+i*54.5,52,50.5,38,c[0],c[1],c[2],c[3]));txt(doc,"PRÓXIMOS 7 DIAS",14,101,10,true,[35,100,103]);const weekly=Array.isArray(data?.weeklyForecast)?data.weeklyForecast.slice(0,7):[];weekly.forEach((d:any,i:number)=>{const x=14+i*39.1;doc.setFillColor(...(i%2?C.panel:C.panel2));doc.roundedRect(x,106,35.5,72,4,4,"F");txt(doc,date(d.date).replace(/,.*$/,""),x+4,116,8,true,C.teal);txt(doc,"VENTO",x+4,126,6,true,C.muted);txt(doc,`${n(d.windSpeedKmh,0)} km/h`,x+4,134,11,true);txt(doc,`Raj. ${n(d.gustKmh,0)}`,x+4,140,6,false,C.muted);txt(doc,"ONDA",x+4,150,6,true,C.muted);txt(doc,`${n(d.waveHeightM)} m`,x+4,158,11,true);txt(doc,"CLOROFILA",x+4,168,6,true,[100,230,170]);txt(doc,`${n(d.chlorophyllMgM3,2)} mg/m³`,x+4,176,9,true)});txt(doc,`Emitido em ${new Date().toLocaleString("pt-BR")}`,283,190,7,false,[80,110,114]);const forecast=Array.isArray(data?.forecast)?data.forecast:[];for(let start=0;start<forecast.length;start+=8){doc.addPage();header(doc,data,"PREVISÃO POR HORÁRIO · CARDS OPERACIONAIS");forecast.slice(start,start+8).forEach((d:any,i:number)=>{const col=i%4,row=Math.floor(i/4),x=14+col*68.2,y=47+row*70;doc.setFillColor(...C.panel);doc.roundedRect(x,y,63.5,64,4,4,"F");txt(doc,date(d.time),x+5,y+9,8,true,C.teal);txt(doc,"VENTO",x+5,y+19,6,true,C.muted);txt(doc,`${n(d.windSpeedKmh,0)} km/h`,x+5,y+28,13,true);txt(doc,`${d.windDirection||"—"} · raj. ${n(d.gustKmh,0)}`,x+5,y+34,6,false,C.muted);txt(doc,"ONDA",x+34,y+19,6,true,C.muted);txt(doc,`${n(d.waveHeightM)} m`,x+34,y+28,13,true);txt(doc,`${d.waveDirection||"—"} · ${n(d.wavePeriodS)} s`,x+34,y+34,6,false,C.muted);txt(doc,"CORRENTE",x+5,y+45,6,true,C.violet);txt(doc,`${mph(d.currentKmh)} mph`,x+5,y+54,11,true);const day=weekly.find((w:any)=>w.date===String(d.time||"").slice(0,10));txt(doc,"CLOROFILA",x+34,y+45,6,true,[100,230,170]);txt(doc,`${n(day?.chlorophyllMgM3,2)} mg/m³`,x+34,y+54,10,true)})}analysisPage(doc,data);footer(doc);return doc}
export function downloadPositionForecastPdf(data:any){const doc=createPositionForecastPdf(data);doc.save(`previsao-oceanica-${new Date().toISOString().slice(0,10)}.pdf`)}
