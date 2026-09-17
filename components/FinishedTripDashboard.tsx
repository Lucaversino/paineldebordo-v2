"use client";

import {
  ArrowLeft,
  CalendarDays,
  Fish,
  Target,
  TrendingUp,
  Trophy,
  Waves,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const number = (value: unknown) => Number(value || 0);
const fmt = (value: unknown, digits = 0) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number(value));
const date = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "Não informada";

type Props = {
  trip: any;
  sets: any[];
  catches: any[];
  onBack: () => void;
};

export default function FinishedTripDashboard({ trip, sets, catches, onBack }: Props) {
  const tripSets = sets
    .filter((item) => Number(item.tripId) === Number(trip.id))
    .sort((a, b) => number(a.setNumber) - number(b.setNumber));
  const tripCatches = catches.filter((item) => Number(item.tripId) === Number(trip.id));
  const landed = tripCatches
    .filter((item) => item.catchType !== "DISCARD")
    .reduce((sum, item) => sum + number(item.weightKg), 0);
  const primary = tripCatches
    .filter((item) => item.catchType === "PRIMARY")
    .reduce((sum, item) => sum + number(item.weightKg), 0);
  const mixture = tripCatches
    .filter((item) => item.catchType === "MIXTURE")
    .reduce((sum, item) => sum + number(item.weightKg), 0);
  const discard = tripCatches
    .filter((item) => item.catchType === "DISCARD")
    .reduce((sum, item) => sum + number(item.weightKg), 0);
  const target = number(trip.targetKg);
  const attainment = target > 0 ? (landed / target) * 100 : 0;
  const difference = landed - target;
  const departure = new Date(trip.departureDate);
  const arrival = new Date(trip.returnDate || trip.expectedReturnDate);
  const duration = Math.max(
    1,
    Math.ceil((arrival.getTime() - departure.getTime()) / 86400000),
  );
  const averageDay = landed / duration;
  const averageSet = landed / Math.max(1, tripSets.length);
  const discardRate = landed + discard > 0 ? (discard / (landed + discard)) * 100 : 0;

  let cumulative = 0;
  const setSeries = tripSets.map((set, index) => {
    const rows = tripCatches.filter((item) => Number(item.fishingSetId) === Number(set.id));
    const corvina = rows
      .filter((item) => item.catchType === "PRIMARY")
      .reduce((sum, item) => sum + number(item.weightKg), 0);
    const mix = rows
      .filter((item) => item.catchType === "MIXTURE")
      .reduce((sum, item) => sum + number(item.weightKg), 0);
    const rejected = rows
      .filter((item) => item.catchType === "DISCARD")
      .reduce((sum, item) => sum + number(item.weightKg), 0);
    cumulative += corvina + mix;
    return {
      name: `#${String(set.setNumber).padStart(2, "0")}`,
      corvina,
      mistura: mix,
      descarte: rejected,
      desembarcado: corvina + mix,
      acumulado: cumulative,
      ritmoMeta: tripSets.length ? (target / tripSets.length) * (index + 1) : 0,
    };
  });
  const bestSet = setSeries.reduce(
    (best, item) => (item.desembarcado > best.desembarcado ? item : best),
    { name: "—", desembarcado: 0 } as (typeof setSeries)[number],
  );
  const speciesTotals = tripCatches
    .filter((item) => item.catchType !== "DISCARD")
    .reduce<Map<string, number>>((map, item) => {
      const name = item.species || (item.catchType === "PRIMARY" ? "Corvina" : "Mistura");
      map.set(name, (map.get(name) ?? 0) + number(item.weightKg));
      return map;
    }, new Map<string, number>());

  const species = Array.from(speciesTotals.entries())
    .map(([name, kg]: [string, number]) => ({ name, kg }))
    .sort((a, b) => b.kg - a.kg);

  return (
    <div className="finished-dashboard">
      <div className="finished-dashboard-head">
        <button type="button" className="finished-back" onClick={onBack}>
          <ArrowLeft /> Voltar ao histórico
        </button>
        <div className="finished-title">
          <div>
            <small>ANÁLISE DA VIAGEM FINALIZADA</small>
            <h3>{trip.name}</h3>
            <p>
              {trip.boatName} • {date(trip.departureDate)} até {date(trip.returnDate)}
            </p>
          </div>
          <span className={attainment >= 100 ? "finished-grade success" : "finished-grade warning"}>
            {fmt(attainment, 1)}% da meta
          </span>
        </div>
      </div>

      <div className="finished-kpis">
        <article className="primary-kpi">
          <Fish />
          <small>TOTAL DESEMBARCADO</small>
          <strong>{fmt(landed)} <em>kg</em></strong>
          <span>{difference >= 0 ? `${fmt(difference)} kg acima da meta` : `${fmt(Math.abs(difference))} kg abaixo da meta`}</span>
        </article>
        <article>
          <Target />
          <small>META DA VIAGEM</small>
          <strong>{fmt(target)} <em>kg</em></strong>
          <span>{fmt(attainment, 1)}% atingido</span>
        </article>
        <article>
          <CalendarDays />
          <small>DURAÇÃO</small>
          <strong>{duration} <em>dias</em></strong>
          <span>{fmt(averageDay)} kg por dia</span>
        </article>
        <article>
          <Waves />
          <small>LARGADAS</small>
          <strong>{tripSets.length}</strong>
          <span>{fmt(averageSet)} kg por largada</span>
        </article>
      </div>

      <div className="finished-summary">
        <article><span>Corvina</span><b>{fmt(primary)} kg</b></article>
        <article><span>Mistura</span><b>{fmt(mixture)} kg</b></article>
        <article className="discard-result"><span>Descarte</span><b>{fmt(discard)} kg</b></article>
        <article><span>Índice de descarte</span><b>{fmt(discardRate, 1)}%</b></article>
      </div>

      <div className="finished-charts">
        <article className="finished-chart-card">
          <div className="finished-card-title">
            <div><small>PRODUÇÃO POR OPERAÇÃO</small><h4>Resultado de cada largada</h4></div>
            <Trophy /><span>Melhor: {bestSet.name} • {fmt(bestSet.desembarcado)} kg</span>
          </div>
          {setSeries.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={setSeries} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8fb0b7", fontSize: 12 }} />
                <YAxis tick={{ fill: "#8fb0b7", fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "#082229", border: "1px solid #2c5158", borderRadius: 10 }} formatter={(value: any) => `${fmt(value)} kg`} />
                <Legend />
                <Bar dataKey="corvina" name="Corvina" stackId="captura" fill="#21d0a2" radius={[4, 4, 0, 0]} />
                <Bar dataKey="mistura" name="Mistura" stackId="captura" fill="#43a8cc" />
                <Bar dataKey="descarte" name="Descarte" fill="#e36d76" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="finished-empty">Esta viagem não possui largadas registradas.</div>}
        </article>

        <article className="finished-chart-card">
          <div className="finished-card-title">
            <div><small>EVOLUÇÃO DA VIAGEM</small><h4>Produção acumulada x ritmo da meta</h4></div>
            <TrendingUp />
          </div>
          {setSeries.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={setSeries} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="finishedArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#21d0a2" stopOpacity={0.38} />
                    <stop offset="100%" stopColor="#21d0a2" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8fb0b7", fontSize: 12 }} />
                <YAxis tick={{ fill: "#8fb0b7", fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "#082229", border: "1px solid #2c5158", borderRadius: 10 }} formatter={(value: any) => `${fmt(value)} kg`} />
                <Legend />
                <Area type="monotone" dataKey="acumulado" name="Produção acumulada" stroke="#21d0a2" fill="url(#finishedArea)" strokeWidth={3} />
                <Area type="monotone" dataKey="ritmoMeta" name="Ritmo da meta" stroke="#7d98a0" fill="none" strokeDasharray="7 5" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="finished-empty">A evolução aparecerá quando houver largadas registradas.</div>}
        </article>
      </div>

      <div className="finished-bottom">
        <article className="finished-insight">
          <small>RESULTADO FINAL</small>
          <h4>{attainment >= 100 ? "Meta alcançada" : "Meta não alcançada"}</h4>
          <p>
            A viagem encerrou com <b>{fmt(landed)} kg</b> desembarcados em {duration} dias.
            {difference >= 0
              ? ` O resultado superou a meta em ${fmt(difference)} kg.`
              : ` Faltaram ${fmt(Math.abs(difference))} kg para a meta planejada.`}
          </p>
        </article>
        <article className="finished-species">
          <small>PRODUÇÃO POR ESPÉCIE</small>
          {species.length ? species.map((item) => (
            <div key={item.name}>
              <span>{item.name}</span>
              <b>{fmt(item.kg)} kg</b>
              <i><em style={{ width: `${landed ? (item.kg / landed) * 100 : 0}%` }} /></i>
            </div>
          )) : <p>Nenhuma captura registrada.</p>}
        </article>
      </div>
    </div>
  );
}
