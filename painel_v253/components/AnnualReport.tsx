"use client";

import { useMemo } from "react";
import { ArrowLeft, CalendarDays, Download, Fish, MapPinned, Share2, Skull, Waves } from "lucide-react";
import { annualReportData, formatKg, formatReportDate, formatCoordinate } from "../lib/tripReports";

type Props = {
  year: number;
  trips: any[];
  sets: any[];
  catches: any[];
  snapshots: any[];
  onBack: () => void;
  onOpenTrip: (tripId: number) => void;
  onPdf: (mode: "download" | "share") => void;
};

const num = (value: unknown, digits = 1) =>
  value == null || !Number.isFinite(Number(value))
    ? "—"
    : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: digits });

export default function AnnualReport({ year, trips, sets, catches, snapshots, onBack, onOpenTrip, onPdf }: Props) {
  const report = useMemo(() => annualReportData(year, trips, sets, catches, snapshots), [year, trips, sets, catches, snapshots]);
  return (
    <div className="annual-report">
      <div className="full-report-toolbar">
        <button type="button" className="finished-back" onClick={onBack}><ArrowLeft /> Voltar para anos</button>
        <div className="full-report-actions">
          <button type="button" onClick={() => onPdf("download")}><Download /> PDF anual</button>
          <button type="button" onClick={() => onPdf("share")}><Share2 /> Compartilhar PDF</button>
        </div>
      </div>

      <header className="annual-report-hero">
        <div><small>PAINEL DE BORDO · RELATÓRIO ANUAL</small><h3>{year}</h3><p>Somente viagens finalizadas neste ano.</p></div>
        <strong>{report.tripCount}<span>{report.tripCount === 1 ? " viagem" : " viagens"}</span></strong>
      </header>

      <section className="full-report-kpis annual">
        <article><Fish /><small>TOTAL CAPTURADO</small><b>{formatKg(report.landed)}</b><span>Principal + mistura</span></article>
        <article><Waves /><small>LARGADAS</small><b>{report.setCount}</b><span>{formatKg(report.averageSet)} por largada</span></article>
        <article><CalendarDays /><small>DIAS DE PESCA</small><b>{report.days}</b><span>{formatKg(report.averageDay)} por dia</span></article>
        <article className="discard-alive"><Fish /><small>DESCARTE VIVO</small><b>{formatKg(report.discardAlive)}</b><span>Consolidado anual</span></article>
        <article className="discard-dead"><Skull /><small>DESCARTE MORTO</small><b>{formatKg(report.discardDead)}</b><span>Consolidado anual</span></article>
      </section>

      <section className="annual-summary-strip">
        <span><small>PRINCIPAL</small><b>{formatKg(report.primary)}</b></span>
        <span><small>MISTURA</small><b>{formatKg(report.mixture)}</b></span>
        <span><small>DESCARTE TOTAL</small><b>{formatKg(report.discard)}</b></span>
        <span><small>MÉDIA / VIAGEM</small><b>{formatKg(report.averageTrip)}</b></span>
      </section>

      <section className="full-report-panel">
        <div className="full-report-heading"><MapPinned /><div><small>EXTREMOS GEOGRÁFICOS DO ANO</small><h4>{report.geography.label}</h4></div></div>
        <p>{report.geography.detail}</p>
        {report.geography.pointCount > 0 && <div className="geography-grid route-extremes-grid">
          <span><small>PONTO MAIS AO SUL</small><b>{formatCoordinate(report.geography.southPoint?.lat, true)} / {formatCoordinate(report.geography.southPoint?.lon, false)}</b><em>{report.geography.southRegion}</em></span>
          <span><small>PONTO MAIS AO NORTE</small><b>{formatCoordinate(report.geography.northPoint?.lat, true)} / {formatCoordinate(report.geography.northPoint?.lon, false)}</b><em>{report.geography.northRegion}</em></span>
        </div>}
        <em>Área anual calculada com todas as posições iniciais e finais das largadas das viagens finalizadas.</em>
      </section>

      <section className="full-report-panel">
        <div className="full-report-heading"><Waves /><div><small>RESUMO METEOROLÓGICO ANUAL</small><h4>Condições salvas nas largadas</h4></div></div>
        {report.environment.count ? <div className="weather-summary-grid">
          <span><small>VENTO MÉDIO</small><b>{num(report.environment.windSpeedKmh)} km/h</b><em>{report.environment.windDirection}</em></span>
          <span><small>RAJADA MÉDIA</small><b>{num(report.environment.gustKmh)} km/h</b></span>
          <span><small>ONDA MÉDIA</small><b>{num(report.environment.waveHeightM)} m</b></span>
          <span><small>SWELL MÉDIO</small><b>{num(report.environment.swellHeightM)} m</b></span>
          <span><small>TEMP. DO MAR</small><b>{num(report.environment.seaTemperatureC)} °C</b></span>
          <span><small>CORRENTE</small><b>{num(report.environment.currentKmh)} km/h</b><em>{report.environment.currentDirection}</em></span>
          <span><small>CLOROFILA</small><b>{num(report.environment.chlorophyllMgM3, 2)} mg/m³</b></span>
          <span><small>REGISTROS</small><b>{report.environment.count}</b></span>
        </div> : <p>Nenhum snapshot ambiental salvo para as viagens deste ano.</p>}
      </section>

      <section className="full-report-panel">
        <div className="full-report-heading"><CalendarDays /><div><small>VIAGENS REALIZADAS</small><h4>{report.tripCount} viagens finalizadas em {year}</h4></div></div>
        <div className="annual-trip-list">
          {report.rows.map(({ trip, report: item }) => <article key={trip.id}>
            <div><small>{trip.boatName}</small><b>{trip.name}</b><span>{formatReportDate(trip.departureDate)} → {formatReportDate(trip.returnDate || trip.expectedReturnDate)}</span></div>
            <strong>{formatKg(item.landed)}</strong>
            <button type="button" onClick={() => onOpenTrip(Number(trip.id))}>Abrir relatório</button>
          </article>)}
        </div>
      </section>

      <section className="full-report-panel">
        <div className="full-report-heading"><Fish /><div><small>CONSOLIDAÇÃO POR ESPÉCIE</small><h4>Produção do ano</h4></div></div>
        <div className="full-report-tablewrap">
          <table>
            <thead><tr><th>Espécie</th><th>Classificação</th><th>Condição</th><th>Total</th></tr></thead>
            <tbody>
              {report.species.map((item, index) => <tr key={`${item.species}-${item.category}-${item.condition}-${index}`}>
                <td><b>{item.species}</b></td><td>{item.category}</td><td>{item.condition}</td><td><b>{formatKg(item.total)}</b></td>
              </tr>)}
              {!report.species.length && <tr><td colSpan={4}>Nenhuma captura no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
