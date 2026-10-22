"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, FileDown, Save, Share2, Trash2, Compass } from "lucide-react";
import { bearing, distance, formatPoint, makeFleet, parsePosition, type BoatPosition } from "../lib/positionGeometry";
import { formatCoordinateInput } from "../lib/marineCoordinate";
import { magneticDeclination, WMM_MODEL } from "../lib/wmm2025";

type SavedGroup = {
  id: string;
  title: string;
  chiefName?: string;
  eastNames?: string[];
  westNames?: string[];
  names?: string[];
  startLat: string;
  startLon: string;
  endLat: string;
  endLon: string;
  heading: string;
  gap: string;
  useStart?: boolean;
  useEnd?: boolean;
  singleMagneticHeading?: string;
  createdAt: string;
};

const KEY = "painel-position-groups-v1";
const initialEastNames = Array.from({ length: 10 }, (_, i) => `Mestre fora ${String(i + 1).padStart(2, "0")}`);
const initialWestNames = Array.from({ length: 10 }, (_, i) => `Mestre terra ${String(i + 1).padStart(2, "0")}`);
const initialChiefName = "Chefe da turma";

function download(filename: string, contents: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([contents], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] || c));
}

function sideLabel(slot: number, gapValue: number) {
  if (slot === 0) return "Chefe / referência";
  const miles = (Math.abs(slot) * gapValue).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return slot < 0 ? `Oeste / terra · ${miles} MN` : `Leste / fora · ${miles} MN`;
}

