import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const num = (value: unknown, digits = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const mph = (kmh: unknown) => {
  const n = Number(kmh);
  return Number.isFinite(n) ? n / 1.609344 : null;
};

const dmm = (value: unknown, latitude: boolean) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const absolute = Math.abs(n);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  const direction = latitude ? (n < 0 ? "S" : "N") : n < 0 ? "W" : "E";
  return `${String(degrees).padStart(2, "0")}° ${minutes.toFixed(2)}' ${direction}`;
};

const hour = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(11, 16) || "-";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const date = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString("pt-BR");
};

type Series = {
  key: string;
  label: string;
  color: [number, number, number];
  suffix: string;
  transform?: (value: unknown) => number | null;
};

function drawLineChart(
  doc: jsPDF,
  title: string,
  rows: any[],
  series: Series[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  doc.setFillColor(246, 250, 250);
  doc.setDrawColor(215, 229, 231);
  doc.roundedRect(x, y, width, height, 2, 2, "FD");
  doc.setTextColor(23, 61, 67);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(title, x + 5, y + 8);

  const plotX = x + 13;
  const plotY = y + 15;
  const plotW = width - 19;
  const plotH = height - 27;
  const values = rows.flatMap((row) => series.map((item) => {
    const raw = item.transform ? item.transform(row[item.key]) : Number(row[item.key]);
    return Number.isFinite(Number(raw)) ? Number(raw) : null;
  })).filter((value): value is number => value != null);

  if (!rows.length || !values.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(104, 124, 128);
    doc.text("Sem dados suficientes para montar este gráfico.", x + 5, y + 23);
    return;
  }

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min = Math.max(0, min - 1);
    max += 1;
  }
  if (min > 0) min = 0;
  const range = max - min || 1;

  doc.setDrawColor(223, 233, 235);
  doc.setLineWidth(0.15);
  for (let i = 0; i <= 4; i++) {
    const yy = plotY + (plotH * i) / 4;
    doc.line(plotX, yy, plotX + plotW, yy);
    const label = max - (range * i) / 4;
    doc.setFontSize(6);
    doc.setTextColor(102, 124, 128);
    doc.text(num(label, label < 10 ? 1 : 0), plotX - 2, yy + 1, { align: "right" });
  }

  const denom = Math.max(1, rows.length - 1);
  series.forEach((item) => {
    doc.setDrawColor(...item.color);
    doc.setLineWidth(0.8);
    let previous: { x: number; y: number } | null = null;
    rows.forEach((row, index) => {
      const transformed = item.transform ? item.transform(row[item.key]) : Number(row[item.key]);
      const value = Number(transformed);
      if (!Number.isFinite(value)) {
        previous = null;
        return;
      }
      const px = plotX + (index / denom) * plotW;
      const py = plotY + plotH - ((value - min) / range) * plotH;
      if (previous) doc.line(previous.x, previous.y, px, py);
      doc.setFillColor(...item.color);
      doc.circle(px, py, 0.65, "F");
      previous = { x: px, y: py };
    });
  });

  const labelStep = rows.length > 6 ? 2 : 1;
  rows.forEach((row, index) => {
    if (index % labelStep !== 0 && index !== rows.length - 1) return;
    const px = plotX + (index / denom) * plotW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.7);
    doc.setTextColor(95, 118, 122);
    doc.text(String(row.time || "").slice(11, 16), px, plotY + plotH + 5, { align: "center" });
  });

  let legendX = x + 5;
  series.forEach((item) => {
    doc.setFillColor(...item.color);
    doc.circle(legendX + 1.5, y + height - 5, 1, "F");
    doc.setFontSize(6.3);
    doc.setTextColor(73, 96, 100);
    doc.text(`${item.label} (${item.suffix})`, legendX + 4, y + height - 3.7);
    legendX += 45;
  });
}

