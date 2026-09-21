import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { tripReportData, formatCoordinate } from "./tripReports";

const kg = (value: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value) || 0)} kg`;
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "Não informada";
const time = (value?: string | null) => value ? new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "-";
const discardCondition = (item: any) => {
  const direct = String(item?.discardCondition || "").toUpperCase();
  if (direct === "VIVO" || direct === "MORTO") return direct;
  return String(item?.notes || "").match(/^\[DESCARTE:(VIVO|MORTO)\]/i)?.[1]?.toUpperCase() || "NÃO INFORMADO";
};
const coord = (value: number | null, latitude: boolean) => {
  if (value == null) return "-";
  const absolute = Math.abs(Number(value));
  const degrees = Math.floor(absolute);
  const minutes = ((absolute - degrees) * 60).toFixed(2).padStart(5, "0");
  const direction = latitude ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  return `${String(degrees).padStart(2, "0")}°${minutes} ${direction}`;
};

export function generateTripPdf(trip: any, sets: any[], catches: any[], download = true, environmentalSnapshots: any[] = []) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const tripSets = sets.filter((item) => Number(item.tripId) === Number(trip.id)).sort((a, b) => a.setNumber - b.setNumber);
  const tripCatches = catches.filter((item) => Number(item.tripId) === Number(trip.id));
  const report = tripReportData(trip, sets, catches);
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
        const names = [...new Set(entries.map((entry) => entry.species ? `${entry.species}${type === "DISCARD" ? ` (${discardCondition(entry).toLocaleLowerCase("pt-BR")})` : ""}` : null).filter(Boolean))];
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
  const speciesMap = new Map<string, { category: string; species: string; condition: string; total: number; order: number }>();
  tripCatches.forEach((item) => {
    const type = item.catchType || "PRIMARY";
    const category = type === "MIXTURE" ? "MISTURA" : type === "DISCARD" ? "DESCARTE" : "CORVINA";
    const speciesName = item.species || (type === "PRIMARY" ? "Corvina" : "Não informada");
    const condition = type === "DISCARD" ? discardCondition(item) : "—";
    const key = `${type}:${String(speciesName).toLocaleLowerCase("pt-BR")}:${condition}`;
    const current = speciesMap.get(key) || { category, species: speciesName, condition, total: 0, order: type === "PRIMARY" ? 0 : type === "MIXTURE" ? 1 : 2 };
    current.total += Number(item.weightKg || 0);
    speciesMap.set(key, current);
  });
  const speciesRows = [...speciesMap.values()].sort((a, b) => a.order - b.order || a.species.localeCompare(b.species, "pt-BR"));
  autoTable(doc, {
    startY: tableEndY + 9,
    margin: { left: 16, right: 16, bottom: 52 },
    head: [["RESUMO POR ESPÉCIE", "CLASSIFICAÇÃO", "CONDIÇÃO", "TOTAL"]],
    body: speciesRows.map((item) => [item.species, item.category, item.condition, kg(item.total)]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 3, textColor: [28, 53, 59], lineColor: [221, 232, 234], lineWidth: 0.15 },
    headStyles: { fillColor: [5, 54, 62], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 249, 249] },
    columnStyles: { 0: { cellWidth: 120, fontStyle: "bold" }, 1: { cellWidth: 55 }, 2: { cellWidth: 40, fontStyle: "bold" }, 3: { cellWidth: 50, halign: "right", fontStyle: "bold" } },
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

  doc.addPage();
  doc.setFillColor(4, 32, 39);
  doc.rect(0, 0, 297, 32, "F");
  doc.setFillColor(31, 207, 160);
  doc.rect(0, 0, 7, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("REGIÃO TRABALHADA E DESCARTE", 16, 15);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(153, 201, 207);
  doc.setFontSize(8.5);
  doc.text("Área calculada pelas posições registradas nas largadas • classificação Vivo/Morto preservada", 16, 23);

  doc.setTextColor(18, 41, 47);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TRAJETO GEOGRÁFICO DA VIAGEM", 16, 45);
  doc.setFontSize(13);
  doc.text(report.geography.routeLabel, 16, 55);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(70, 96, 102);
  doc.text("Extremos encontrados analisando todas as posições iniciais e finais de todas as largadas.", 16, 65);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(18, 41, 47);
  doc.text(`MAIS AO SUL: ${formatCoordinate(report.geography.southPoint?.lat, true)} / ${formatCoordinate(report.geography.southPoint?.lon, false)} — ${report.geography.southRegion}`, 16, 78);
  doc.text(`MAIS AO NORTE: ${formatCoordinate(report.geography.northPoint?.lat, true)} / ${formatCoordinate(report.geography.northPoint?.lon, false)} — ${report.geography.northRegion}`, 16, 88);
  doc.setTextColor(102, 122, 126);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("A longitude é sempre a longitude do próprio ponto extremo encontrado; não mistura limites de largadas diferentes.", 16, 95);
  doc.setTextColor(45, 78, 84);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(`Meta: ${kg(report.target)}  •  Tripulação: ${trip.crewCount || 0}  •  Tipo de pesca: ${trip.fishingType || "—"}  •  Duração: ${report.duration} dia(s)`, 16, 101);

  const discardCards = [["DESCARTE VIVO", report.discardAlive], ["DESCARTE MORTO", report.discardDead], ["NÃO INFORMADO", report.discardUnknown]] as const;
  discardCards.forEach(([label, value], index) => {
    const x = 16 + index * 90;
    doc.setFillColor(index === 1 ? 255 : 240, index === 1 ? 239 : 247, index === 1 ? 239 : 246);
    doc.roundedRect(x, 106, 84, 25, 2, 2, "F");
    doc.setTextColor(83, 112, 119); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.text(label, x + 5, 115);
    doc.setTextColor(index === 1 ? 168 : 5, index === 1 ? 50 : 139, index === 1 ? 58 : 108); doc.setFontSize(15); doc.text(kg(value), x + 5, 126);
  });

  const discardRows = report.tripCatches.filter((item: any) => (item.catchType || "PRIMARY") === "DISCARD");
  autoTable(doc, {
    startY: 142,
    margin: { left: 16, right: 16, bottom: 18 },
    head: [["Espécie descartada", "Condição", "Peso", "Largada"]],
    body: discardRows.map((item: any) => [item.species || "Não informada", discardCondition(item), kg(item.weightKg), `#${String(report.tripSets.find((set: any) => Number(set.id) === Number(item.fishingSetId))?.setNumber || "-").padStart(2, "0")}`]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 3, textColor: [28, 53, 59], lineColor: [221, 232, 234], lineWidth: 0.15 },
    headStyles: { fillColor: [5, 54, 62], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 249, 249] },
    didDrawPage: () => drawFooter(),
  });
  if (!discardRows.length) {
    doc.setTextColor(100, 120, 125); doc.setFontSize(9); doc.text("Nenhum descarte registrado nesta viagem.", 16, 151);
  }
  drawFooter();

  if (environmentalSnapshots.length) {
    doc.addPage();
    doc.setFillColor(4, 32, 39);
    doc.rect(0, 0, 297, 32, "F");
    doc.setFillColor(31, 207, 160);
    doc.rect(0, 0, 7, 32, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("DADOS AMBIENTAIS DAS LARGADAS", 16, 15);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(153, 201, 207);
    doc.setFontSize(8.5);
    doc.text("Anexo opcional • previsão/registro ambiental preservado para análise histórica e IA", 16, 23);

    const envBySet = new Map(environmentalSnapshots.map((item: any) => [Number(item.fishingSetId), item]));
    const num = (value: any, digits = 1) => value == null || !Number.isFinite(Number(value)) ? "-" : Number(value).toFixed(digits).replace(".", ",");
    autoTable(doc, {
      startY: 40,
      margin: { left: 12, right: 12, bottom: 18 },
      head: [["Largada", "Data/hora", "Vento", "Rajada", "Onda", "Swell", "Temp. mar", "Maré MSL", "Corrente", "Clorofila", "Lua", "Fonte"]],
      body: tripSets.map((set: any) => {
        const env = envBySet.get(Number(set.id));
        if (!env) return [
          `#${String(set.setNumber).padStart(2, "0")}`, `${date(set.startedAt)} ${time(set.startedAt)}`,
          "Sem snapshot", "-", "-", "-", "-", "-", "-", "-", "-", "Pendente",
        ];
        return [
          `#${String(set.setNumber).padStart(2, "0")}`,
          `${date(env.referenceTime || set.startedAt)} ${time(env.referenceTime || set.startedAt)}`,
          `${num(env.windSpeedKmh)} km/h
${env.windDirection || "-"}`,
          `${num(env.gustKmh)} km/h`,
          `${num(env.waveHeightM)} m
${env.waveDirection || "-"} • ${num(env.wavePeriodS)} s`,
          `${num(env.swellHeightM)} m
${env.swellDirection || "-"} • ${num(env.swellPeriodS)} s`,
          `${num(env.seaTemperatureC)} °C`,
          `${num(env.seaLevelMslM, 2)} m`,
          `${num(env.currentKmh)} km/h
${env.currentDirection || "-"}`,
          env.chlorophyllMgM3 == null ? "-" : `${num(env.chlorophyllMgM3, 2)} mg/m³`,
          `${env.lunarPhase || "-"}${env.lunarIllumination == null ? "" : `
${num(Number(env.lunarIllumination) * 100, 0)}%`}`,
          env.sourceMode === "HISTORICAL_BACKFILL" ? "Histórico" : "Previsão do dia",
        ];
      }),
      styles: { font: "helvetica", fontSize: 6.8, cellPadding: 2.2, textColor: [28, 53, 59], lineColor: [221, 232, 234], lineWidth: 0.12, valign: "middle" },
      headStyles: { fillColor: [5, 54, 62], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.8 },
      alternateRowStyles: { fillColor: [244, 249, 249] },
      columnStyles: {
        0: { cellWidth: 13 }, 1: { cellWidth: 27 }, 2: { cellWidth: 28 }, 3: { cellWidth: 18 },
        4: { cellWidth: 31 }, 5: { cellWidth: 31 }, 6: { cellWidth: 20 }, 7: { cellWidth: 20 },
        8: { cellWidth: 29 }, 9: { cellWidth: 24 }, 10: { cellWidth: 25 }, 11: { cellWidth: 22 },
      },
      didDrawPage: () => drawFooter(),
    });

    const complete = environmentalSnapshots.filter((item: any) => item.status === "COMPLETE").length;
    const partial = environmentalSnapshots.filter((item: any) => item.status === "PARTIAL").length;
    const finalY = (doc as any).lastAutoTable?.finalY ?? 50;
    if (finalY < 184) {
      doc.setTextColor(86, 109, 115);
      doc.setFontSize(7.5);
      doc.text(`Cobertura ambiental: ${environmentalSnapshots.length}/${tripSets.length} largadas • completas ${complete} • parciais ${partial}. Dados ambientais são modelados/satelitais e servem para análise histórica; não substituem referências oficiais de navegação.`, 16, Math.min(190, finalY + 8));
    }
    drawFooter();
  }

  const safeName = `${trip.boatName}-${trip.name}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `Relatorio-${safeName || "Viagem"}.pdf`;
  if (download) doc.save(filename);
  return new File([doc.output("blob")], filename, { type: "application/pdf" });
}
