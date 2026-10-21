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

function gpxOf(boats: BoatPosition[], title: string, gapValue: number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Painel de Bordo" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${escapeXml(title)}</name></metadata>
${boats
  .map(
    (b, i) =>
      `<rte><name>${escapeXml(`${i + 1} ${b.name} · ${sideLabel(b.slot, gapValue)}`)}</name><rtept lat="${b.start.lat.toFixed(8)}" lon="${b.start.lon.toFixed(8)}"><name>Inicio ${escapeXml(b.name)}</name></rtept><rtept lat="${b.end.lat.toFixed(8)}" lon="${b.end.lon.toFixed(8)}"><name>Final ${escapeXml(b.name)}</name></rtept></rte>`,
  )
  .join("\n")}
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
  const normalizedChiefName = chiefName.trim().toLocaleLowerCase();
  const isChiefBoat = (name: string) => name.trim().toLocaleLowerCase() === normalizedChiefName;

  const draft = useMemo(() => {
    try {
      const a = parsePosition(startLat, startLon);
      const b = parsePosition(endLat, endLon);
      const actualBearing = bearing(a, b);
      const netLength = distance(a, b);
      if (netLength < 0.01) throw new Error("A ponta inicial e final não podem ser iguais.");
      const ref = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
      const declination = magneticDeclination(ref.lat, ref.lon, new Date(`${magneticDate}T12:00:00Z`));
      const magneticBearing = (actualBearing - declination + 360) % 360;
      const h = actualBearing;
      const g = Number(gap);
      return { boats: makeFleet(a, b, h, g, fleetNames), actualBearing, magneticBearing, declination, netLength, error: "" };
    } catch (e) {
      return { boats: [] as BoatPosition[], actualBearing: 0, magneticBearing: 0, declination: 0, netLength: 0, error: e instanceof Error ? e.message : "Erro nos dados." };
    }
  }, [startLat, startLon, endLat, endLon, gap, fleetNames, magneticDate]);

  const [generated, setGenerated] = useState<null | {
    signature: string;
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
  const signature = JSON.stringify([title, startLat, startLon, endLat, endLon, gap, chiefName, eastNames, westNames, magneticDate]);
  const isOutdated = !!generated && generated.signature !== signature;
  const result = generated ? { ...generated, error: "" } : { boats: [] as BoatPosition[], actualBearing: 0, magneticBearing: 0, declination: 0, magneticDate, netLength: 0, error: "" };
  const gapValue = Number(result.gap || gap || 0);

  const generatePositions = () => {
    if (draft.error) {
      setMessage(draft.error);
      return;
    }
    setGenerated({ signature, boats: draft.boats, actualBearing: draft.actualBearing, magneticBearing: draft.magneticBearing, declination: draft.declination, magneticDate, netLength: draft.netLength, heading, gap, title });
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
    setGenerated(null);
    setMessage("Turma carregada. Clique em Gerar / Atualizar posições.");
  };

  const share = async (b: BoatPosition) => {
    const text = `${result.title} | ${b.name}
${sideLabel(b.slot, gapValue)}
Ponta inicial: ${formatPoint(b.start)}
Ponta final: ${formatPoint(b.end)}
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
    const pdf = new jsPDF({ orientation: "landscape" });
    pdf.setFontSize(16);
    pdf.text(result.title.slice(0, 65), 12, 16);
    pdf.setFontSize(9);
    pdf.text(`Rumo magnetico ${result.magneticBearing.toFixed(2)}° M | Variacao ${result.declination.toFixed(2)}° | ${WMM_MODEL} ${result.magneticDate}`, 12, 24);
    let y = 36;
    pdf.setFont("helvetica", "bold");
    pdf.text("Mestre", 12, y);
    pdf.text("Faixa", 68, y);
    pdf.text("Ponta inicial (S / W)", 110, y);
    pdf.text("Ponta final (S / W)", 208, y);
    pdf.setFont("helvetica", "normal");
    for (const b of result.boats) {
      if (y > 185) {
        pdf.addPage();
        y = 20;
      }
      y += 7;
      pdf.text(b.name.slice(0, 28), 12, y);
      pdf.text(sideLabel(b.slot, gapValue).slice(0, 28), 68, y);
      pdf.text(formatPoint(b.start), 110, y);
      pdf.text(formatPoint(b.end), 208, y);
    }
    pdf.setFontSize(8);
    pdf.text("PLANEJAMENTO: conferir coordenadas, rumo, afastamento e obstáculos em carta atualizada antes do uso.", 12, 200);
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
          <div className="position-coords">
            <fieldset>
              <legend>Ponta inicial</legend>
              <label>Latitude Sul<input inputMode="numeric" value={startLat} onChange={(e) => setStartLat(formatCoordinateInput(e.target.value))} /></label>
              <label>Longitude Oeste<input inputMode="numeric" value={startLon} onChange={(e) => setStartLon(formatCoordinateInput(e.target.value))} /></label>
            </fieldset>
            <fieldset>
              <legend>Ponta final</legend>
              <label>Latitude Sul<input inputMode="numeric" value={endLat} onChange={(e) => setEndLat(formatCoordinateInput(e.target.value))} /></label>
              <label>Longitude Oeste<input inputMode="numeric" value={endLon} onChange={(e) => setEndLon(formatCoordinateInput(e.target.value))} /></label>
            </fieldset>
          </div>
          <div className="position-duo">
            <label>Rumo magnético calculado automaticamente (°M)<input type="text" readOnly aria-readonly="true" value={draft.error ? "—" : `${draft.magneticBearing.toFixed(2)}° M`} title="Calculado automaticamente a partir das pontas e da declinação magnética" /><small className="position-muted">Atualiza conforme as pontas e a data escolhida.</small></label>
            <label>Espaçamento por barco (MN)<input type="number" min="0.01" max="20" step="0.01" value={gap} onChange={(e) => setGap(e.target.value)} /></label>
          </div>
          <div className="position-duo">
            <label>Data da variação magnética<input type="date" min="2025-01-01" max="2029-12-31" value={magneticDate} onChange={(e) => setMagneticDate(e.target.value)} /></label>
            <label>Declinação magnética · WMM2025<input type="text" readOnly value={draft.error ? "—" : `${Math.abs(draft.declination).toFixed(2)}° ${draft.declination < 0 ? "Oeste (W)" : "Leste (E)"}`} /></label>
          </div>
          <p className="position-muted">Modelo {WMM_MODEL} para a posição média da rede e a data escolhida.</p>
          <div className="position-quick"><span>Espaçamento rápido:</span>{[0.2, 0.25, 0.3].map((x) => <button key={x} className={Number(gap) === x ? "active" : ""} type="button" onClick={() => setGap(String(x))}>{x.toLocaleString("pt-BR")} MN</button>)}</div>
          <div className="position-metrics">
            <span>Rede entre pontas <strong>{draft.netLength.toFixed(2)} MN</strong></span>
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
            <p className="position-muted">As faixas são deslocadas perpendicularmente ao rumo calculado entre as pontas. Confira a orientação de terra e fora na carta antes de usar.</p>
          </div>
          <div className="position-buttons">
            <button onClick={saveGroup} disabled={!generated || isOutdated}><Save size={16} /> Salvar turma</button>
            <button onClick={() => void exportPdf()} disabled={!generated || isOutdated || !result.boats.length}><FileDown size={16} /> PDF geral</button>
            <button onClick={() => download("posicoes-timezero.gpx", gpxOf(result.boats, result.title, gapValue), "application/gpx+xml;charset=utf-8")} disabled={!generated || isOutdated || !result.boats.length}><Download size={16} /> GPX TimeZero</button>
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
                <th>Ponta inicial</th>
                <th>Ponta final</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {result.boats.map((b) => (
                <tr key={b.id} className={isChiefBoat(b.name) ? "position-central-row" : undefined}>
                  <td><strong>{b.name}</strong></td>
                  <td>{sideLabel(b.slot, gapValue)}</td>
                  <td>{formatPoint(b.start)}</td>
                  <td>{formatPoint(b.end)}</td>
                  <td className="position-row-actions">
                    <button disabled={isOutdated} onClick={() => void share(b)}><Share2 size={15} /> Enviar</button>
                    <button disabled={isOutdated} onClick={() => download(`posicao-${b.id}.gpx`, gpxOf([b], `${result.title} ${b.name}`, gapValue), "application/gpx+xml;charset=utf-8")}><Download size={15} /> GPX</button>
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
