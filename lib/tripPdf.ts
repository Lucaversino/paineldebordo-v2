import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const kg = (value: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value) || 0)} kg`;
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "Não informada";
const time = (value?: string | null) => value ? new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "-";
const coord = (value: number | null, latitude: boolean) => {
  if (value == null) return "-";
  const absolute = Math.abs(Number(value));
  const degrees = Math.floor(absolute);
  const minutes = ((absolute - degrees) * 60).toFixed(2).padStart(5, "0");
  const direction = latitude ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  return `${String(degrees).padStart(2, "0")}°${minutes} ${direction}`;
};

export function generateTripPdf(trip: any, sets: any[], catches: any[], download = true) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const tripSets = sets.filter((item) => Number(item.tripId) === Number(trip.id)).sort((a, b) => a.setNumber - b.setNumber);
  const tripCatches = catches.filter((item) => Number(item.tripId) === Number(trip.id));
  const categoryTotal = (type: string) => tripCatches.filter((item) => (item.catchType || "PRIMARY") === type).reduce((sum, item) => sum + Number(item.weightKg || 0), 0);
  const corvinaTotal = categoryTotal("PRIMARY");
  const mixtureTotal = categoryTotal("MIXTURE");
  const discardTotal = categoryTotal("DISCARD");
  const total = corvinaTotal + mixtureTotal;
  const returnLabel = trip.returnDate || trip.status === "FINISHED" ? "Chegada" : "Chegada prevista";
  const returnValue = trip.returnDate || (trip.status === "FINISHED" ? null : trip.expectedReturnDate);
  const drawFooter = () => {
    const page = doc.getNumberOfPages();
    doc.setDrawColor(31, 207, 160);
    doc.line(16, 198, 281, 198);
    doc.setTextColor(94, 119, 124);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Documento administrativo de registro da atividade pesqueira.", 16, 203);
    doc.text(`Página ${page}`, 281, 203, { align: "right" });
  };

  doc.setFillColor(4, 32, 39);
  doc.rect(0, 0, 297, 42, "F");
  doc.setFillColor(31, 207, 160);
  doc.rect(0, 0, 7, 42, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("RELATÓRIO DE VIAGEM", 16, 17);
  doc.setFontSize(12);
  doc.text(trip.name, 16, 27);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(153, 201, 207);
  doc.setFontSize(9);
  doc.text("PAINEL DE BORDO - PESCA INDUSTRIAL", 16, 35);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(trip.boatName || "Embarcação", 281, 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Situação: ${trip.status === "FINISHED" ? "Finalizada" : trip.status === "IN_PROGRESS" ? "Em andamento" : "Planejada"}`, 281, 28, { align: "right" });
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 281, 35, { align: "right" });

  const details = [
    ["Embarcação", trip.boatName || "-"], ["Mestre", trip.captain || "-"],
    ["Saída", date(trip.departureDate)], [returnLabel, date(returnValue)],
    ["Porto de saída", trip.departurePort || "-"], ["Porto de retorno", trip.returnPort || "-"],
  ];
  details.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = 16 + column * 91;
    const y = 52 + row * 14;
    doc.setTextColor(83, 112, 119);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), x, y);
    doc.setTextColor(18, 41, 47);
    doc.setFontSize(10);
    doc.text(String(value), x, y + 5);
  });

  const cards = [["CORVINA", kg(corvinaTotal)], ["MISTURA", kg(mixtureTotal)], ["DESCARTE", kg(discardTotal)], ["LARGADAS", String(tripSets.length)]];
  cards.forEach(([label, value], index) => {
    const x = 16 + index * 67;
    doc.setFillColor(index === 0 ? 225 : 239, index === 0 ? 250 : 244, index === 0 ? 243 : 245);
    doc.roundedRect(x, 83, 62, 22, 2, 2, "F");
    doc.setTextColor(74, 107, 113);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(label, x + 5, 90);
    doc.setTextColor(index === 0 ? 5 : 16, index === 0 ? 139 : 42, index === 0 ? 108 : 48);
    doc.setFontSize(12);
    doc.text(value, x + 5, 100);
  });

  autoTable(doc, {
    startY: 114,
    margin: { left: 16, right: 16, bottom: 52 },
    head: [["Nº", "Data", "Início", "Final", "Prof.", "Posição inicial", "Posição final", "Corvina", "Mistura", "Descarte"]],
    body: tripSets.map((item) => {
      const setCatches = tripCatches.filter((entry) => Number(entry.fishingSetId) === Number(item.id));
      const sumType = (type: string) => setCatches.filter((entry) => (entry.catchType || "PRIMARY") === type).reduce((sum, entry) => sum + Number(entry.weightKg || 0), 0);
      const categoryCell = (type: string) => {
        const entries = setCatches.filter((entry) => (entry.catchType || "PRIMARY") === type);
        const names = [...new Set(entries.map((entry) => entry.species).filter(Boolean))];
        return `${kg(sumType(type))}${names.length ? `\n${names.join(", ")}` : ""}`;
      };
      return [
      String(item.setNumber).padStart(2, "0"), date(item.startedAt), time(item.startedAt), time(item.finishedAt),
      item.depthMeters ?? "-", `${coord(item.startLatitude, true)}\n${coord(item.startLongitude, false)}`,
      `${coord(item.endLatitude, true)}\n${coord(item.endLongitude, false)}`, categoryCell("PRIMARY"), categoryCell("MIXTURE"), categoryCell("DISCARD"),
    ];}),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3.2, textColor: [28, 53, 59], lineColor: [221, 232, 234], lineWidth: 0.15 },
    headStyles: { fillColor: [5, 54, 62], textColor: [255, 255, 255], fontStyle: "bold", halign: "left" },
    alternateRowStyles: { fillColor: [244, 249, 249] },
    columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 22 }, 2: { cellWidth: 16 }, 3: { cellWidth: 16 }, 4: { cellWidth: 14 }, 5: { cellWidth: 45 }, 6: { cellWidth: 45 }, 7: { cellWidth: 25, fontStyle: "bold" }, 8: { cellWidth: 25 }, 9: { cellWidth: 25 } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 9) {
        data.cell.styles.textColor = [180, 45, 52];
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: (data) => {
      drawFooter();
    },
  });

  if (!tripSets.length) {
    doc.setTextColor(100, 120, 125);
    doc.setFontSize(11);
    doc.text("Nenhuma largada registrada nesta viagem.", 148.5, 130, { align: "center" });
  }

  let tableEndY = (doc as any).lastAutoTable?.finalY ?? (tripSets.length ? 114 : 137);
  const speciesMap = new Map<string, { category: string; species: string; total: number; order: number }>();
  tripCatches.forEach((item) => {
    const type = item.catchType || "PRIMARY";
    const category = type === "MIXTURE" ? "MISTURA" : type === "DISCARD" ? "DESCARTE" : "CORVINA";
    const speciesName = item.species || (type === "PRIMARY" ? "Corvina" : "Não informada");
    const key = `${type}:${String(speciesName).toLocaleLowerCase("pt-BR")}`;
    const current = speciesMap.get(key) || { category, species: speciesName, total: 0, order: type === "PRIMARY" ? 0 : type === "MIXTURE" ? 1 : 2 };
    current.total += Number(item.weightKg || 0);
    speciesMap.set(key, current);
  });
  const speciesRows = [...speciesMap.values()].sort((a, b) => a.order - b.order || a.species.localeCompare(b.species, "pt-BR"));
  autoTable(doc, {
    startY: tableEndY + 9,
    margin: { left: 16, right: 16, bottom: 52 },
    head: [["RESUMO POR ESPÉCIE", "CLASSIFICAÇÃO", "TOTAL"]],
    body: speciesRows.map((item) => [item.species, item.category, kg(item.total)]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 3, textColor: [28, 53, 59], lineColor: [221, 232, 234], lineWidth: 0.15 },
    headStyles: { fillColor: [5, 54, 62], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 249, 249] },
    columnStyles: { 0: { cellWidth: 150, fontStyle: "bold" }, 1: { cellWidth: 65 }, 2: { cellWidth: 50, halign: "right", fontStyle: "bold" } },
    didParseCell: (data) => {
      const rawRow = data.row.raw;
      const classification = Array.isArray(rawRow) ? rawRow[1] : undefined;
      if (data.section === "body" && classification === "DESCARTE") {
        data.cell.styles.textColor = [180, 45, 52];
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: () => drawFooter(),
  });
  tableEndY = (doc as any).lastAutoTable?.finalY ?? tableEndY;
  let summaryY = Math.max(tableEndY + 8, tripSets.length ? 0 : 144);
  if (summaryY + 68 > 194) {
    doc.addPage();
    summaryY = 28;
    drawFooter();
  }

  const finalCards = [["TOTAL CORVINA", corvinaTotal], ["CORVINA + MISTURA", total], ["TOTAL DESCARTE", discardTotal]] as const;
  finalCards.forEach(([label, value], index) => {
    const x = 16 + index * 90;
    doc.setFillColor(index === 2 ? 255 : 235, index === 2 ? 240 : 249, index === 2 ? 240 : 246);
    doc.roundedRect(x, summaryY, 85, 24, 2, 2, "F");
    doc.setTextColor(66, 96, 103);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(label, x + 5, summaryY + 8);
    doc.setTextColor(index === 2 ? 160 : 5, index === 2 ? 53 : 139, index === 2 ? 61 : 108);
    doc.setFontSize(16);
    doc.text(kg(value), x + 5, summaryY + 19);
  });
  summaryY += 30;

  doc.setFillColor(4, 32, 39);
  doc.roundedRect(16, summaryY, 265, 34, 3, 3, "F");
  doc.setFillColor(31, 207, 160);
  doc.roundedRect(16, summaryY, 7, 34, 3, 3, "F");
  doc.rect(20, summaryY, 3, 34, "F");
  doc.setTextColor(142, 221, 204);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL CAPTURADO NA VIAGEM", 31, summaryY + 11);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(27);
  doc.text(kg(total), 31, summaryY + 27);
  doc.setTextColor(142, 221, 204);
  doc.setFontSize(8);
  doc.text(`${tripSets.length} ${tripSets.length === 1 ? "largada registrada" : "largadas registradas"}`, 272, summaryY + 22, { align: "right" });
  doc.setFontSize(7.5);
  doc.text("Total capturado = Corvina + Mistura. O descarte é apresentado separadamente.", 272, summaryY + 29, { align: "right" });

  const safeName = `${trip.boatName}-${trip.name}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `Relatorio-${safeName || "Viagem"}.pdf`;
  if (download) doc.save(filename);
  return new File([doc.output("blob")], filename, { type: "application/pdf" });
}
