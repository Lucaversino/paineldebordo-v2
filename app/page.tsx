"use client";
import { useEffect, useState } from "react";
import {
  Anchor,
  BarChart3,
  Fish,
  Gauge,
  History,
  Menu,
  Moon,
  Pencil,
  List,
  Plus,
  Radio,
  RefreshCw,
  Settings,
  ShipWheel,
  Ship,
  Waves,
  Wind,
  WalletCards,
  ShieldCheck,
  X,
  LogOut,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Operations from "../components/Operations";
import CoordinateInput from "../components/CoordinateInput";
import PwaControls from "../components/PwaControls";
import OceanIntelligence from "../components/OceanIntelligence";
import PositionForecast from "../components/PositionForecast";
import AISPage from "../components/AISPage";
import FloatingPanelAssistant from "../components/FloatingPanelAssistant";
import CreditsPage from "../components/CreditsPage";
import AdminBillingPage from "../components/AdminBillingPage";
const fmt = (n: number, d = 0) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n || 0);
const blank = { trip: null, total: 0, corvinaTotal: 0, mixtureTotal: 0, discardTotal: 0, setCount: 0, sets: [], daily: [], speciesOptions: [] };
export default function Home() {
  const [data, setData] = useState<any>(blank),
    [view, setView] = useState("Dashboard"),
    [modal, setModal] = useState<"capture" | "set" | "editSet" | "mixture" | "discard" | null>(null),
    [weight, setWeight] = useState(""),
    [setId, setSetId] = useState(""),
    [editSet, setEditSet] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState(""),
    [offline, setOffline] = useState(false),
    [menu, setMenu] = useState(false),
    [dark, setDark] = useState(true),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [billing, setBilling] = useState<any>(null);
  const load = async () => {
    setLoadError("");
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (r.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (!r.ok) throw Error("Não foi possível carregar os dados do painel.");
      const j = await r.json();
      setData(j);
      setSetId(String(j.sets?.at(-1)?.id || ""));
      setOffline(false);
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      setLoadError(timedOut ? "A conexão com o painel demorou demais. Tente novamente." : (error instanceof Error ? error.message : "Não foi possível carregar o painel."));
      setOffline(!navigator.onLine);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((result) => result?.billing && setBilling(result.billing))
      .catch(() => null);
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("view") === "credits") setView("Meus créditos");
    } catch {}
  }, []);

  // v69: preenche gradualmente o histórico ambiental das largadas antigas sem
  // bloquear a tela. Cada visita continua de onde parou até cobrir as viagens
  // atuais e finalizadas.
  useEffect(() => {
    let stopped = false;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const backfill = async () => {
      await sleep(1600);
      for (let round = 0; round < 10 && !stopped; round++) {
        if (!navigator.onLine) return;
        try {
          const response = await fetch("/api/environmental-snapshots", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "backfill", limit: 3 }),
          });
          if (!response.ok) return;
          const result = await response.json().catch(() => ({}));
          if (!Number(result.remaining || 0)) return;
        } catch {
          return;
        }
        await sleep(900);
      }
    };
    void backfill();
    return () => { stopped = true; };
  }, []);
  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    window.location.replace("/login");
  }
  useEffect(() => {
    const onBilling = (event: Event) => {
      const balance = Number((event as CustomEvent)?.detail?.balance);
      if (Number.isFinite(balance)) setBilling((current: any) => current ? { ...current, balance } : current);
    };
    window.addEventListener("painel-billing-changed", onBilling);
    return () => window.removeEventListener("painel-billing-changed", onBilling);
  }, []);
  useEffect(() => {
    const f = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) load();
    };
    addEventListener("online", f);
    addEventListener("offline", f);
    return () => {
      removeEventListener("online", f);
      removeEventListener("offline", f);
    };
  }, []);
  async function save(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (!data.trip) return;
    setBusy(true);
    setSaveError("");
    const formData = e ? new FormData(e.currentTarget) : null;
    const p =
      modal === "capture"
        ? {
            action: "capture",
            tripId: data.trip.id,
            fishingSetId: +setId,
            speciesId: data.trip.primarySpeciesId,
            weightKg: +weight.replace(",", "."),
          }
        : modal === "mixture" || modal === "discard"
          ? {
              action: "categorizedCatch",
              tripId: data.trip.id,
              fishingSetId: +setId,
              catchType: modal === "mixture" ? "MIXTURE" : "DISCARD",
              categorySpeciesId: Number(formData?.get("categorySpeciesId") || 0),
              speciesName: formData?.get("speciesName"),
              weightKg: Number(String(formData?.get("categoryWeightKg") || "").replace(",", ".")),
            }
          : {
            action: "set",
            tripId: data.trip.id,
            speciesId: data.trip.primarySpeciesId,
            fishingDate: formData?.get("fishingDate"),
            startTime: formData?.get("startTime"),
            endTime: formData?.get("endTime"),
            depthMeters: Number(formData?.get("depthMeters")),
            startLatitude: formData?.get("startLatitude"),
            startLongitude: formData?.get("startLongitude"),
            endLatitude: formData?.get("endLatitude"),
            endLongitude: formData?.get("endLongitude"),
            weightKg: Number(
              String(formData?.get("dailyCatchKg") || "").replace(",", "."),
            ),
            mixtureSpeciesName: formData?.get("mixtureSpeciesName"),
            mixtureSpeciesId: Number(formData?.get("mixtureSpeciesId") || 0),
            mixtureWeightKg: Number(String(formData?.get("mixtureWeightKg") || "").replace(",", ".")),
            discardSpeciesName: formData?.get("discardSpeciesName"),
            discardSpeciesId: Number(formData?.get("discardSpeciesId") || 0),
            discardWeightKg: Number(String(formData?.get("discardWeightKg") || "").replace(",", ".")),
          };
    try {
      const r = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!r.ok) {
        const problem = await r.json().catch(() => ({}));
        throw Error(problem.error || "Não foi possível salvar o registro.");
      }
      await load();
    } catch (error) {
      if (!navigator.onLine) setOffline(true);
      setSaveError(error instanceof Error ? error.message : "Não foi possível salvar.");
      setBusy(false);
      return;
    }
    setModal(null);
    setWeight("");
    setBusy(false);
  }
  async function loadSetForEdit(id: string) {
    setSetId(id);
    setSaveError("");
    setEditSet(null);
    if (!id) return;
    try {
      const response = await fetch(`/api/fishing-set?id=${id}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(result.error || "Não foi possível carregar a largada.");
      setEditSet(result);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível carregar a largada.");
    }
  }
  async function openSetEditor() {
    const id = String(data.sets.at(-1)?.id || "");
    setModal("editSet");
    await loadSetForEdit(id);
  }
  async function saveEditedSet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editSet) return;
    setBusy(true);
    setSaveError("");
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const response = await fetch("/api/manage", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editSet.id, ...fields }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(result.error || "Não foi possível atualizar a largada.");
      await load();
      setModal(null);
      setEditSet(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível atualizar a largada.");
    } finally {
      setBusy(false);
    }
  }
  const nav = [
      [Gauge, "Dashboard"],
      [Wind, "Ventos e Mar"],
      [Ship, "AIS"],
      [WalletCards, "Meus créditos"],
      [Radio, "Viagem atual"],
      [Waves, "Largadas"],
      [Fish, "Capturas"],
      [History, "Histórico"],
      [BarChart3, "Comparar viagens"],
      [Anchor, "Embarcações"],
      [Fish, "Espécies"],
      [BarChart3, "Relatórios"],
      [Settings, "Configurações"],
      ...(billing?.isSuperAdmin ? [[ShieldCheck, "Admin — AIS, IA e Créditos"]] as const : []),
    ] as const,
    t = data.trip;
  let elapsed = 0,
    days = 0,
    left = 0,
    pct = 0,
    avg = 0,
    needed = 0,
    forecast = 0,
    chart: any[] = [];
  if (t) {
    elapsed = Math.max(
      1,
      Math.ceil((Date.now() - new Date(t.departureDate).getTime()) / 864e5),
    );
    days = Math.max(
      elapsed,
      Math.ceil(
        (new Date(t.expectedReturnDate).getTime() -
          new Date(t.departureDate).getTime()) /
          864e5,
      ),
    );
    left = Math.max(0, t.targetKg - data.total);
    pct = Math.min(100, (data.total / t.targetKg) * 100);
    avg = data.total / elapsed;
    needed = left / Math.max(1, days - elapsed);
    forecast = avg * days;
    let cumulative = 0;
    chart = data.daily.map((x: any, i: number) => {
      cumulative += Number(x.kg);
      return { ...x, kg: cumulative, meta: (t.targetKg / days) * (i + 1) };
    });
  }
  return (
    <div className={dark ? "dark app" : "app"}>
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span>
            <ShipWheel />
          </span>
          <div>
            <b>PAINEL DE BORDO</b>
            <small>PESCA INDUSTRIAL</small>
          </div>
          <button className="close" onClick={() => setMenu(false)}>
            <X />
          </button>
        </div>
        <nav>
          {nav.map(([I, n]) => (
            <button
              onClick={() => {
                setView(n);
                setMenu(false);
              }}
              className={view === n ? "active" : ""}
              key={n}
            >
              <I />
              {n}
            </button>
          ))}
        </nav>
        <div className="legal">
          <Anchor /> Registro operacional
          <br />
          <small>Respeite licenças, defesos e áreas autorizadas.</small>
        </div>
      </aside>
      <main>
        <header>
          <button className="menub" onClick={() => setMenu(true)}>
            <Menu />
          </button>
          <div>
            <p>EMBARCAÇÃO ATIVA</p>
            <h1>
              {t ? t.boatName : "Nenhuma"} {t && <span>EM VIAGEM</span>}
            </h1>
          </div>
          <div className="headright">
            <div className={offline ? "signal off" : "signal"}>
              <i />
              {offline ? "SEM CONEXÃO" : "SISTEMA ONLINE"}
            </div>
            <button className="icon" onClick={() => setDark(!dark)}>
              <Moon />
            </button>
            <PwaControls />
            <button className="logout" onClick={logout} title="Sair do painel">
              <LogOut /> <span>SAIR</span>
            </button>
          </div>
        </header>
        {view === "Dashboard" ? (
          <section className="content">
            {loading ? (
              <div className="emptydash">
                <h2>Carregando painel...</h2>
                <p>Aguarde alguns segundos.</p>
              </div>
            ) : loadError ? (
              <div className="emptydash">
                <Gauge />
                <small>PAINEL NÃO TRAVOU</small>
                <h2>Não foi possível carregar agora</h2>
                <p>{loadError}</p>
                <div><button className="primary" onClick={() => { setLoading(true); load(); }}><RefreshCw /> Tentar novamente</button></div>
              </div>
            ) : !t ? (
              <div className="emptydash">
                <ShipWheel />
                <small>PAINEL PRONTO PARA COMEÇAR</small>
                <h2>Nenhuma viagem em andamento</h2>
                <p>
                  Cadastre sua embarcação e crie uma nova viagem. Ao selecionar
                  o status <b>Em andamento</b>, este dashboard será preenchido e
                  sincronizado automaticamente.
                </p>
                <div>
                  <button onClick={() => setView("Embarcações")}>
                    <Anchor /> Cadastrar embarcação
                  </button>
                  <button
                    className="primary"
                    onClick={() => setView("Viagem atual")}
                  >
                    <Plus /> Criar nova viagem
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="triphead">
                  <div>
                    <p>VIAGEM ATUAL</p>
                    <h2>{t.name}</h2>
                    <span>
                      Dia {elapsed} de {days} • Saída de {t.departurePort}
                    </span>
                  </div>
                  <button
                    className="outline"
                    onClick={() => setView("Viagem atual")}
                  >
                    Ver detalhes
                  </button>
                </div>
                <div className="hero">
                  <div className="radar">
                    <div className="rings" />
                    <ShipWheel />
                    <span>EM OPERAÇÃO</span>
                  </div>
                  <div className="heroInfo">
                    <p>PROGRESSO DA META</p>
                    <div className="heroNums">
                      <div>
                        <small>CORVINA CAPTURADA</small>
                        <strong>
                          {fmt(data.total)} <em>kg</em>
                        </strong>
                      </div>
                      <div>
                        <small>META TOTAL</small>
                        <b>{fmt(t.targetKg)} kg</b>
                      </div>
                    </div>
                    <div className="progress">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                    <div className="progressline">
                      <b>{fmt(pct, 1)}% atingido</b>
                      <span>Faltam {fmt(left)} kg</span>
                    </div>
                  </div>
                  <div className="forecast">
                    <small>PROJEÇÃO FINAL</small>
                    <strong>{fmt(forecast)} kg</strong>
                    <span className={forecast >= t.targetKg ? "good" : "warn"}>
                      {data.total
                        ? forecast >= t.targetKg
                          ? "Acima da meta"
                          : "Abaixo da meta"
                        : "Aguardando capturas"}
                    </span>
                  </div>
                </div>
                <div className="metrics">
                  <article>
                    <small>MÉDIA DIÁRIA</small>
                    <b>
                      {fmt(avg)} <em>kg/dia</em>
                    </b>
                    <span>Produção real</span>
                  </article>
                  <article className="accent">
                    <small>NECESSÁRIO/DIA</small>
                    <b>
                      {fmt(needed)} <em>kg/dia</em>
                    </b>
                    <span>Para alcançar a meta</span>
                  </article>
                  <article>
                    <small>LARGADAS</small>
                    <b>{data.setCount}</b>
                    <span>Na viagem atual</span>
                  </article>
                  <article>
                    <small>PRODUÇÃO HOJE</small>
                    <b>
                      {fmt(data.daily.at(-1)?.kg || 0)} <em>kg</em>
                    </b>
                    <span>Somente hoje</span>
                  </article>
                </div>
                <div className="catch-breakdown">
                  <article className="main-catch"><small>ESPÉCIE PRINCIPAL</small><b>Corvina</b><strong>{fmt(data.corvinaTotal)} kg</strong></article>
                  <article><small>MISTURA DE PEIXE</small><strong>{fmt(data.mixtureTotal)} kg</strong></article>
                  <article className="discard"><small>DESCARTE</small><strong>{fmt(data.discardTotal)} kg</strong></article>
                </div>
                <div className="actions">
                  <button onClick={() => { setSaveError(""); setModal("set"); }}>
                    <Plus />
                    <span>
                      <small>REGISTRO OPERACIONAL</small>NOVA LARGADA
                    </span>
                  </button>
                  <button
                    className="primary"
                    disabled={!data.sets.length}
                    onClick={() => setModal("capture")}
                  >
                    <Fish />
                    <span>
                      <small>ATUALIZAR PRODUÇÃO</small>
                      {data.sets.length
                        ? "REGISTRAR CAPTURA"
                        : "CRIE UMA LARGADA PRIMEIRO"}
                    </span>
                  </button>
                </div>
                <div className="category-actions">
                  <button type="button" disabled={!data.sets.length} onClick={() => { setSaveError(""); setModal("mixture"); }}><Fish /> Mistura de peixe</button>
                  <button type="button" className="discard-button" disabled={!data.sets.length} onClick={() => { setSaveError(""); setModal("discard"); }}><X /> Descarte</button>
                </div>
                <div className="dashboard-set-tools">
                  <button type="button" disabled={!data.sets.length} onClick={openSetEditor}>
                    <Pencil /> Editar largada
                  </button>
                  <button type="button" className="set-list-link" onClick={() => setView("Largadas")}>
                    <List /> Lista de Largadas
                  </button>
                </div>
                <OceanIntelligence />
                <div className="lower single">
                  <article className="chartcard">
                    <div className="cardtitle">
                      <div>
                        <small>DESEMPENHO</small>
                        <h3>Produção acumulada</h3>
                      </div>
                    </div>
                    {chart.length ? (
                      <ResponsiveContainer width="100%" height={230}>
                        <AreaChart data={chart}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#ffffff12"
                          />
                          <XAxis dataKey="day" />
                          <YAxis />
                          <Tooltip />
                          <Area
                            type="monotone"
                            dataKey="kg"
                            stroke="#19d3a2"
                            fill="#19d3a233"
                            strokeWidth={3}
                          />
                          <Area
                            type="monotone"
                            dataKey="meta"
                            stroke="#5c7a84"
                            fill="none"
                            strokeDasharray="6 5"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="chartempty">
                        O gráfico aparecerá depois da primeira captura.
                      </div>
                    )}
                  </article>
                </div>
              </>
            )}
          </section>
        ) : view === "Ventos e Mar" ? (
          <PositionForecast />
        ) : view === "AIS" ? (
          <AISPage
            defaultLat={Number(data.sets?.at(-1)?.endLatitude ?? data.sets?.at(-1)?.startLatitude ?? -27.15)}
            defaultLon={Number(data.sets?.at(-1)?.endLongitude ?? data.sets?.at(-1)?.startLongitude ?? -48.55)}
          />
        ) : view === "Meus créditos" ? (
          <CreditsPage />
        ) : view === "Admin — AIS, IA e Créditos" ? (
          <AdminBillingPage />
        ) : (
          <Operations view={view} onDashboard={() => setView("Dashboard")} />
        )}
      </main>
      <FloatingPanelAssistant />
      {modal && t && (
        <div className="overlay" onMouseDown={() => setModal(null)}>
          <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={modal === "editSet" ? saveEditedSet : save}>
            <button type="button" className="modalx" onClick={() => setModal(null)}>
              <X />
            </button>
            <small>{t.name}</small>
            <h2>
              {modal === "capture" ? "Registrar corvina" : modal === "mixture" ? "Mistura de peixe" : modal === "discard" ? "Descarte" : modal === "editSet" ? "Editar largada" : "Nova largada"}
            </h2>
            {modal === "capture" ? (
              <>
                <label>
                  Largada
                  <select
                    value={setId}
                    onChange={(e) => setSetId(e.target.value)}
                  >
                    {data.sets.map((s: any) => (
                      <option value={s.id} key={s.id}>
                        Largada #{String(s.setNumber).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Peso capturado
                  <div className="weight">
                    <input
                      inputMode="decimal"
                      autoFocus
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="0"
                    />
                    <span>kg</span>
                  </div>
                </label>
              </>
            ) : modal === "mixture" || modal === "discard" ? (
              <>
                <label>Largada<select value={setId} onChange={(e) => setSetId(e.target.value)}>{data.sets.map((s: any) => <option value={s.id} key={s.id}>Largada #{String(s.setNumber).padStart(2, "0")}</option>)}</select></label>
                <label>Selecionar espécie cadastrada<select name="categorySpeciesId" defaultValue=""><option value="">Selecione uma espécie</option>{data.speciesOptions.filter((item: any) => item.id !== t.primarySpeciesId).map((item: any) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <div className="or-divider"><span>OU</span></div>
                <label>Cadastrar nova espécie<input name="speciesName" autoFocus placeholder="Digite somente se for nova" /><small>Se já estiver cadastrada, selecione na lista acima.</small></label>
                <label>Total em quilos<div className="weight"><input name="categoryWeightKg" inputMode="decimal" required placeholder="0" /><span>kg</span></div></label>
              </>
            ) : modal === "editSet" ? (
              <>
                <label>
                  Selecione a largada
                  <select value={setId} onChange={(e) => loadSetForEdit(e.target.value)}>
                    {data.sets.map((item: any) => (
                      <option value={item.id} key={item.id}>Largada #{String(item.setNumber).padStart(2, "0")}</option>
                    ))}
                  </select>
                </label>
                {editSet ? (
                  <div key={editSet.id} className="edit-set-fields">
                    <div className="twocol">
                      <label>Início<input name="startedAt" type="datetime-local" required defaultValue={String(editSet.startedAt || "").slice(0, 16)} /></label>
                      <label>Horário final<input name="finishedAt" type="datetime-local" required defaultValue={String(editSet.finishedAt || "").slice(0, 16)} /></label>
                    </div>
                    <label>Profundidade em metros<input name="depthMeters" type="number" min="0" step="0.1" inputMode="decimal" defaultValue={editSet.depthMeters ?? ""} /></label>
                    <fieldset className="coords"><legend>Posição inicial</legend><div className="twocol"><label>Latitude <small>Sul (S)</small><CoordinateInput name="startLatitude" direction="S" defaultDecimal={editSet.startLatitude} /></label><label>Longitude <small>Oeste (W)</small><CoordinateInput name="startLongitude" direction="W" defaultDecimal={editSet.startLongitude} /></label></div></fieldset>
                    <fieldset className="coords"><legend>Posição final</legend><div className="twocol"><label>Latitude <small>Sul (S)</small><CoordinateInput name="endLatitude" direction="S" defaultDecimal={editSet.endLatitude} /></label><label>Longitude <small>Oeste (W)</small><CoordinateInput name="endLongitude" direction="W" defaultDecimal={editSet.endLongitude} /></label></div></fieldset>
                    <label>Observações<input name="notes" defaultValue={editSet.notes || ""} /></label>
                  </div>
                ) : !saveError ? <p>Carregando largada...</p> : null}
              </>
            ) : (
              <>
                <div className="newset">
                  <Radio />
                  <b>Dados da nova largada</b>
                  <span>O número será gerado automaticamente dentro da viagem.</span>
                </div>
                <label>Data da largada<input name="fishingDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                <div className="twocol">
                  <label>Horário inicial<input name="startTime" type="time" required /></label>
                  <label>Horário final<input name="endTime" type="time" required /></label>
                </div>
                <label>Profundidade em metros<input name="depthMeters" type="number" min="0" step="0.1" inputMode="decimal" required /></label>
                <fieldset className="coords"><legend>Posição inicial — digite somente os números</legend><div className="twocol"><label>Latitude <small>Sul (S)</small><CoordinateInput name="startLatitude" direction="S" /></label><label>Longitude <small>Oeste (W)</small><CoordinateInput name="startLongitude" direction="W" /></label></div></fieldset>
                <fieldset className="coords"><legend>Posição final — digite somente os números</legend><div className="twocol"><label>Latitude <small>Sul (S)</small><CoordinateInput name="endLatitude" direction="S" /></label><label>Longitude <small>Oeste (W)</small><CoordinateInput name="endLongitude" direction="W" /></label></div></fieldset>
                <fieldset className="catch-fields"><legend>Captura da largada — valores separados</legend>
                  <label>Corvina — espécie principal<div className="weight"><input name="dailyCatchKg" inputMode="decimal" required placeholder="0" /><span>kg</span></div></label>
                  <div className="category-entry"><label>Espécie da mistura<select name="mixtureSpeciesId" defaultValue=""><option value="">Selecionar cadastrada</option>{data.speciesOptions.filter((item: any) => item.id !== t.primarySpeciesId).map((item: any) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Ou cadastrar nova<input name="mixtureSpeciesName" placeholder="Somente se for nova" /></label><label>Total da mistura<div className="weight"><input name="mixtureWeightKg" inputMode="decimal" placeholder="0" /><span>kg</span></div></label></div>
                  <div className="category-entry discard-entry"><label>Espécie do descarte<select name="discardSpeciesId" defaultValue=""><option value="">Selecionar cadastrada</option>{data.speciesOptions.filter((item: any) => item.id !== t.primarySpeciesId).map((item: any) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Ou cadastrar nova<input name="discardSpeciesName" placeholder="Somente se for nova" /></label><label>Total do descarte<div className="weight"><input name="discardWeightKg" inputMode="decimal" placeholder="0" /><span>kg</span></div></label></div>
                </fieldset>
              </>
            )}
            <button
              type="submit"
              className="save"
              disabled={
                busy ||
                ((modal === "capture" || modal === "mixture" || modal === "discard") && !setId) ||
                (modal === "capture" && !+weight.replace(",", ".")) ||
                (modal === "editSet" && !editSet)
              }
            >
              {busy
                ? "SALVANDO..."
                : modal === "capture"
                  ? "SALVAR CAPTURA"
                  : modal === "mixture"
                    ? "SALVAR MISTURA"
                    : modal === "discard"
                      ? "SALVAR DESCARTE"
                  : modal === "editSet"
                    ? "SALVAR ALTERAÇÕES"
                  : "SALVAR LARGADA E CAPTURA"}
            </button>
            {saveError && <p className="error">{saveError}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
