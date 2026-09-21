"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Download,
  Fish,
  MapPinned,
  Share2,
  Skull,
  Waves,
} from "lucide-react";
import {
  environmentalSummary,
  formatCoordinate,
  formatKg,
  formatReportDate,
  formatReportTime,
  getDiscardCondition,
  tripReportData,
} from "../lib/tripReports";

type Props = {
  trip: any;
  sets: any[];
  catches: any[];
  onBack: () => void;
  onPdf: (trip: any, mode: "download" | "share", includeEnvironment: boolean) => void;
};

const num = (value: unknown, digits = 1) =>
  value == null || !Number.isFinite(Number(value))
    ? "—"
    : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: digits });

export default function TripFullReport({ trip, sets, catches, onBack, onPdf }: Props) {
  const report = useMemo(() => tripReportData(trip, sets, catches), [trip, sets, catches]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState("");

  useEffect(() => {
    let active = true;
    setWeatherLoading(true);
    setWeatherError("");
    fetch(`/api/environmental-snapshots?tripId=${trip.id}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar a meteorologia histórica.");
        if (active) setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
      })
      .catch((error) => active && setWeatherError(error instanceof Error ? error.message : "Falha ao carregar meteorologia."))
      .finally(() => active && setWeatherLoading(false));
    return () => { active = false; };
  }, [trip.id]);

  const env = environmentalSummary(snapshots);
  const envBySet = useMemo(() => new Map(snapshots.map((item) => [Number(item.fishingSetId), item])), [snapshots]);

  return (
    <div className="full-trip-report">
      <div className="full-report-toolbar">
        <button type="button" className="finished-back" onClick={onBack}><ArrowLeft /> Voltar para {new Date(trip.departureDate).getFullYear()}</button>
        <div className="full-report-actions">
          <button type="button" onClick={() => onPdf(trip, "download", true)}><Download /> PDF completo</button>
          <button type="button" onClick={() => onPdf(trip, "share", true)}><Share2 /> Compartilhar PDF</button>
        </div>
      </div>

      <header className="full-report-hero">
        <div>
          <small>RELATÓRIO COMPLETO DA VIAGEM</small>
          <h3>{trip.name}</h3>
          <p>{trip.boatName} · {formatReportDate(trip.departureDate)} até {formatReportDate(trip.returnDate || trip.expectedReturnDate)}</p>
        </div>
        <strong>{report.attainment.toFixed(1).replace(".", ",")}% <span>da meta</span></strong>
      </header>

      <section className="full-report-kpis">
        <article><Fish /><small>TOTAL CAPTURADO</small><b>{formatKg(report.landed)}</b><span>Principal + mistura</span></article>
        <article><Waves /><small>LARGADAS</small><b>{report.tripSets.length}</b><span>{formatKg(report.averageSet)} por largada</span></article>
        <article><CalendarDays /><small>DIAS DE VIAGEM</small><b>{report.duration}</b><span>{formatKg(report.averageDay)} por dia</span></article>
        <article className="discard-alive"><Fish /><small>DESCARTE VIVO</small><b>{formatKg(report.discardAlive)}</b><span>Registrado como vivo</span></article>
        <article className="discard-dead"><Skull /><small>DESCARTE MORTO</small><b>{formatKg(report.discardDead)}</b><span>Registrado como morto</span></article>
      </section>

      <section className="annual-summary-strip trip-summary-strip">
        <span><small>PRINCIPAL</small><b>{formatKg(report.primary)}</b></span>
        <span><small>MISTURA</small><b>{formatKg(report.mixture)}</b></span>
        <span><small>DESCARTE TOTAL</small><b>{formatKg(report.discard)}</b></span>
        <span><small>META</small><b>{formatKg(report.target)}</b></span>
      </section>

      <section className="full-report-panel">
        <div className="full-report-heading"><CalendarDays /><div><small>DADOS DA VIAGEM</small><h4>Informações operacionais</h4></div></div>
        <div className="trip-detail-grid">
          <span><small>EMBARCAÇÃO</small><b>{trip.boatName || "—"}</b></span>
          <span><small>MESTRE</small><b>{trip.captain || "—"}</b></span>
          <span><small>TRIPULAÇÃO</small><b>{trip.crewCount || 0}</b></span>
          <span><small>TIPO DE PESCA</small><b>{trip.fishingType || "—"}</b></span>
          <span><small>SAÍDA</small><b>{formatReportDate(trip.departureDate)} · {formatReportTime(trip.departureDate)}</b></span>
          <span><small>CHEGADA</small><b>{formatReportDate(trip.returnDate || trip.expectedReturnDate)} · {formatReportTime(trip.returnDate || trip.expectedReturnDate)}</b></span>
          <span><small>PORTO DE SAÍDA</small><b>{trip.departurePort || "—"}</b></span>
          <span><small>PORTO DE RETORNO</small><b>{trip.returnPort || "—"}</b></span>
        </div>
        {trip.notes && <p className="trip-report-notes"><b>Observações:</b> {trip.notes}</p>}
      </section>

      <section className="full-report-panel">
        <div className="full-report-heading"><MapPinned /><div><small>REGIÃO GEOGRÁFICA TRABALHADA</small><h4>{report.geography.label}</h4></div></div>
        <p>{report.geography.detail}</p>
        {report.geography.pointCount > 0 && <div className="geography-grid">
          <span><small>LATITUDE SUL</small><b>{formatCoordinate(report.geography.minLat, true)}</b></span>
          <span><small>LATITUDE NORTE</small><b>{formatCoordinate(report.geography.maxLat, true)}</b></span>
          <span><small>LONGITUDE OESTE</small><b>{formatCoordinate(report.geography.minLon, false)}</b></span>
          <span><small>LONGITUDE LESTE</small><b>{formatCoordinate(report.geography.maxLon, false)}</b></span>
        </div>}
        <em>Região aproximada pelas coordenadas registradas nas largadas; não usa geocodificação externa.</em>
      </section>

      <section className="full-report-panel">
        <div className="full-report-heading"><Waves /><div><small>METEOROLOGIA HISTÓRICA</small><h4>Resumo das condições registradas</h4></div></div>
        {weatherLoading ? <p>Carregando registros ambientais salvos...</p> : weatherError ? <p>{weatherError}</p> : env.count ? (
          <div className="weather-summary-grid">
            <span><small>VENTO MÉDIO</small><b>{num(env.windSpeedKmh)} km/h</b><em>{env.windDirection}</em></span>
            <span><small>RAJADA MÉDIA</small><b>{num(env.gustKmh)} km/h</b></span>
            <span><small>ONDA MÉDIA</small><b>{num(env.waveHeightM)} m</b></span>
            <span><small>SWELL MÉDIO</small><b>{num(env.swellHeightM)} m</b></span>
            <span><small>TEMP. DO MAR</small><b>{num(env.seaTemperatureC)} °C</b></span>
            <span><small>CORRENTE</small><b>{num(env.currentKmh)} km/h</b><em>{env.currentDirection}</em></span>
            <span><small>CLOROFILA</small><b>{num(env.chlorophyllMgM3, 2)} mg/m³</b></span>
            <span><small>SNAPSHOTS</small><b>{env.count}/{report.tripSets.length}</b></span>
          </div>
        ) : <p>Nenhum registro ambiental salvo para esta viagem.</p>}
      </section>

      <section className="full-report-panel">
        <div className="full-report-heading"><Fish /><div><small>PRODUÇÃO</small><h4>Resumo por espécie e classificação</h4></div></div>
        <div className="full-report-tablewrap">
          <table>
            <thead><tr><th>Espécie</th><th>Classificação</th><th>Condição</th><th>Total</th></tr></thead>
            <tbody>
              {report.species.map((item, index) => <tr key={`${item.species}-${item.category}-${item.condition}-${index}`}>
                <td><b>{item.species}</b></td><td>{item.category}</td><td>{item.condition}</td><td><b>{formatKg(item.total)}</b></td>
              </tr>)}
              {!report.species.length && <tr><td colSpan={4}>Nenhuma captura registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="full-report-panel">
        <div className="full-report-heading"><Waves /><div><small>LARGADAS</small><h4>Todos os dados operacionais e meteorológicos</h4></div></div>
        <div className="full-report-tablewrap wide">
          <table>
            <thead><tr><th>#</th><th>Data / horário</th><th>Rede</th><th>Posição inicial</th><th>Posição final</th><th>Captura</th><th>Descarte</th><th>Meteorologia</th></tr></thead>
            <tbody>
              {report.tripSets.map((set) => {
                const setCatches = report.tripCatches.filter((item) => Number(item.fishingSetId) === Number(set.id));
                const captured = setCatches.filter((item) => item.catchType !== "DISCARD").reduce((sum, item) => sum + Number(item.weightKg || 0), 0);
                const discards = setCatches.filter((item) => item.catchType === "DISCARD");
                const envRow = envBySet.get(Number(set.id));
                return <tr key={set.id}>
                  <td><b>#{String(set.setNumber).padStart(2, "0")}</b></td>
                  <td>{formatReportDate(set.startedAt)}<small>{formatReportTime(set.startedAt)} – {formatReportTime(set.finishedAt)}</small></td>
                  <td>{set.netLengthMeters ? `${num(set.netLengthMeters, 0)} m` : "—"}<small>{set.depthMeters ? `${num(set.depthMeters, 0)} m prof.` : ""}</small></td>
                  <td>{formatCoordinate(set.startLatitude, true)}<small>{formatCoordinate(set.startLongitude, false)}</small></td>
                  <td>{formatCoordinate(set.endLatitude, true)}<small>{formatCoordinate(set.endLongitude, false)}</small></td>
                  <td><b>{formatKg(captured)}</b></td>
                  <td>{discards.length ? discards.map((item) => <span className="discard-line" key={item.id}>{item.species}: {formatKg(item.weightKg)} · {getDiscardCondition(item)}</span>) : "—"}</td>
                  <td>{envRow ? <><b>{num(envRow.windSpeedKmh)} km/h {envRow.windDirection || ""}</b><small>Onda {num(envRow.waveHeightM)} m · Temp. {num(envRow.seaTemperatureC)} °C · Clorofila {num(envRow.chlorophyllMgM3, 2)}</small></> : <small>Sem snapshot salvo</small>}</td>
                </tr>;
              })}
              {!report.tripSets.length && <tr><td colSpan={8}>Nenhuma largada registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
