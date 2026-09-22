export type OfficialWaypointIconType = "skull" | "rock" | "reef" | "wreck";

const SHELL: Record<OfficialWaypointIconType, { edge: string; fill: string }> = {
  skull: { edge: "#ff5d6c", fill: "#38151b" },
  rock: { edge: "#d8e0e4", fill: "#252e33" },
  reef: { edge: "#ffc24b", fill: "#3b2a10" },
  wreck: { edge: "#58c8ff", fill: "#102d3d" },
};

function inner(type: OfficialWaypointIconType) {
  if (type === "skull") return `
    <path d="M36 38c0-8 5-13 12-13s12 5 12 13c0 6-2 9-6 11v7h-5v-5h-2v5h-5v-7c-4-2-6-5-6-11z" fill="#fff6f6"/>
    <circle cx="43" cy="38" r="3.6" fill="#38151b"/><circle cx="53" cy="38" r="3.6" fill="#38151b"/>
    <path d="M48 43l-3 5h6z" fill="#38151b"/>
    <path d="M33 58l30-10M33 48l30 10" stroke="#fff6f6" stroke-width="4.2" stroke-linecap="round"/>`;
  if (type === "rock") return `
    <path d="M29 58l9-23 10-9 9 8 11 24z" fill="#9aa6ac" stroke="#f2f6f7" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M38 35l10 12 9-13M32 54h32" fill="none" stroke="#59666c" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M28 62c7-3 12 3 20 0s13 3 21 0" fill="none" stroke="#68d8ff" stroke-width="2.7" stroke-linecap="round"/>`;
  if (type === "reef") return `
    <path d="M29 34c6-4 12 4 18 0s12 4 21 0" fill="none" stroke="#70dcff" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M31 60c6-14 11-10 16-19 3 9 7 10 11 19 3-9 7-11 10-17 1 8 2 12 4 17z" fill="#f2aa2d" stroke="#ffe4a3" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M32 64h36" stroke="#ffe4a3" stroke-width="2.8" stroke-linecap="round"/>`;
  return `
    <g transform="rotate(-13 49 47)">
      <path d="M29 49h39l-7 12H36z" fill="#e3f2f7" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M41 49V34h14v15" fill="#88bed3" stroke="#ffffff" stroke-width="2.4"/>
      <path d="M48 34V25M48 26l10 5" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>
    </g>
    <path d="M28 65c7-3 13 3 21 0s13 3 22 0" fill="none" stroke="#58c8ff" stroke-width="3" stroke-linecap="round"/>`;
}

export function officialWaypointIconSvg(type: OfficialWaypointIconType) {
  const c = SHELL[type];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs><filter id="s" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#001017" flood-opacity=".5"/></filter></defs>
    <g filter="url(#s)">
      <path d="M48 5C27 5 12 20 12 40c0 25 25 44 33 50a5 5 0 0 0 6 0c8-6 33-25 33-50C84 20 69 5 48 5z" fill="${c.fill}" stroke="${c.edge}" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="48" cy="41" r="27" fill="${c.fill}" stroke="rgba(255,255,255,.16)" stroke-width="1.5"/>
      ${inner(type)}
      <circle cx="48" cy="83" r="3.2" fill="${c.edge}" stroke="#06151a" stroke-width="1.6"/>
    </g>
  </svg>`;
}

export function officialWaypointIconDataUri(type: OfficialWaypointIconType) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(officialWaypointIconSvg(type))}`;
}
