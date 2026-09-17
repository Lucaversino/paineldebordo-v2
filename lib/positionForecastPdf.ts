import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const number = (value: unknown, digits = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const when = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export function createPositionForecastPdf(data: any) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const forecast = Array.isArray(data?.forecast) ? data.forecast : [];
  const extrema = Array.isArray(data?.tide?.extrema) ? data.tide.extrema : [];

  doc.setFillColor(4, 32, 39);
  doc.rect(0, 0, 297, 40, "F");
  doc.setFillColor(31, 207, 160);
  doc.rect(0, 0, 7, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PREVISAO OCEANICA POR POSICAO", 16, 16);
  doc.setFontSize(11);
  doc.text("PAINEL DE BORDO - PESCA INDUSTRIAL", 16, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(156, 201, 207);
  doc.text(`Posicao: ${Math.abs(Number(data?.position?.lat || 0)).toFixed(4)} S | ${Math.abs(Number(data?.position?.lon || 0)).toFixed(4)} W`, 16, 34);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 281, 34, { align: "right" });

  doc.setTextColor(27, 54, 61);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CONDICOES AGORA", 16, 50);

  autoTable(doc, {
    startY: 54,
    margin: { left: 16, right: 16 },
    theme: "grid",
    head: [["Vento", "Rajadas", "Direcao", "Onda", "Periodo", "Mare modelada", "Temp. mar", "Clorofila"]],
    body: [[
      `${number(data?.current?.windSpeedKmh)} km/h`,
      `${number(data?.current?.gustKmh)} km/h`,
      `${data?.current?.windDirection || "-"} (${number(data?.current?.windDirectionDeg, 0)}°)`,
      `${number(data?.current?.waveHeightM)} m`,
      `${number(data?.current?.wavePeriodS)} s`,
      `${number(data?.current?.seaLevelMslM, 2)} m`,
      `${number(data?.current?.seaTemperatureC)} °C`,
      `${number(data?.current?.chlorophyllMgM3, 2)} mg/m³`,
    ]],
    styles: { fontSize: 8, cellPadding: 2.3 },
    headStyles: { fillColor: [14, 63, 72], textColor: [255, 255, 255] },
  });

  const afterCurrent = (doc as any).lastAutoTable?.finalY || 72;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PREVISAO POR HORARIO - VENTO, ONDAS E MARE", 16, afterCurrent + 9);

  autoTable(doc, {
    startY: afterCurrent + 13,
    margin: { left: 16, right: 16 },
    theme: "striped",
    head: [["Horario", "Vento", "Rajada", "Dir. vento", "Onda", "Dir. onda", "Periodo", "Swell", "Mare", "Temp."]],
    body: forecast.map((item: any) => [
      when(item.time),
      `${number(item.windSpeedKmh, 0)} km/h`,
      `${number(item.gustKmh, 0)} km/h`,
      item.windDirection || "-",
      `${number(item.waveHeightM)} m`,
      item.waveDirection || "-",
      `${number(item.wavePeriodS)} s`,
      `${number(item.swellHeightM)} m`,
      `${number(item.seaLevelMslM, 2)} m`,
      `${number(item.seaTemperatureC)} °C`,
    ]),
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [12, 78, 86], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [239, 247, 247] },
  });

  const forecastEnd = (doc as any).lastAutoTable?.finalY || 160;
  let y = forecastEnd + 9;
  if (y > 185) {
    doc.addPage();
    y = 18;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PICOS DE NIVEL DO MAR MODELADOS", 16, y);
  autoTable(doc, {
    startY: y + 4,
    margin: { left: 16, right: 16 },
    theme: "plain",
    head: [["Tipo", "Horario", "Nivel"]],
    body: extrema.map((item: any) => [item.type === "HIGH" ? "ALTA" : "BAIXA", when(item.time), `${number(item.height, 2)} m`]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [14, 63, 72], textColor: [255, 255, 255] },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(31, 207, 160);
    doc.line(16, 198, 281, 198);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(92, 119, 124);
    doc.text("Dados modelados para apoio operacional. Nao usar como referencia unica de navegacao costeira.", 16, 203);
    doc.text(`Pagina ${page}`, 281, 203, { align: "right" });
  }

  return doc;
}

export function downloadPositionForecastPdf(data: any) {
  const doc = createPositionForecastPdf(data);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`previsao-oceanica-${stamp}.pdf`);
}
