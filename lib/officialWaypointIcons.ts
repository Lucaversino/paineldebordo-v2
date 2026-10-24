export const WAYPOINT_TYPES = [
  {value:"skull",label:"Perigo",symbol:"☠",color:"#ff596a"},
  {value:"rock",label:"Pedra",symbol:"◆",color:"#d4e1e6"},
  {value:"reef",label:"Parcel",symbol:"▰",color:"#ffc04b"},
  {value:"wreck",label:"Naufrágio",symbol:"⚓",color:"#55caff"},
  {value:"anchor",label:"Fundeadouro",symbol:"⚓",color:"#4ee9d1"},
  {value:"fish",label:"Pesqueiro",symbol:"🐟",color:"#55d9ff"},
  {value:"net",label:"Rede",symbol:"▦",color:"#ffba63"},
  {value:"buoy",label:"Boia",symbol:"●",color:"#ff745e"},
  {value:"port",label:"Porto",symbol:"▣",color:"#8ecbff"},
  {value:"marina",label:"Marina",symbol:"⛵",color:"#6be9e2"},
  {value:"warning",label:"Atenção",symbol:"!",color:"#ffe15a"},
  {value:"flag",label:"Referência",symbol:"⚑",color:"#b3a0ff"},
  {value:"depth",label:"Profundidade",symbol:"↓",color:"#89c8fa"},
  {value:"current",label:"Corrente",symbol:"➜",color:"#69eccb"},
  {value:"star",label:"Favorito",symbol:"★",color:"#ffd86b"},
] as const;
export type OfficialWaypointIconType = typeof WAYPOINT_TYPES[number]["value"];
export function officialWaypointIconSvg(type: OfficialWaypointIconType) {
  const item = WAYPOINT_TYPES.find(t => t.value === type) || WAYPOINT_TYPES[1];
  const symbol = item.symbol.replace(/&/g,"&amp;").replace(/</g,"&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="#09212a" stroke="${item.color}" stroke-width="3"/><text x="24" y="32" text-anchor="middle" font-size="25" font-family="Arial, sans-serif" font-weight="bold" fill="${item.color}">${symbol}</text></svg>`;
}
export function officialWaypointIconDataUri(type: OfficialWaypointIconType) { return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(officialWaypointIconSvg(type))}`; }
