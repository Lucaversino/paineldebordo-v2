import { coordinateInputToDecimal, decimalToCoordinateInput } from "./marineCoordinate";
export type Point = {lat:number;lon:number};
export type BoatPosition = {id:string; name:string; slot:number; start:Point; end:Point};
const rad = Math.PI/180;
const R_NM = 3440.065;
export function parsePosition(lat:string, lon:string):Point {
  const a=coordinateInputToDecimal(lat), b=coordinateInputToDecimal(lon);
  if (a===null || b===null || a < -90 || b < -180) throw new Error("Coordenadas inválidas. Use GG°MMMM, por exemplo 32°1494 e 51°1813.");
  return {lat:a,lon:b};
}
export function formatPoint(p:Point) {return `${decimalToCoordinateInput(p.lat)} S · ${decimalToCoordinateInput(p.lon)} W`;}
export function bearing(a:Point,b:Point) {
 const lat1=a.lat*rad,lat2=b.lat*rad,dLon=(b.lon-a.lon)*rad;
 const y=Math.sin(dLon)*Math.cos(lat2),x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
 return (Math.atan2(y,x)/rad+360)%360;
}
export function distance(a:Point,b:Point) {
 const dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
 return 2*R_NM*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function destination(start:Point,bearingDeg:number,nm:number):Point {
 const theta=bearingDeg*rad,d=nm/R_NM,lat=start.lat*rad,lon=start.lon*rad;
 const newLat=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(theta));
 const newLon=lon+Math.atan2(Math.sin(theta)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(newLat));
 return {lat:newLat/rad,lon:((newLon/rad+540)%360)-180};
}
export function makeFleet(start:Point,end:Point,heading:number,gap:number,names:string[]):BoatPosition[] {
 if(!Number.isFinite(heading)||heading<0||heading>=360)throw new Error("Rumo deve estar entre 0° e 359,99°.");
 if(!Number.isFinite(gap)||gap<=0||gap>20)throw new Error("Informe uma distância entre 0 e 20 MN.");
 if(names.length<1||names.length>60)throw new Error("A turma deve ter de 1 a 60 embarcações.");
 // Offset left/right is perpendicular to requested heading; displacement is not applied along the net.
 return names.map((name,i)=>{const slot=i-Math.floor(names.length/2);const offset=slot*gap;const perpendicular=(heading+(offset>=0?90:270))%360;
 return {id:`barco-${i+1}`,name:name.trim()||`Barco ${i+1}`,slot,start:destination(start,perpendicular,Math.abs(offset)),end:destination(end,perpendicular,Math.abs(offset))};});
}
