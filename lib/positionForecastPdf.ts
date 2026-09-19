import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const number = (value: unknown, digits = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const mph = (value: unknown, digits = 2) => {
  if (value == null || value === "") return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return (parsed / 1.609344).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const when = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

function nauticalPositionPdf(lat: number, lon: number) {
  const part = (value: number, direction: "S" | "W") => {
    const absolute = Math.abs(Number(value));
    const degrees = Math.floor(absolute);
    const minutes = (absolute - degrees) * 60;
    return `${degrees}° ${minutes.toFixed(2)}' ${direction}`;
  };
  return `${part(lat, "S")}   ·   ${part(lon, "W")}`;
}

export function createPositionForecastPdf(data: any) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const forecast = Array.isArray(data?.forecast) ? data.forecast : [];
  const currentRows = forecast.filter((item: any) => Number.isFinite(Number(item?.currentKmh)));

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
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 281, 34, { align: "right" });

  doc.setTextColor(27, 54, 61);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("POSICAO CONSULTADA", 16, 49);
  doc.setFontSize(18);
  doc.setTextColor(4, 52, 58);
  doc.text(nauticalPositionPdf(Number(data?.position?.lat || 0), Number(data?.position?.lon || 0)), 16, 59);

  const geographyLabel = data?.position?.geography?.label || "Referencia geografica indisponivel";
  const distanceKm = Number(data?.position?.geography?.distanceKm);
  const depthM = Number(data?.position?.depthM);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(22, 74, 78);
  doc.text(`Perto de: ${geographyLabel}`, 16, 67);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 117, 120);
  if (Number.isFinite(distanceKm) && distanceKm > 1) {
    doc.text(`Distancia aproximada da referencia: ${distanceKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`, 16, 73);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(4, 52, 58);
  doc.text(Number.isFinite(depthM) ? `Profundidade estimada: ${Math.round(depthM)} m` : "Profundidade estimada: sem leitura", 170, 67);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(90, 117, 120);
  doc.text("Batimetria GEBCO_2026 - valor modelado, nao usar para navegacao", 170, 73);

  doc.setTextColor(27, 54, 61);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CONDICOES AGORA", 16, 82);

  autoTable(doc, {
    startY: 86,
    margin: { left: 16, right: 16 },
    theme: "grid",
    head: [["Vento", "Rajadas", "Direcao", "Onda", "Periodo", "Corrente de mare", "Temp. mar", "Clorofila"]],
    body: [[
      `${number(data?.current?.windSpeedKmh)} km/h`,
      `${number(data?.current?.gustKmh)} km/h`,
      `${data?.current?.windDirection || "-"} (${number(data?.current?.windDirectionDeg, 0)}°)`,
      `${number(data?.current?.waveHeightM)} m`,
      `${number(data?.current?.wavePeriodS)} s`,
      `${mph(data?.current?.currentKmh)} mph · ${data?.current?.currentDirection || "-"}`,
      `${number(data?.current?.seaTemperatureC)} °C`,
      `${number(data?.current?.chlorophyllMgM3, 2)} mg/m³`,
    ]],
    styles: { fontSize: 8, cellPadding: 2.3 },
    headStyles: { fillColor: [14, 63, 72], textColor: [255, 255, 255] },
  });

  const afterCurrent = (doc as any).lastAutoTable?.finalY || 72;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PREVISAO POR HORARIO - VENTO, ONDAS E CORRENTES DE MARE", 16, afterCurrent + 9);

  autoTable(doc, {
    startY: afterCurrent + 13,
    margin: { left: 16, right: 16 },
    theme: "striped",
    head: [["Horario", "Vento", "Rajada", "Dir. vento", "Onda", "Dir. onda", "Periodo", "Swell", "Corrente", "Temp."]],
    body: forecast.map((item: any) => [
      when(item.time),
      `${number(item.windSpeedKmh, 0)} km/h`,
      `${number(item.gustKmh, 0)} km/h`,
      item.windDirection || "-",
      `${number(item.waveHeightM)} m`,
      item.waveDirection || "-",
      `${number(item.wavePeriodS)} s`,
      `${number(item.swellHeightM)} m`,
      `${mph(item.currentKmh)} mph · ${item.currentDirection || "-"}`,
      `${number(item.seaTemperatureC)} °C`,
    ]),
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [12, 78, 86], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [239, 247, 247] },
  });

  const forecastEnd = (doc as any).lastAutoTable?.finalY || 160;
  let y = forecastEnd + 9;
  if (y > 165) {
    doc.addPage();
    y = 18;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CORRENTES DE MARE MODELADAS - DETALHE", 16, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(92, 119, 124);
  doc.text("Velocidade e direcao da corrente do oceano; o modelo inclui contribuicoes de maré e ondas.", 16, y + 5);
  autoTable(doc, {
    startY: y + 9,
    margin: { left: 16, right: 16 },
    theme: "plain",
    head: [["Horario", "Velocidade", "Unidade", "Direcao", "Graus"]],
    body: currentRows.slice(0, 12).map((item: any) => [
      when(item.time),
      `${mph(item.currentKmh)} mph`,
      "milhas/h",
      item.currentDirection || "-",
      `${number(item.currentDirectionDeg, 0)}°`,
    ]),
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
