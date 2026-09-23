"use client";

import { useMemo, useState } from "react";
import { Compass } from "lucide-react";

function parseClock(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!minutes) return `${hours}h`;
  if (!hours) return `${minutes}min`;
  return `${hours}h ${minutes}min`;
}

export default function NavigationCalculator() {
  const [distance, setDistance] = useState("");
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");

  const result = useMemo(() => {
    const nauticalMiles = Number(distance.trim().replace(",", "."));
    const departureMinutes = parseClock(departure);
    const arrivalMinutes = parseClock(arrival);

    if (!Number.isFinite(nauticalMiles) || nauticalMiles <= 0 || departureMinutes == null || arrivalMinutes == null) {
      return null;
    }

    let availableMinutes = arrivalMinutes - departureMinutes;
    const nextDay = availableMinutes <= 0;
    if (nextDay) availableMinutes += 24 * 60;
    if (availableMinutes <= 0) return null;

    const availableHours = availableMinutes / 60;
    return {
      availableMinutes,
      nextDay,
      speed: nauticalMiles / availableHours,
    };
  }, [distance, departure, arrival]);

  return (
    <section className="navigation-calculator" aria-label="Cálculo de navegação">
      <div className="navigation-calculator-head">
        <span className="navigation-calculator-icon"><Compass aria-hidden="true" /></span>
        <div>
          <small>CÁLCULO DE NAVEGAÇÃO</small>
          <b>Velocidade média para chegar no horário</b>
        </div>
      </div>

      <div className="navigation-calculator-fields">
        <label>
          <span>Distância</span>
          <div className="navigation-calculator-distance">
            <input
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
              inputMode="decimal"
              placeholder="40"
              aria-label="Distância em milhas náuticas"
            />
            <em>MN</em>
          </div>
        </label>
        <label>
          <span>Saída</span>
          <input type="time" value={departure} onChange={(event) => setDeparture(event.target.value)} aria-label="Hora de saída" />
        </label>
        <label>
          <span>Chegada</span>
          <input type="time" value={arrival} onChange={(event) => setArrival(event.target.value)} aria-label="Hora desejada de chegada" />
        </label>
      </div>

      <div className={`navigation-calculator-result${result ? " has-result" : ""}`} aria-live="polite">
        <div>
          <small>TEMPO DISPONÍVEL</small>
          <span>{result ? formatDuration(result.availableMinutes) : "—"}{result?.nextDay ? " · dia seguinte" : ""}</span>
        </div>
        <div className="navigation-calculator-speed">
          <small>VELOCIDADE NECESSÁRIA</small>
          <strong>{result ? result.speed.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"} <em>nós</em></strong>
        </div>
      </div>
    </section>
  );
}
