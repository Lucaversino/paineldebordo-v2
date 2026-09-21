import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { annualReportData, formatCoordinate, formatReportDate, formatKg } from "./tripReports";

const pdfKg = (value: unknown) => formatKg(value);
const n = (value: unknown, digits = 1) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: digits });

export function generateAnnualReportPdf(year: number, trips: any[], sets: any[], catches: any[], snapshots: any[] = [], download = true) {
  const report = annualReportData(year, trips, sets, catches, snapshots);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const footer = () => {
    doc.setDrawColor(31, 207, 160);
    doc.line(16, 198, 281, 198);
    doc.setTextColor(94, 119, 124);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text("Relatório anual consolidado a partir das viagens finalizadas registradas no PAINEL DE BORDO.", 16, 203);
    doc.text(`Página ${doc.getNumberOfPages()}`, 281, 203, { align: "right" });
  };
  const header = (subtitle = "RELATÓRIO ANUAL") => {
    doc.setFillColor(4, 32, 39); doc.rect(0, 0, 297, 38, "F");
    doc.setFillColor(31, 207, 160); doc.rect(0, 0, 7, 38, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(`${subtitle} — ${year}`, 16, 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(153, 201, 207); doc.text("PAINEL DE BORDO - PESCA INDUSTRIAL", 16, 26);
    doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 281, 26, { align: "right" });
  };

  header();
  const cards = [
    ["VIAGENS", String(report.tripCount)], ["CAPTURA", pdfKg(report.landed)], ["LARGADAS", String(report.setCount)],
    ["DIAS", String(report.days)], ["DESC. VIVO", pdfKg(report.discardAlive)], ["DESC. MORTO", pdfKg(report.discardDead)],
  ];
  cards.forEach(([label, value], index) => {
    const x = 16 + (index % 3) * 90; const y = 49 + Math.floor(index / 3) * 27;
    const isAlive = label === "DESC. VIVO";
    const isDead = label === "DESC. MORTO";
    doc.setFillColor(isDead ? 255 : isAlive ? 232 : 239, isDead ? 239 : isAlive ? 249 : 247, isDead ? 239 : isAlive ? 244 : 246); doc.roundedRect(x, y, 84, 21, 2, 2, "F");
    doc.setTextColor(74, 107, 113); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text(label, x + 5, y + 7);
    doc.setTextColor(isDead ? 168 : 5, isDead ? 50 : 120, isDead ? 58 : 99); doc.setFontSize(13); doc.text(value, x + 5, y + 16);
  });
  doc.setTextColor(86, 104, 109); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.text(`Descarte anual separado: Vivo ${pdfKg(report.discardAlive)} • Morto ${pdfKg(report.discardDead)} • Total ${pdfKg(report.discard)}`, 16, 106);

  doc.setTextColor(18, 41, 47); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("REGIÃO GEOGRÁFICA TRABALHADA", 16, 114);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(70, 96, 102);
  const geoText = `${report.geography.label}. ${report.geography.detail}`;
  doc.text(doc.splitTextToSize(geoText, 265), 16, 122);

  autoTable(doc, {
    startY: 138,
    margin: { left: 16, right: 16, bottom: 16 },
    head: [["Viagem", "Embarcação", "Período", "Dias", "Largadas", "Captura", "Principal", "Mistura", "Desc. vivo", "Desc. morto"]],
    body: report.rows.map(({ trip, report: item }) => [
      `${trip.name}\n${item.geography.routeLabel}`, trip.boatName || "—", `${formatReportDate(trip.departureDate)} → ${formatReportDate(trip.returnDate || trip.expectedReturnDate)}`,
      item.duration, item.tripSets.length, pdfKg(item.landed), pdfKg(item.primary), pdfKg(item.mixture), pdfKg(item.discardAlive), pdfKg(item.discardDead),
    ]),
    styles: { font: "helvetica", fontSize: 7.4, cellPadding: 2.5, textColor: [28, 53, 59], lineColor: [221, 232, 234], lineWidth: 0.15 },
    headStyles: { fillColor: [5, 54, 62], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 249, 249] },
    didDrawPage: () => footer(),
  });

  doc.addPage(); header("PRODUÇÃO POR ESPÉCIE");
  autoTable(doc, {
    startY: 47, margin: { left: 16, right: 16, bottom: 18 },
    head: [["Espécie", "Classificação", "Condição", "Total"]],
    body: report.species.map((item) => [item.species, item.category, item.condition, pdfKg(item.total)]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 3, textColor: [28, 53, 59], lineColor: [221, 232, 234], lineWidth: 0.15 },
    headStyles: { fillColor: [5, 54, 62], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 249, 249] },
    columnStyles: { 0: { cellWidth: 120, fontStyle: "bold" }, 1: { cellWidth: 60 }, 2: { cellWidth: 45 }, 3: { cellWidth: 50, halign: "right", fontStyle: "bold" } },
    didDrawPage: () => footer(),
  });

  doc.addPage(); header("METEOROLOGIA E ÁREA TRABALHADA");
  const env = report.environment;
  const weatherRows = [
    ["Snapshots ambientais", String(env.count)], ["Vento médio", `${n(env.windSpeedKmh)} km/h · ${env.windDirection}`],
    ["Rajada média", `${n(env.gustKmh)} km/h`], ["Onda média", `${n(env.waveHeightM)} m`], ["Swell médio", `${n(env.swellHeightM)} m`],
    ["Temperatura média do mar", `${n(env.seaTemperatureC)} °C`], ["Corrente média", `${n(env.currentKmh)} km/h · ${env.currentDirection}`],
    ["Clorofila média", `${n(env.chlorophyllMgM3, 2)} mg/m³`],
  ];
  autoTable(doc, {
    startY: 48, margin: { left: 16, right: 160 },
    head: [["RESUMO AMBIENTAL", "VALOR"]], body: weatherRows,
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [28, 53, 59] }, headStyles: { fillColor: [5, 54, 62], textColor: [255, 255, 255] },
  });
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(18, 41, 47); doc.text("COORDENADAS EXTREMAS", 158, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70, 96, 102);
  const coords = [
    `Latitude sul: ${formatCoordinate(report.geography.minLat, true)}`,
    `Latitude norte: ${formatCoordinate(report.geography.maxLat, true)}`,
    `Longitude oeste: ${formatCoordinate(report.geography.minLon, false)}`,
    `Longitude leste: ${formatCoordinate(report.geography.maxLon, false)}`,
  ];
  doc.text(coords, 158, 61);
  doc.setFontSize(8); doc.text(doc.splitTextToSize("A região anual é uma aproximação baseada nas coordenadas salvas. Para cada viagem, a tabela da primeira página resume a área trabalhada do extremo mais ao Sul ao extremo mais ao Norte, calculada analisando todas as largadas. Os dados ambientais já estão armazenados; o relatório não força novas consultas de previsão.", 120), 158, 90);
  footer();

  const filename = `Relatorio-Anual-${year}-Painel-de-Bordo.pdf`;
  if (download) doc.save(filename);
  return new File([doc.output("blob")], filename, { type: "application/pdf" });
}
