"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CloudSun,
  Download,
  Droplets,
  Gauge,
  MoonStar,
  Navigation,
  RefreshCw,
  Thermometer,
  Waves,
  Wind,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { generateSetWeatherPdf } from "../lib/setWeatherPdf";

const fmt = (value: unknown, digits = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const mph = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n / 1.609344 : null;
};

const dmm = (value: unknown, latitude: boolean) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const deg = Math.floor(abs);
  const minutes = (abs - deg) * 60;
  const direction = latitude ? (n < 0 ? "S" : "N") : n < 0 ? "W" : "E";
  return `${String(deg).padStart(2, "0")}° ${minutes.toFixed(2)}' ${direction}`;
};

const shortTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 16) || "—";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

type Props = {
  fishingSet: any;
  trip: any;
  onClose: () => void;
};

export default function SetWeatherAnalysis({ fishingSet, trip, onClose }: Props) {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const cacheKey = `painel-set-weather-${fishingSet.id}`;

  const loadSnapshot = async (force = false) => {
    setError("");
    force ? setRefreshing(true) : setLoading(true);
    try {
      if (!navigator.onLine) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setSnapshot(JSON.parse(cached));
          return;
        }
        throw Error("Sem internet e esta largada ainda não possui meteorologia salva neste aparelho.");
      }

      let found: any = null;
      if (!force) {
        const response = await fetch(`/api/environmental-snapshots?tripId=${trip.id}`, { cache: "no-store" });
        if (response.ok) {
          const result = await response.json();
          found = (result.snapshots || []).find((item: any) => Number(item.fishingSetId) === Number(fishingSet.id));
        }
      }

      if (!found || force || !["COMPLETE", "PARTIAL"].includes(String(found.status))) {
        const response = await fetch("/api/environmental-snapshots", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "single", fishingSetId: fishingSet.id, force }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw Error(result.error || "Não foi possível coletar os dados meteorológicos desta largada.");
        found = result.snapshot;
      }

      if (!found) throw Error("Não há dados meteorológicos disponíveis para esta largada.");
      setSnapshot(found);
      localStorage.setItem(cacheKey, JSON.stringify(found));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar meteorologia.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadSnapshot(false);
  }, [fishingSet.id]);

  const daySeries = useMemo(() => {
    const rows = Array.isArray(snapshot?.payload?.dayForecast) ? snapshot.payload.dayForecast : [];
    return rows.map((row: any) => ({
      time: String(row.time || "").slice(11, 16),
      vento: Number(row.windSpeedKmh),
      rajada: Number(row.gustKmh),
      onda: Number(row.waveHeightM),
      swell: Number(row.swellHeightM),
      corrente: mph(row.currentKmh),
      temperatura: Number(row.seaTemperatureC),
    }));
  }, [snapshot]);

  const exportPdf = () => {
    if (!snapshot) return;
    generateSetWeatherPdf({ fishingSet, trip, snapshot, captureKg: fishingSet.total, download: true });
  };

  return (
    <div className="set-weather-overlay" role="dialog" aria-modal="true" aria-label="Dados meteorológicos da largada">
      <section className="set-weather-panel">
        <header className="set-weather-head">
          <div>
            <small>ANÁLISE METEOROLÓGICA DA LARGADA</small>
            <h2>#{String(fishingSet.setNumber).padStart(2, "0")} · {new Date(fishingSet.startedAt).toLocaleDateString("pt-BR")}</h2>
            <p>{trip.name} · {shortTime(fishingSet.startedAt)} até {shortTime(fishingSet.finishedAt)} · {fmt(fishingSet.total, 0)} kg</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X /></button>
        </header>

        {loading ? (
          <div className="set-weather-loading"><RefreshCw className="spin" /><b>Buscando dados do dia...</b><span>Vento, mar, corrente, temperatura, clorofila e lua.</span></div>
        ) : error ? (
          <div className="set-weather-error">
            <CloudSun />
            <b>Não foi possível carregar</b>
            <span>{error}</span>
            <button type="button" onClick={() => loadSnapshot(true)}><RefreshCw /> Tentar novamente</button>
          </div>
        ) : snapshot ? (
          <>
            <div className="set-weather-location">
              <Navigation />
              <div>
                <small>POSIÇÃO DA LARGADA</small>
                <b>{dmm(fishingSet.startLatitude, true)} · {dmm(fishingSet.startLongitude, false)}</b>
                <span>Profundidade registrada: {fishingSet.depthMeters != null ? `${fmt(fishingSet.depthMeters, 0)} m` : "—"}</span>
              </div>
              <span className={`set-weather-source ${snapshot.sourceMode === "HISTORICAL_BACKFILL" ? "historical" : ""}`}>
                {snapshot.sourceMode === "HISTORICAL_BACKFILL" ? "HISTÓRICO" : "SNAPSHOT"}
              </span>
            </div>

            <div className="set-weather-kpis">
              <article><Wind /><small>VENTO</small><strong>{fmt(snapshot.windSpeedKmh)} <em>km/h</em></strong><span>{snapshot.windDirection || "—"} · rajada {fmt(snapshot.gustKmh)} km/h</span></article>
              <article><Waves /><small>ONDA</small><strong>{fmt(snapshot.waveHeightM)} <em>m</em></strong><span>{snapshot.waveDirection || "—"} · período {fmt(snapshot.wavePeriodS)} s</span></article>
              <article><Navigation /><small>CORRENTE</small><strong>{fmt(mph(snapshot.currentKmh), 2)} <em>mph</em></strong><span>{snapshot.currentDirection || "—"} · {fmt(snapshot.currentDirectionDeg, 0)}°</span></article>
              <article><Thermometer /><small>TEMP. MAR</small><strong>{fmt(snapshot.seaTemperatureC)} <em>°C</em></strong><span>temperatura superficial</span></article>
              <article><Droplets /><small>CLOROFILA</small><strong>{snapshot.chlorophyllMgM3 == null ? "—" : fmt(snapshot.chlorophyllMgM3, 2)} <em>{snapshot.chlorophyllMgM3 == null ? "" : "mg/m³"}</em></strong><span>NOAA CoastWatch</span></article>
              <article><MoonStar /><small>LUA</small><strong>{snapshot.lunarPhase || "—"}</strong><span>{snapshot.lunarIllumination == null ? "—" : `${fmt(Number(snapshot.lunarIllumination) * 100, 0)}% iluminada`}</span></article>
            </div>

            <div className="set-weather-analysis">
              <Activity />
              <div>
                <small>LEITURA DA LARGADA</small>
                <h3>Condições registradas no horário da operação</h3>
                <p>
                  Esta largada registrou <b>{fmt(fishingSet.total, 0)} kg</b>. No horário, o modelo indica vento de <b>{fmt(snapshot.windSpeedKmh)} km/h</b>,
                  onda de <b>{fmt(snapshot.waveHeightM)} m</b>, corrente de <b>{fmt(mph(snapshot.currentKmh), 2)} mph</b> e temperatura do mar de <b>{fmt(snapshot.seaTemperatureC)} °C</b>.
                  Use esta ficha para comparar desempenho entre largadas e identificar padrões históricos.
                </p>
              </div>
            </div>

            <div className="set-weather-charts">
              <article>
                <div className="set-weather-chart-title"><div><small>VENTO DO DIA</small><h3>Vento e rajadas</h3></div><Wind /></div>
                <ResponsiveContainer width="100%" height={245}>
                  <LineChart data={daySeries} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "#80a3a8", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#80a3a8", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#082229", border: "1px solid #2c5158", borderRadius: 10 }} />
                    <Legend />
                    <Line type="monotone" dataKey="vento" name="Vento km/h" stroke="#2dd5ac" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="rajada" name="Rajada km/h" stroke="#e0a04d" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </article>

              <article>
                <div className="set-weather-chart-title"><div><small>MAR DO DIA</small><h3>Onda e swell</h3></div><Waves /></div>
                <ResponsiveContainer width="100%" height={245}>
                  <LineChart data={daySeries} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "#80a3a8", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#80a3a8", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#082229", border: "1px solid #2c5158", borderRadius: 10 }} />
                    <Legend />
                    <Line type="monotone" dataKey="onda" name="Onda m" stroke="#4aa8df" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="swell" name="Swell m" stroke="#9a83e1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </article>

              <article>
                <div className="set-weather-chart-title"><div><small>CORRENTE</small><h3>Milhas por hora</h3></div><Gauge /></div>
                <ResponsiveContainer width="100%" height={225}>
                  <LineChart data={daySeries} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "#80a3a8", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#80a3a8", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#082229", border: "1px solid #2c5158", borderRadius: 10 }} />
                    <Line type="monotone" dataKey="corrente" name="Corrente mph" stroke="#35cabb" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </article>

              <article>
                <div className="set-weather-chart-title"><div><small>TEMPERATURA</small><h3>Superfície do mar</h3></div><Thermometer /></div>
                <ResponsiveContainer width="100%" height={225}>
                  <LineChart data={daySeries} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "#80a3a8", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#80a3a8", fontSize: 10 }} domain={["dataMin - 1", "dataMax + 1"]} />
                    <Tooltip contentStyle={{ background: "#082229", border: "1px solid #2c5158", borderRadius: 10 }} />
                    <Line type="monotone" dataKey="temperatura" name="Temperatura °C" stroke="#e17662" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </article>
            </div>

            <div className="set-weather-actions">
              <button type="button" className="set-weather-refresh" disabled={refreshing || !navigator.onLine} onClick={() => loadSnapshot(true)}>
                <RefreshCw className={refreshing ? "spin" : ""} /> {refreshing ? "ATUALIZANDO..." : "REPROCESSAR DADOS"}
              </button>
              <button type="button" className="set-weather-pdf" onClick={exportPdf}>
                <Download /> EXPORTAR PDF COM GRÁFICOS
              </button>
            </div>

            <p className="set-weather-disclaimer">
              Dados modelados/satelitais para análise histórica da pescaria. Não usar como única referência de navegação ou segurança marítima.
            </p>
          </>
        ) : null}
      </section>
    </div>
  );
}
