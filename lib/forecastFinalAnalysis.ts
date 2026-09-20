export type ForecastAnalysisItem = {
  title: string;
  value: string;
  text: string;
  tone: "teal" | "blue" | "violet" | "amber" | "green";
};

export type ForecastFinalAnalysis = {
  headline: string;
  summary: string;
  items: ForecastAnalysisItem[];
  fishingNote: string;
};

function num(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmt(value: number | null, digits = 1) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function chlorophyllBand(value: number | null) {
  if (value == null) return "sem leitura válida";
  if (value < 0.1) return "muito baixa";
  if (value < 0.3) return "baixa";
  if (value < 0.6) return "moderada";
  if (value < 1.2) return "elevada";
  if (value < 2) return "muito elevada";
  return "alta concentração";
}

export function buildForecastFinalAnalysis(data: any): ForecastFinalAnalysis {
  const current = data?.current || {};
  const weekly = Array.isArray(data?.weeklyForecast) ? data.weeklyForecast : [];

  const satChl = num(current.chlorophyllMgM3);
  const forecastChl = weekly.map((d: any) => num(d?.chlorophyllMgM3)).filter((v: number | null): v is number => v != null);
  const firstForecast = forecastChl.length ? forecastChl[0] : null;
  const lastForecast = forecastChl.length ? forecastChl[forecastChl.length - 1] : null;
  const avgForecast = forecastChl.length ? forecastChl.reduce((a: number, b: number) => a + b, 0) / forecastChl.length : null;

  let chlCompare = "Sem dados suficientes para comparar satélite e modelo.";
  if (satChl != null && firstForecast != null) {
    const delta = satChl - firstForecast;
    const abs = Math.abs(delta);
    if (abs < 0.05) {
      chlCompare = `Satélite e Copernicus estão próximos hoje: diferença de ${fmt(abs, 2)} mg/m³.`;
    } else if (delta > 0) {
      chlCompare = `O satélite está ${fmt(abs, 2)} mg/m³ acima do modelo. Isso pode indicar uma mancha superficial/local que o modelo de área maior suaviza.`;
    } else {
      chlCompare = `O satélite está ${fmt(abs, 2)} mg/m³ abaixo do modelo. A observação local pode estar mais limpa que a média representada pelo modelo.`;
    }
  }

  let trend = "sem tendência semanal disponível";
  if (firstForecast != null && lastForecast != null) {
    const diff = lastForecast - firstForecast;
    const threshold = Math.max(0.03, Math.abs(firstForecast) * 0.12);
    trend = Math.abs(diff) < threshold
      ? "tendência estável na semana"
      : diff > 0
        ? `tendência de aumento (+${fmt(diff, 2)} mg/m³)`
        : `tendência de queda (${fmt(diff, 2)} mg/m³)`;
  }

  const wind = num(current.windSpeedKmh);
  const gust = num(current.gustKmh);
  const wave = num(current.waveHeightM);
  const currentMph = num(current.currentKmh);
  const temp = num(current.seaTemperatureC);
  const depth = num(data?.position?.depthM);
  const condition = String(current.condition || "Condição não classificada");

  const seaText = condition.toLowerCase().includes("aten")
    ? "Vento ou onda estão em faixa que merece atenção operacional. Confira também rajadas e evolução por horário."
    : condition.toLowerCase().includes("moder")
      ? "Mar e vento estão em faixa moderada. Observe as próximas horas antes de usar apenas a condição atual como referência."
      : "Mar e vento aparecem mais tranquilos pelos limites usados no painel, mas as condições podem mudar ao longo do período.";

  const currentText = currentMph == null
    ? "Sem corrente válida para interpretar neste momento."
    : `Corrente de ${fmt(currentMph / 1.609344, 2)} mph para ${current.currentDirection || "direção não informada"}. Use junto com as mudanças de clorofila e temperatura para identificar zonas de transição.`;

  const tempText = temp == null
    ? "Sem temperatura superficial válida."
    : `Temperatura superficial de ${fmt(temp, 1)} °C. O valor isolado não define presença de peixe; ele ganha valor quando comparado com frentes, corrente e histórico da área.`;

  const depthText = depth == null
    ? "Sem profundidade estimada para a coordenada consultada."
    : `Profundidade estimada de ${fmt(depth, 0)} m. Use a metragem junto com seu histórico de largadas e o comportamento da espécie-alvo.`;

  const headline = condition.toUpperCase();
  const summary = satChl == null
    ? `${condition}. A leitura final combina vento, mar, corrente, temperatura, profundidade e a previsão do Copernicus.`
    : `${condition}. Clorofila atual por satélite em ${fmt(satChl, 2)} mg/m³ (${chlorophyllBand(satChl)}), com ${trend}.`;

  const items: ForecastAnalysisItem[] = [
    {
      title: "CLOROFILA ATUAL · SATÉLITE",
      value: satChl == null ? "Sem leitura" : `${fmt(satChl, 2)} mg/m³ · ${chlorophyllBand(satChl).toUpperCase()}`,
      text: `${chlCompare} A leitura atual é observação de superfície por satélite.`,
      tone: "green",
    },
    {
      title: "CLOROFILA · PREVISÃO COPERNICUS",
      value: avgForecast == null ? "Sem previsão" : `Média 7 dias ${fmt(avgForecast, 2)} mg/m³`,
      text: `Modelo para os próximos dias: ${trend}. Ele representa uma área maior e pode suavizar manchas pequenas vistas pelo satélite.`,
      tone: "teal",
    },
    {
      title: "VENTO E MAR",
      value: `${wind == null ? "—" : `${fmt(wind, 0)} km/h`} · onda ${wave == null ? "—" : `${fmt(wave, 1)} m`}`,
      text: `${seaText}${gust != null ? ` Rajadas atuais de ${fmt(gust, 0)} km/h.` : ""}`,
      tone: "blue",
    },
    {
      title: "CORRENTE",
      value: currentMph == null ? "Sem leitura" : `${fmt(currentMph / 1.609344, 2)} mph · ${current.currentDirection || "—"}`,
      text: currentText,
      tone: "violet",
    },
    {
      title: "TEMPERATURA DO MAR",
      value: temp == null ? "Sem leitura" : `${fmt(temp, 1)} °C`,
      text: tempText,
      tone: "amber",
    },
    {
      title: "METRAGEM",
      value: depth == null ? "Sem leitura" : `${fmt(depth, 0)} m`,
      text: depthText,
      tone: "teal",
    },
  ];

  return {
    headline,
    summary,
    items,
    fishingNote: "Leitura automática para facilitar a interpretação dos dados. Clorofila, vento, mar, corrente, temperatura e profundidade devem ser analisados em conjunto; o resultado não garante presença nem captura de peixe.",
  };
}