function gpxOf(boats: BoatPosition[], title: string, gapValue: number, useStart: boolean, useEnd: boolean) {
  const marks = boats.flatMap((b) => [
    ...(useStart ? [{ point: b.start, suffix: "Inicial" }] : []),
    ...(useEnd ? [{ point: b.end, suffix: "Final" }] : []),
  ].map(({ point, suffix }) => `<wpt lat="${point.lat.toFixed(8)}" lon="${point.lon.toFixed(8)}"><name>${escapeXml(`${b.name} - ${suffix}`)}</name><desc>${escapeXml(sideLabel(b.slot, gapValue))}</desc><sym>Flag</sym></wpt>`)).join("\n");
  const routes = useStart && useEnd ? boats.map((b) => `<rte><name>${escapeXml(b.name)}</name><rtept lat="${b.start.lat.toFixed(8)}" lon="${b.start.lon.toFixed(8)}"><name>Inicial</name></rtept><rtept lat="${b.end.lat.toFixed(8)}" lon="${b.end.lon.toFixed(8)}"><name>Final</name></rtept></rte>`).join("\n") : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Painel de Bordo" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${escapeXml(title)}</name></metadata>
${marks}
${routes}
</gpx>`;
}

function buildFleetOrder(westNames: string[], chiefName: string, eastNames: string[]) {
  return [...westNames.slice().reverse(), chiefName, ...eastNames];
}

function expandNames(total: number, prefix: string, old: string[]) {
  return Array.from({ length: total }, (_, i) => old[i] || `${prefix} ${String(i + 1).padStart(2, "0")}`);
}

function splitLegacyNames(names: string[]) {
  const mid = Math.floor(names.length / 2);
  return {
    westNames: names.slice(0, mid).reverse(),
    chiefName: names[mid] || initialChiefName,
    eastNames: names.slice(mid + 1),
  };
}

export default function PositionPage() {
  const [title, setTitle] = useState("Turma de pesca");
  const [startLat, setStartLat] = useState("32°1494");
  const [startLon, setStartLon] = useState("51°1813");
  const [endLat, setEndLat] = useState("32°0667");
  const [endLon, setEndLon] = useState("51°1165");
  
  const [gap, setGap] = useState("0.25");
  const [useStart, setUseStart] = useState(true);
  const [useEnd, setUseEnd] = useState(true);
  const [singleMagneticHeading, setSingleMagneticHeading] = useState("");
  const [magneticDate, setMagneticDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [chiefName, setChiefName] = useState(initialChiefName);
  const [eastNames, setEastNames] = useState(initialEastNames);
  const [westNames, setWestNames] = useState(initialWestNames);
  const [saved, setSaved] = useState<SavedGroup[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const groups = JSON.parse(raw);
        if (Array.isArray(groups)) setSaved(groups);
      }
    } catch {}
  }, []);

  const fleetNames = useMemo(() => buildFleetOrder(westNames, chiefName, eastNames), [westNames, chiefName, eastNames]);
  const totalBoats = westNames.length + eastNames.length + 1;

  const draft = useMemo(() => {
    try {
      if (!useStart && !useEnd) throw new Error("Ative pelo menos uma posição: inicial ou final.");
      const a = useStart ? parsePosition(startLat, startLon) : null;
      const b = useEnd ? parsePosition(endLat, endLon) : null;
      const point = a || b;
      if (!point) throw new Error("Informe uma posição válida.");
      const both = !!a && !!b;
      const netLength = a && b ? distance(a, b) : 0;
      if (both && netLength < 0.01) throw new Error("As duas pontas não podem ser iguais.");
      const ref = a && b ? { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 } : point;
      const date = new Date(`${magneticDate}T12:00:00Z`);
      if (Number.isNaN(date.getTime())) throw new Error("Informe a data magnética válida.");
      const declination = magneticDeclination(ref.lat, ref.lon, date);
      let actualBearing: number;
      if (a && b) actualBearing = bearing(a, b);
      else {
        if (!singleMagneticHeading.trim()) throw new Error("Com apenas uma ponta, informe o rumo magnético de referência para distribuir os barcos.");
        const magnetic = Number(singleMagneticHeading.replace(",", "."));
        if (!Number.isFinite(magnetic) || magnetic < 0 || magnetic >= 360) throw new Error("Informe um rumo magnético de 0° a 359,99°.");
        actualBearing = (magnetic + declination + 360) % 360;
      }
      const magneticBearing = (actualBearing - declination + 360) % 360;
      const boats = makeFleet(a || point, b || point, actualBearing, Number(gap), fleetNames, westNames.length);
      return { boats, actualBearing, magneticBearing, declination, netLength, error: "" };
    } catch (e) {
      return { boats: [] as BoatPosition[], actualBearing: 0, magneticBearing: 0, declination: 0, netLength: 0, error: e instanceof Error ? e.message : "Erro nos dados." };
    }
  }, [startLat, startLon, endLat, endLon, gap, fleetNames, westNames.length, magneticDate, useStart, useEnd, singleMagneticHeading]);

  const [generated, setGenerated] = useState<null | {
    signature: string;
    useStart: boolean;
    useEnd: boolean;
    boats: BoatPosition[];
    actualBearing: number;
    magneticBearing: number;
    declination: number;
    magneticDate: string;
    netLength: number;
    heading: string;
    gap: string;
    title: string;
  }>(null);

  const heading = draft.error ? "" : String(draft.actualBearing);
  const signature = JSON.stringify([title, startLat, startLon, endLat, endLon, gap, chiefName, eastNames, westNames, magneticDate, useStart, useEnd, singleMagneticHeading]);
  const isOutdated = !!generated && generated.signature !== signature;
  const result = generated ? { ...generated, error: "" } : { boats: [] as BoatPosition[], actualBearing: 0, magneticBearing: 0, declination: 0, magneticDate, netLength: 0, error: "" };
  const gapValue = Number(result.gap || gap || 0);

  const generatePositions = () => {
    if (draft.error) {
      setMessage(draft.error);
      return;
    }
    setGenerated({ signature, useStart, useEnd, boats: draft.boats, actualBearing: draft.actualBearing, magneticBearing: draft.magneticBearing, declination: draft.declination, magneticDate, netLength: draft.netLength, heading, gap, title });
    setMessage(`Posições geradas para ${draft.boats.length} embarcações. Confira os dados antes de compartilhar.`);
  };

  const saveGroup = () => {
    if (!generated || isOutdated) {
      setMessage("Gere ou atualize as posições antes de salvar a turma.");
      return;
    }
    const item: SavedGroup = {
      id: crypto.randomUUID(),
      title,
      chiefName,
      eastNames,
      westNames,
      startLat,
      startLon,
      endLat,
      endLon,
      heading,
      gap,
      useStart,
      useEnd,
      singleMagneticHeading,
      createdAt: new Date().toISOString(),
    };
    const next = [item, ...saved].slice(0, 50);
    localStorage.setItem(KEY, JSON.stringify(next));
    setSaved(next);
    setMessage("Turma salva neste dispositivo. Faça também uma exportação como backup.");
  };

  const loadGroup = (g: SavedGroup) => {
    let nextChief = g.chiefName || initialChiefName;
    let nextEast = Array.isArray(g.eastNames) ? g.eastNames : initialEastNames;
    let nextWest = Array.isArray(g.westNames) ? g.westNames : initialWestNames;
    if ((!g.eastNames || !g.westNames) && Array.isArray(g.names)) {
      const legacy = splitLegacyNames(g.names);
      nextChief = legacy.chiefName;
      nextEast = legacy.eastNames;
      nextWest = legacy.westNames;
    }
    setTitle(g.title);
    setChiefName(nextChief);
    setEastNames(nextEast);
    setWestNames(nextWest);
    setStartLat(g.startLat);
    setStartLon(g.startLon);
    setEndLat(g.endLat);
    setEndLon(g.endLon);
    setGap(g.gap);
    setUseStart(g.useStart !== false);
    setUseEnd(g.useEnd !== false);
    setSingleMagneticHeading(g.singleMagneticHeading || "");
    setGenerated(null);
    setMessage("Turma carregada. Clique em Gerar / Atualizar posições.");
  };

  const share = async (b: BoatPosition) => {
    const text = `${result.title} | ${b.name}
${sideLabel(b.slot, gapValue)}
${result.useStart ? `Ponta inicial: ${formatPoint(b.start)}\n` : ""}${result.useEnd ? `Ponta final: ${formatPoint(b.end)}\n` : ""}
Conferir na carta náutica antes de usar.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Posição ${b.name}`, text });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Posição copiada para compartilhar.");
    } catch {
      setMessage(text);
    }
  };

  const exportPdf = async () => {
    if (!generated || isOutdated) return;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;

    const colors = {
      bgDark: [6, 28, 35] as const,
      bgPanel: [9, 46, 56] as const,
      bgPanelSoft: [13, 57, 67] as const,
      accent: [44, 211, 188] as const,
      accentSoft: [116, 255, 226] as const,
      chief: [151, 16, 29] as const,
      border: [29, 88, 96] as const,
      line: [214, 226, 229] as const,
      textDark: [17, 39, 44] as const,
      textMuted: [92, 112, 118] as const,
      white: [255, 255, 255] as const,
      zebra: [245, 250, 251] as const,
      lightChip: [234, 246, 244] as const,
    };

    const setColor = (kind: "fill" | "draw" | "text", rgb: readonly [number, number, number]) => {
      if (kind === "fill") pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
      else if (kind === "draw") pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
      else pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
    };

    const fmtDecl = `${Math.abs(result.declination).toFixed(2)}° ${result.declination < 0 ? "W" : "E"}`;
    const modeLabel = result.useStart && result.useEnd ? "Posição inicial + final" : result.useStart ? "Somente posição inicial" : "Somente posição final";
    const nowLabel = new Date().toLocaleString("pt-BR");

    const columns = (() => {
      const cols: { key: string; label: string; width: number }[] = [
        { key: "name", label: "Barco / Mestre", width: 40 },
        { key: "side", label: "Faixa", width: 38 },
      ];
      if (result.useStart && result.useEnd) {
        cols.push({ key: "start", label: "Ponta inicial (S / W)", width: 55 });
        cols.push({ key: "end", label: "Ponta final (S / W)", width: 55 });
      } else if (result.useStart) {
        cols.push({ key: "start", label: "Posição inicial (S / W)", width: 110 });
      } else {
        cols.push({ key: "end", label: "Posição final (S / W)", width: 110 });
      }
      return cols;
    })();

    const ellipsize = (value: string, width: number, fontSize = 9) => {
      if (!value) return "";
      pdf.setFontSize(fontSize);
      const maxWidth = width - 2;
      if (pdf.getTextWidth(value) <= maxWidth) return value;
      let out = value;
      while (out.length > 1 && pdf.getTextWidth(`${out}…`) > maxWidth) out = out.slice(0, -1);
      return `${out}…`;
    };

    const drawCard = (x: number, y: number, w: number, h: number, label: string, value: string, accent = false) => {
      setColor("fill", accent ? colors.bgPanelSoft : colors.bgPanel);
      setColor("draw", colors.border);
      pdf.roundedRect(x, y, w, h, 3, 3, "FD");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      setColor("text", accent ? colors.accentSoft : colors.white);
      pdf.text(label.toUpperCase(), x + 4, y + 4.8);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12.5);
      setColor("text", colors.white);
      const wrapped = pdf.splitTextToSize(value, w - 8).slice(0, 2);
      pdf.text(wrapped, x + 4, y + 11);
    };

    const drawHeader = () => {
      setColor("fill", colors.bgDark);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");

      setColor("fill", colors.bgPanel);
      pdf.roundedRect(margin, 10, contentWidth, 22, 4, 4, "F");
      setColor("fill", colors.accent);
      pdf.roundedRect(margin + 5, 15, 14, 12, 3, 3, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      setColor("text", colors.bgDark);
      pdf.text("PB", margin + 9.6, 23.1, { align: "center" });

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(17);
      setColor("text", colors.white);
      pdf.text(result.title.slice(0, 62), margin + 24, 20);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      setColor("text", colors.accentSoft);
      pdf.text("PAINEL DE BORDO • POSIÇÕES DE TURMA", margin + 24, 26);

      setColor("fill", colors.bgPanelSoft);
      pdf.roundedRect(pageWidth - margin - 56, 14, 51, 13, 3, 3, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.3);
      setColor("text", colors.white);
      pdf.text(`Exportado em ${nowLabel}`, pageWidth - margin - 52, 19.3);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.4);
      setColor("text", colors.accentSoft);
      pdf.text(`${WMM_MODEL} • ${result.magneticDate}`, pageWidth - margin - 52, 24.3);

      const gapCards = 4;
      const cardY = 38;
      const cardH = 18;
      const cardW = (contentWidth - gapCards * 3) / 4;
      drawCard(margin, cardY, cardW, cardH, "Rumo magnético", `${result.magneticBearing.toFixed(2)}° M`, true);
      drawCard(margin + cardW + 4, cardY, cardW, cardH, "Espaçamento", `${Number(result.gap).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MN`);
      drawCard(margin + (cardW + 4) * 2, cardY, cardW, cardH, "Embarcações", `${result.boats.length} barcos`);
      drawCard(margin + (cardW + 4) * 3, cardY, cardW, cardH, "Modo", modeLabel);

      const infoY = 61;
      const leftW = 103;
      const rightW = contentWidth - leftW - 4;
      setColor("fill", colors.white);
      setColor("draw", colors.border);
      pdf.roundedRect(margin, infoY, leftW, 28, 3, 3, "FD");
      pdf.roundedRect(margin + leftW + 4, infoY, rightW, 28, 3, 3, "FD");

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.8);
      setColor("text", colors.bgPanel);
      pdf.text("REFERÊNCIA OPERACIONAL", margin + 4, infoY + 5.2);
      pdf.text("RESUMO DA EXPORTAÇÃO", margin + leftW + 8, infoY + 5.2);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.1);
      setColor("text", colors.textDark);
      pdf.text(`Chefe / referência: ${chiefName || "—"}`, margin + 4, infoY + 11.2);
      if (result.useStart) pdf.text(`Ponta inicial: ${formatPoint(result.boats.find((b) => b.slot === 0)?.start || result.boats[0]?.start)}`, margin + 4, infoY + 16.6);
      if (result.useEnd) pdf.text(`${result.useStart ? "Ponta final" : "Posição final"}: ${formatPoint(result.boats.find((b) => b.slot === 0)?.end || result.boats[0]?.end)}`, margin + 4, infoY + (result.useStart ? 22 : 16.6));

      const summaryLines = [
        `Declinação magnética: ${fmtDecl}`,
        result.useStart && result.useEnd ? `Rede entre pontas: ${result.netLength.toFixed(2)} MN` : `Referência: ponto independente`,
        `Turma: ${westNames.length} terra • 1 chefe • ${eastNames.length} fora`,
      ];
      summaryLines.forEach((line, idx) => {
        pdf.text(line, margin + leftW + 8, infoY + 11.2 + idx * 5.3);
      });

      setColor("fill", colors.lightChip);
      setColor("draw", colors.border);
      pdf.roundedRect(margin, 92, contentWidth, 9, 3, 3, "FD");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      setColor("text", colors.textDark);
      const warning = "PLANEJAMENTO OPERACIONAL: confira carta náutica, rumo, afastamento, datum WGS84, obstáculos e orientação terra/fora antes do uso.";
      pdf.text(warning, margin + 4, 97.6);
    };

    const drawTableHeader = (y: number) => {
      let x = margin;
      setColor("fill", colors.bgPanelSoft);
      pdf.roundedRect(margin, y, contentWidth, 9, 2.4, 2.4, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.4);
      setColor("text", colors.white);
      for (const col of columns) {
        pdf.text(col.label, x + 2.5, y + 5.9);
        x += col.width;
      }
    };

    const drawFooter = (pageNumber: number) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.4);
      setColor("text", colors.accentSoft);
      pdf.text("Painel de Bordo • Posição • Exportação PDF", margin, pageHeight - 6);
      pdf.text(`Página ${pageNumber}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    };

    drawHeader();
    let pageNumber = 1;
    let y = 107;
    drawTableHeader(y);
    y += 11;

    const rowHeight = 10.2;
    for (let i = 0; i < result.boats.length; i++) {
      const b = result.boats[i];
      if (y + rowHeight > pageHeight - 14) {
        drawFooter(pageNumber);
        pdf.addPage();
        pageNumber += 1;
        drawHeader();
        y = 107;
        drawTableHeader(y);
        y += 11;
      }

      const chief = b.name.trim().toLocaleLowerCase() === chiefName.trim().toLocaleLowerCase();
      setColor("fill", chief ? colors.chief : i % 2 === 0 ? colors.white : colors.zebra);
      setColor("draw", chief ? colors.chief : colors.line);
      pdf.roundedRect(margin, y - 1.5, contentWidth, rowHeight, 1.8, 1.8, "FD");

      let x = margin;
      pdf.setFont("helvetica", chief ? "bold" : "normal");
      pdf.setFontSize(9);
      setColor("text", chief ? colors.white : colors.textDark);

      const values: Record<string, string> = {
        name: b.name,
        side: sideLabel(b.slot, gapValue),
        start: formatPoint(b.start),
        end: formatPoint(b.end),
      };
      for (const col of columns) {
        const val = ellipsize(values[col.key] || "", col.width, 9);
        pdf.text(val, x + 2.5, y + 4.8);
        x += col.width;
      }
      y += rowHeight + 1.3;
    }

    drawFooter(pageNumber);
    pdf.save("posicoes-turma.pdf");
  };


  return (
    <section className="position-page">
      <header className="position-head">
        <div>
          <small>MÓDULO DE TURMA</small>
          <h1>Posição</h1>
          <p>Planeje as pontas paralelas de rede e organize os mestres da turma.</p>
        </div>
        <Compass size={34} />
      </header>

      <div className="position-warning">Ferramenta de planejamento, não de navegação ou prevenção de colisão. Confira datum WGS84, rumo indicado, comprimento da rede, corrente, profundidade e afastamentos na carta náutica antes de distribuir posições.</div>

      <div className="position-layout">
        <div className="position-panel">
          <h2>01 · Posição de referência</h2>
          <label>Nome da turma ou referência<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="position-mode-controls" role="group" aria-label="Pontas que serão geradas">
            <label><input type="checkbox" checked={useStart} onChange={e => setUseStart(e.target.checked)} /> Ativar posição inicial</label>
            <label><input type="checkbox" checked={useEnd} onChange={e => setUseEnd(e.target.checked)} /> Ativar posição final</label>
          </div>
          <div className="position-coords">
            {useStart && <fieldset>
              <legend>Ponta inicial</legend>
              <label>Latitude Sul<input inputMode="numeric" value={startLat} onChange={(e) => setStartLat(formatCoordinateInput(e.target.value))} /></label>
              <label>Longitude Oeste<input inputMode="numeric" value={startLon} onChange={(e) => setStartLon(formatCoordinateInput(e.target.value))} /></label>
            </fieldset>}
            {useEnd && <fieldset>
              <legend>Ponta final</legend>
              <label>Latitude Sul<input inputMode="numeric" value={endLat} onChange={(e) => setEndLat(formatCoordinateInput(e.target.value))} /></label>
              <label>Longitude Oeste<input inputMode="numeric" value={endLon} onChange={(e) => setEndLon(formatCoordinateInput(e.target.value))} /></label>
            </fieldset>}
          </div>
          {useStart !== useEnd && <label>Rumo magnético de referência (°M) para distribuição lateral<input type="number" min="0" max="359.99" step="0.01" value={singleMagneticHeading} onChange={e => setSingleMagneticHeading(e.target.value)} placeholder="Ex.: 50,5" /><small className="position-muted">Obrigatório com uma ponta: determina a direção de afastamento para terra e fora.</small></label>}
          <div className="position-duo">
            <label>Rumo magnético de referência (°M)<input type="text" readOnly aria-readonly="true" value={draft.error ? "—" : `${draft.magneticBearing.toFixed(2)}° M`} title="Calculado automaticamente a partir das pontas e da declinação magnética" /><small className="position-muted">Com duas pontas é automático; com uma, usa o rumo informado.</small></label>
            <label>Espaçamento por barco (MN)<input type="number" min="0.01" max="20" step="0.01" value={gap} onChange={(e) => setGap(e.target.value)} /></label>
          </div>
          <div className="position-duo">
            <label>Data da variação magnética<input type="date" min="2025-01-01" max="2029-12-31" value={magneticDate} onChange={(e) => setMagneticDate(e.target.value)} /></label>
            <label>Declinação magnética · WMM2025<input type="text" readOnly value={draft.error ? "—" : `${Math.abs(draft.declination).toFixed(2)}° ${draft.declination < 0 ? "Oeste (W)" : "Leste (E)"}`} /></label>
          </div>
          <p className="position-muted">Modelo {WMM_MODEL} para a posição média da rede e a data escolhida.</p>
          <div className="position-quick"><span>Espaçamento rápido:</span>{[0.2, 0.25, 0.3].map((x) => <button key={x} className={Number(gap) === x ? "active" : ""} type="button" onClick={() => setGap(String(x))}>{x.toLocaleString("pt-BR")} MN</button>)}</div>
          <div className="position-metrics">
            {useStart && useEnd && <span>Rede entre pontas <strong>{draft.netLength.toFixed(2)} MN</strong></span>}
            <span>Rumo magnético (M) <strong>{draft.error ? "—" : `${draft.magneticBearing.toFixed(2)}° M`}</strong></span>
          </div>
          
          {draft.error && <p className="position-alert">{draft.error}</p>}
          <button className="position-generate" type="button" onClick={generatePositions} disabled={!!draft.error}><Compass size={18} /> {generated ? "Atualizar posições" : "Gerar posições"}</button>
          <p className="position-muted">Espaçamento em milhas náuticas: 25 décimos = 0,25 MN (aprox. 463 m).</p>
        </div>

        <div className="position-panel">
          <h2>02 · Turma de embarcações</h2>
          <p className="position-muted">Agora a turma é organizada por referência central, com uma lista para a turma de fora (leste) e outra para a turma de terra (oeste).</p>
          <div className="position-chief-card">
            <label>Chefe / referência central<input value={chiefName} maxLength={50} onChange={(e) => setChiefName(e.target.value)} /></label>
          </div>
          <div className="position-duo">
            <label>Barcos na turma de fora (Leste)<input type="number" min="0" max="30" value={eastNames.length} onChange={(e) => { const n = Math.max(0, Math.min(30, Number(e.target.value) || 0)); setEastNames((old) => expandNames(n, "Mestre fora", old)); }} /></label>
            <label>Barcos na turma de terra (Oeste)<input type="number" min="0" max="30" value={westNames.length} onChange={(e) => { const n = Math.max(0, Math.min(30, Number(e.target.value) || 0)); setWestNames((old) => expandNames(n, "Mestre terra", old)); }} /></label>
          </div>
          <p className="position-muted">Total de embarcações nesta turma: <strong>{totalBoats}</strong> ({westNames.length} na terra + chefe + {eastNames.length} por fora).</p>
          <div className="position-side-grid">
            <div className="position-side-card">
              <h3>Turma de fora · Leste</h3>
              <p className="position-muted">Ordem a partir do chefe: 0,25 · 0,50 · 0,75 MN...</p>
              <div className="position-name-list side-list">
                {eastNames.map((name, i) => (
                  <label key={`east-${i}`}>
                    <span>Leste {i + 1}</span>
                    <input aria-label={`Nome do mestre de fora ${i + 1}`} value={name} maxLength={50} onChange={(e) => setEastNames((old) => old.map((s, j) => (i === j ? e.target.value : s)))} />
                  </label>
                ))}
                {!eastNames.length && <p className="position-muted">Nenhum barco cadastrado na turma de fora.</p>}
              </div>
            </div>
            <div className="position-side-card">
              <h3>Turma de terra · Oeste</h3>
              <p className="position-muted">Ordem a partir do chefe: 0,25 · 0,50 · 0,75 MN...</p>
              <div className="position-name-list side-list">
                {westNames.map((name, i) => (
                  <label key={`west-${i}`}>
                    <span>Oeste {i + 1}</span>
                    <input aria-label={`Nome do mestre de terra ${i + 1}`} value={name} maxLength={50} onChange={(e) => setWestNames((old) => old.map((s, j) => (i === j ? e.target.value : s)))} />
                  </label>
                ))}
                {!westNames.length && <p className="position-muted">Nenhum barco cadastrado na turma de terra.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="position-panel position-results">
        <div className="position-actions-head">
          <div>
            <h2>03 · Posições calculadas</h2>
            <p className="position-muted">As faixas são deslocadas perpendicularmente ao rumo calculado ou informado. Confira a orientação de terra e fora na carta antes de usar.</p>
          </div>
          <div className="position-buttons">
            <button onClick={saveGroup} disabled={!generated || isOutdated}><Save size={16} /> Salvar turma</button>
            <button onClick={() => void exportPdf()} disabled={!generated || isOutdated || !result.boats.length}><FileDown size={16} /> PDF geral</button>
            <button onClick={() => download("posicoes-timezero.gpx", gpxOf(result.boats, result.title, gapValue, result.useStart, result.useEnd), "application/gpx+xml;charset=utf-8")} disabled={!generated || isOutdated || !result.boats.length}><Download size={16} /> GPX TimeZero</button>
          </div>
        </div>
        {isOutdated && <p className="position-alert">Os dados foram alterados. Clique em Atualizar posições para aplicar as mudanças antes de exportar ou compartilhar.</p>}
        {!generated && <p className="position-muted">Preencha os dados e clique em Gerar posições para ver as coordenadas de cada barco.</p>}
        {message && <p className="position-alert">{message}</p>}
        <div className="position-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Barco / Mestre</th>
                <th>Faixa</th>
                {result.useStart && <th>Ponta inicial</th>}
                {result.useEnd && <th>Ponta final</th>}
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {result.boats.map((b) => (
                <tr key={b.id} className={b.slot === 0 ? "position-central-row" : undefined}>
                  <td><strong>{b.name}</strong></td>
                  <td>{sideLabel(b.slot, gapValue)}</td>
                  {result.useStart && <td>{formatPoint(b.start)}</td>}
                  {result.useEnd && <td>{formatPoint(b.end)}</td>}
                  <td className="position-row-actions">
                    <button disabled={isOutdated} onClick={() => void share(b)}><Share2 size={15} /> Enviar</button>
                    <button disabled={isOutdated} onClick={() => download(`posicao-${b.id}.gpx`, gpxOf([b], `${result.title} ${b.name}`, gapValue, result.useStart, result.useEnd), "application/gpx+xml;charset=utf-8")}><Download size={15} /> GPX</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="position-panel">
        <h2>Turmas salvas neste dispositivo</h2>
        <p className="position-muted">Os dados ficam neste navegador e não sincronizam entre usuários ou equipamentos.</p>
        <div className="position-saved">
          {saved.map((g) => (
            <div key={g.id}>
              <span>
                <strong>{g.title}</strong>
                <small>{((g.westNames?.length || 0) + (g.eastNames?.length || 0) + 1) || (g.names?.length || 0)} barcos · {new Date(g.createdAt).toLocaleDateString("pt-BR")}</small>
              </span>
              <button onClick={() => loadGroup(g)}>Abrir</button>
              <button aria-label="Excluir turma" onClick={() => {
                if (!confirm("Excluir a turma salva?")) return;
                const next = saved.filter((x) => x.id !== g.id);
                setSaved(next);
                localStorage.setItem(KEY, JSON.stringify(next));
              }}><Trash2 size={16} /></button>
            </div>
          ))}
          {!saved.length && <p className="position-muted">Nenhuma turma salva.</p>}
        </div>
      </section>
    </section>
  );
}