export function generateSetWeatherPdf(input: {
  fishingSet: any;
  trip: any;
  snapshot: any;
  captureKg?: number;
  download?: boolean;
}) {
  const { fishingSet, trip, snapshot } = input;
  const captureKg = Number(input.captureKg || fishingSet?.total || 0);
  const rows = Array.isArray(snapshot?.payload?.dayForecast) ? snapshot.payload.dayForecast : [];

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const setLabel = `#${String(fishingSet?.setNumber || 0).padStart(2, "0")}`;

  doc.setFillColor(4, 32, 39);
  doc.rect(0, 0, 297, 38, "F");
  doc.setFillColor(31, 207, 160);
  doc.rect(0, 0, 7, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`ANÁLISE METEOROLÓGICA DA LARGADA ${setLabel}`, 16, 16);
  doc.setFontSize(11);
  doc.text(trip?.name || "Viagem", 16, 26);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(151, 202, 207);
  doc.setFontSize(8);
  doc.text(`${trip?.boatName || "Embarcação"} • ${date(fishingSet?.startedAt)} • ${hour(fishingSet?.startedAt)}–${hour(fishingSet?.finishedAt)}`, 16, 33);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 281, 31, { align: "right" });

  const detailRows = [
    ["Posição inicial", `${dmm(fishingSet?.startLatitude, true)}  ·  ${dmm(fishingSet?.startLongitude, false)}`],
    ["Profundidade", fishingSet?.depthMeters != null ? `${num(fishingSet.depthMeters, 0)} m` : "-"],
    ["Captura da largada", `${num(captureKg, 0)} kg`],
    ["Fonte", snapshot?.sourceMode === "HISTORICAL_BACKFILL" ? "Dados históricos/modelados" : "Snapshot do dia"],
  ];
  autoTable(doc, {
    startY: 45,
    margin: { left: 16, right: 16 },
    body: detailRows,
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2.2, textColor: [32, 63, 68] },
    columnStyles: { 0: { cellWidth: 38, fontStyle: "bold", textColor: [74, 105, 110] }, 1: { cellWidth: 94 } },
  });

  const cardY = 76;
  const cards = [
    ["VENTO", `${num(snapshot?.windSpeedKmh)} km/h`, snapshot?.windDirection || "-"],
    ["RAJADA", `${num(snapshot?.gustKmh)} km/h`, "no horário da largada"],
    ["ONDA", `${num(snapshot?.waveHeightM)} m`, `${snapshot?.waveDirection || "-"} • ${num(snapshot?.wavePeriodS)} s`],
    ["CORRENTE", `${num(mph(snapshot?.currentKmh), 2)} mph`, snapshot?.currentDirection || "-"],
    ["TEMP. MAR", `${num(snapshot?.seaTemperatureC)} °C`, "superfície"],
    ["CLOROFILA", snapshot?.chlorophyllMgM3 == null ? "-" : `${num(snapshot.chlorophyllMgM3, 2)} mg/m³`, snapshot?.lunarPhase || "-"],
  ];
  cards.forEach(([label, value, sub], index) => {
    const w = 42;
    const gap = 3;
    const x = 16 + index * (w + gap);
    doc.setFillColor(239, 248, 247);
    doc.setDrawColor(203, 226, 222);
    doc.roundedRect(x, cardY, w, 23, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(70, 105, 109);
    doc.text(label, x + 4, cardY + 7);
    doc.setFontSize(11);
    doc.setTextColor(5, 113, 91);
    doc.text(value, x + 4, cardY + 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.setTextColor(101, 127, 131);
    doc.text(sub, x + 4, cardY + 20);
  });

  drawLineChart(doc, "Vento e rajadas ao longo do dia", rows, [
    { key: "windSpeedKmh", label: "Vento", color: [25, 152, 122], suffix: "km/h" },
    { key: "gustKmh", label: "Rajada", color: [214, 135, 45], suffix: "km/h" },
  ], 16, 106, 128, 72);

  drawLineChart(doc, "Ondas e swell ao longo do dia", rows, [
    { key: "waveHeightM", label: "Onda", color: [41, 120, 176], suffix: "m" },
    { key: "swellHeightM", label: "Swell", color: [90, 85, 170], suffix: "m" },
  ], 153, 106, 128, 72);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(92, 116, 120);
  doc.text("Dados meteorológicos, oceanográficos e satelitais modelados para análise histórica. Não substituem referências oficiais de navegação ou segurança.", 16, 191);
  doc.text("Página 1", 281, 191, { align: "right" });

  doc.addPage();
  doc.setFillColor(4, 32, 39);
  doc.rect(0, 0, 297, 30, "F");
  doc.setFillColor(31, 207, 160);
  doc.rect(0, 0, 7, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(`LARGADA ${setLabel} — EVOLUÇÃO DO DIA`, 16, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(151, 202, 207);
  doc.text(`${date(fishingSet?.startedAt)} • posição ${dmm(fishingSet?.startLatitude, true)} / ${dmm(fishingSet?.startLongitude, false)}`, 16, 22);

  drawLineChart(doc, "Corrente do mar (milhas por hora)", rows, [
    { key: "currentKmh", label: "Corrente", color: [16, 145, 132], suffix: "mph", transform: mph },
  ], 16, 38, 128, 67);

  drawLineChart(doc, "Temperatura da superfície do mar", rows, [
    { key: "seaTemperatureC", label: "Temperatura", color: [213, 93, 73], suffix: "°C" },
  ], 153, 38, 128, 67);

  autoTable(doc, {
    startY: 114,
    margin: { left: 16, right: 16, bottom: 18 },
    head: [["Hora", "Vento", "Rajada", "Onda", "Período", "Swell", "Corrente", "Temp. mar", "Nível MSL"]],
    body: rows.map((row: any) => [
      String(row.time || "").slice(11, 16),
      `${num(row.windSpeedKmh)} km/h`,
      `${num(row.gustKmh)} km/h`,
      `${num(row.waveHeightM)} m`,
      `${num(row.wavePeriodS)} s`,
      `${num(row.swellHeightM)} m`,
      `${num(mph(row.currentKmh), 2)} mph`,
      `${num(row.seaTemperatureC)} °C`,
      `${num(row.seaLevelMslM, 2)} m`,
    ]),
    styles: { fontSize: 7, cellPadding: 2, textColor: [28, 53, 59], lineColor: [221, 232, 234], lineWidth: 0.12 },
    headStyles: { fillColor: [5, 54, 62], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 249, 249] },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 150;
  if (finalY < 188) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 72, 76);
    doc.setFontSize(8);
    doc.text("Resumo da largada", 16, finalY + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(80, 106, 111);
    doc.text(
      `No horário registrado: vento ${num(snapshot?.windSpeedKmh)} km/h, rajadas ${num(snapshot?.gustKmh)} km/h, onda ${num(snapshot?.waveHeightM)} m, corrente ${num(mph(snapshot?.currentKmh), 2)} mph e temperatura do mar ${num(snapshot?.seaTemperatureC)} °C. Captura registrada: ${num(captureKg, 0)} kg.`,
      16,
      finalY + 14,
      { maxWidth: 265 },
    );
  }

  const safe = `${trip?.boatName || "Barco"}-${trip?.name || "Viagem"}-Largada-${String(fishingSet?.setNumber || 0).padStart(2, "0")}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `Meteorologia-${safe || "Largada"}.pdf`;
  if (input.download !== false) doc.save(filename);
  return new File([doc.output("blob")], filename, { type: "application/pdf" });
}
