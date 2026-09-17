"use client";
import { useEffect, useState } from "react";
import {
  Anchor,
  Download,
  FileDown,
  Fish,
  Pencil,
  Plus,
  RefreshCw,
  ShipWheel,
  Share2,
  Trash2,
  Waves,
  BarChart3,
} from "lucide-react";
import CoordinateInput from "./CoordinateInput";
import FinishedTripDashboard from "./FinishedTripDashboard";
import BackupImporter from "./BackupImporter";
const localDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
function TripDateInput({ name, value, required = false, label }: { name: string; value?: string | null; required?: boolean; label: string }) {
  const initial = localDateTime(value);
  const [day, setDay] = useState(initial.slice(0, 10));
  const [time, setTime] = useState(initial.slice(11, 16) || "00:00");
  return (
    <span className="trip-date-fields">
      <input type="date" aria-label={`Data de ${label}`} required={required} value={day} onChange={(event) => setDay(event.currentTarget.value)} />
      <input type="time" aria-label={`Horário de ${label}`} required={Boolean(day)} value={time} onChange={(event) => setTime(event.currentTarget.value)} />
      <input type="hidden" name={name} value={day && time ? `${day}T${time}` : ""} />
    </span>
  );
}
type Props = { view: string; onDashboard: () => void };
type Store = {
  boats: any[];
  species: any[];
  trips: any[];
  sets: any[];
  catches: any[];
};
const empty: Store = {
  boats: [],
  species: [],
  trips: [],
  sets: [],
  catches: [],
};
const status: any = {
  IN_PROGRESS: "Em andamento",
  PLANNED: "Planejada",
  FINISHED: "Finalizada",
  CANCELLED: "Cancelada",
};
const f = (n: number) => new Intl.NumberFormat("pt-BR").format(n || 0);
const dmm = (value: number | null, latitude: boolean) => {
  if (value == null) return "Não informada";
  const absolute = Math.abs(Number(value));
  const degrees = Math.floor(absolute);
  const minutes = ((absolute - degrees) * 60).toFixed(3).padStart(6, "0");
  const direction = latitude ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  return `${String(degrees).padStart(3, "0")}º${minutes} ${direction}`;
};
export default function Operations({ view, onDashboard }: Props) {
  const [s, setS] = useState(empty),
    [loading, setLoading] = useState(true),
    [form, setForm] = useState<any>(null),
    [editing, setEditing] = useState<any>(null),
    [editingCatch, setEditingCatch] = useState<any>(null),
    [editingSpecies, setEditingSpecies] = useState<any>(null),
    [reportTripId, setReportTripId] = useState(""),
    [pdfTrip, setPdfTrip] = useState<any>(null),
    [pdfMode, setPdfMode] = useState<"download" | "share">("download"),
    [pdfFile, setPdfFile] = useState<File | null>(null),
    [sharing, setSharing] = useState(false),
    [pdfError, setPdfError] = useState(""),
    [saving, setSaving] = useState(false),
    [selectedFinishedTripId, setSelectedFinishedTripId] = useState<number | null>(null),
    [msg, setMsg] = useState("");
  const load = () => {
    setLoading(true);
    fetch("/api/manage")
      .then((r) => r.json())
      .then(setS)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => setSelectedFinishedTripId(null), [view]);
  async function save(type: string, e: any) {
    e.preventDefault();
    if (saving) return;
    setMsg("");
    setSaving(true);
    try {
      const o = Object.fromEntries(new FormData(e.currentTarget));
      if (type === "boat") {
        const name = String(o.name || "").trim();
        const registration = String(o.registration || "").trim();
        if (!name || !registration) {
          setMsg("Informe o nome e a matrícula da embarcação.");
          return;
        }
        o.name = name;
        o.registration = registration;
        o.capacity = String(o.capacity || "").replace(",", ".");
      }
      if (type === "trip") {
        const required = ["name", "boatId", "departureDate", "expectedReturnDate", "departurePort", "returnPort", "captain", "target", "speciesId"];
        if (required.some((field) => !String(o[field] || "").trim())) {
          setMsg("Preencha todos os campos obrigatórios da viagem.");
          return;
        }
        if (new Date(String(o.expectedReturnDate)) <= new Date(String(o.departureDate))) {
          setMsg("O retorno previsto deve ser posterior à data de saída.");
          return;
        }
      }
      const r = await fetch("/api/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, ...o }),
      });
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j.error || "Não foi possível salvar. Confira os dados e tente novamente.");
        return;
      }
      setForm(null);
      setMsg(type === "trip" ? "Viagem criada e sincronizada com o dashboard." : "Registro salvo com sucesso.");
      if (type === "trip") onDashboard();
      else load();
    } catch {
      setMsg("Falha de conexão. Confira sua internet e tente novamente.");
    } finally {
      setSaving(false);
    }
  }
  async function saveSet(e: any) {
    e.preventDefault();
    setMsg("");
    const o = Object.fromEntries(new FormData(e.currentTarget));
    const r = await fetch("/api/manage", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: editing.id, ...o }),
    });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error);
      return;
    }
    setEditing(null);
    setMsg("Largada atualizada com sucesso.");
    load();
  }
  async function saveCatch(e: any) {
    e.preventDefault();
    const o = Object.fromEntries(new FormData(e.currentTarget));
    const r = await fetch("/api/manage", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "catch", id: editingCatch.id, ...o }),
    });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error);
      return;
    }
    setEditingCatch(null);
    setMsg("Captura atualizada. O dashboard foi recalculado.");
    load();
  }
  async function saveSpecies(e: any) {
    e.preventDefault();
    setMsg("");
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const response = await fetch("/api/manage", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "species", id: editingSpecies.id, ...fields }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(result.error || "Não foi possível editar a espécie.");
      setEditingSpecies(null);
      setMsg("Espécie atualizada com sucesso.");
      load();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Não foi possível editar a espécie.");
    }
  }
  async function remove(type: string, id: number) {
    const warning =
      type === "set"
        ? "Excluir esta largada? As capturas vinculadas também serão excluídas."
      : type === "boat"
          ? "Excluir esta embarcação? Esta ação não poderá ser desfeita."
        : type === "species"
          ? "Excluir esta espécie da lista? Os registros antigos serão preservados."
        : "Excluir esta captura? O total da viagem será recalculado.";
    if (!confirm(warning)) return;
    setMsg("");
    try {
      const response = await fetch("/api/manage", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMsg(result.error || "Não foi possível excluir o registro.");
        return;
      }
      setMsg(type === "set" ? "Largada excluída." : type === "boat" ? "Embarcação excluída." : type === "species" ? "Espécie excluída." : "Captura excluída.");
      load();
    } catch {
      setMsg("Falha de conexão. Tente novamente.");
    }
  }
  async function finish(id: number) {
    if (!confirm("Finalizar esta viagem agora?")) return;
    await fetch("/api/manage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "finish", id }),
    });
    load();
  }
  async function del(id: number) {
    if (!confirm("Tem certeza? A viagem será arquivada com segurança.")) return;
    await fetch("/api/manage", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "trip", id }),
    });
    load();
  }
  function csv() {
    const rows = [
      ["Viagem", "Embarcação", "Meta kg", "Capturado kg", "Status"],
      ...s.trips.map((x) => [
        x.name,
        x.boatName,
        x.targetKg,
        x.total,
        status[x.status],
      ]),
    ];
    const blob = new Blob(
      ["\ufeff" + rows.map((r) => r.join(";")).join("\n")],
      { type: "text/csv" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "viagens-pesca.csv";
    a.click();
  }
  async function saveTrip(e: any) {
    e.preventDefault();
    const o = Object.fromEntries(new FormData(e.currentTarget));
    const r = await fetch("/api/manage", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "trip", id: editing.id, ...o }),
    });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error);
      return;
    }
    setEditing(null);
    setMsg("Viagem atualizada. O dashboard foi sincronizado.");
    load();
  }
  const titles: any = {
    "Viagem atual": "Viagem atual",
    Largadas: "Largadas",
    Capturas: "Capturas",
    Histórico: "Histórico de viagens",
    "Comparar viagens": "Comparar viagens",
    Embarcações: "Embarcações",
    Espécies: "Espécies",
    Relatórios: "Relatórios",
    Usuários: "Usuários",
    Configurações: "Configurações",
  };
  if (loading)
    return (
      <section className="ops">
        <div className="loading">
          <RefreshCw /> Carregando dados...
        </div>
      </section>
    );
  const current = s.trips.find((x) => x.status === "IN_PROGRESS");
  const selectedFinishedTrip = s.trips.find(
    (x) => x.status === "FINISHED" && Number(x.id) === Number(selectedFinishedTripId),
  );
  const downloadPdf = (trip: any, mode: "download" | "share" = "download") => { setPdfError(""); setPdfFile(null); setPdfMode(mode); setPdfTrip(trip); };
  const sharePdf = async () => {
    if (!pdfFile || sharing) return;
    setPdfError("");
    if (!navigator.canShare?.({ files: [pdfFile] })) {
      setPdfError("Este navegador não permite compartilhar arquivos. Baixe o PDF e anexe como documento no WhatsApp.");
      return;
    }
    setSharing(true);
    try {
      await navigator.share({ files: [pdfFile], title: "Relatório de viagem" });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setPdfError("Não foi possível compartilhar. Tente novamente ou baixe o PDF para anexar no WhatsApp.");
    } finally { setSharing(false); }
  };
  const savePreparedPdf = () => {
    if (!pdfFile) return;
    const url = URL.createObjectURL(pdfFile);
    const link = document.createElement("a");
    link.href = url; link.download = pdfFile.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const exportPdf = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const dates = Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true);
    setPdfError("");
    const trip = pdfTrip;
    setMsg("Preparando PDF com os dados mais recentes...");
    try {
      const saved = await fetch("/api/manage", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "tripDates", id: trip.id, ...dates }),
      });
      const result = await saved.json();
      if (!saved.ok) throw Error(result.error || "Não foi possível salvar as datas.");
      const response = await fetch("/api/manage", { cache: "no-store" });
      const fresh = await response.json();
      if (!response.ok) throw Error(fresh.error || "Não foi possível carregar os dados do relatório.");
      const freshTrip = fresh.trips.find((item: any) => Number(item.id) === Number(trip.id));
      if (!freshTrip) throw Error("Viagem não encontrada.");
      setS(fresh);
      setPdfTrip(freshTrip);
      const { generateTripPdf } = await import("../lib/tripPdf");
      const file = generateTripPdf(freshTrip, fresh.sets, fresh.catches, pdfMode === "download");
      if (pdfMode === "share") {
        setPdfFile(file);
        setMsg("");
      } else {
        setPdfTrip(null);
        setMsg("PDF gerado com os totais de Corvina, Mistura e Descarte.");
      }
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
      setMsg("");
    } finally { setSaving(false); }
  };
  return (
    <section className="ops">
      <div className="opshead">
        <div>
          <small>MÓDULO OPERACIONAL</small>
          <h2>{titles[view] || view}</h2>
        </div>
        {view === "Embarcações" && (
          <button onClick={() => setForm("boat")}>
            <Plus /> Nova embarcação
          </button>
        )}
        {view === "Espécies" && (
          <button onClick={() => setForm("species")}>
            <Plus /> Nova espécie
          </button>
        )}
        {["Histórico", "Viagem atual"].includes(view) && (
          <button onClick={() => setForm("trip")}>
            <Plus /> Nova viagem
          </button>
        )}
        {view === "Relatórios" && (
          <button onClick={csv}>
            <Download /> Exportar CSV
          </button>
        )}
      </div>
      {msg && <div className="success">{msg}</div>}
      {view === "Viagem atual" && (
        <div className="detail">
          <ShipWheel />
          <div>
            <small>EM ANDAMENTO</small>
            <h3>{current?.name || "Nenhuma viagem em andamento"}</h3>
            {current && (
              <p>
                {current.boatName} • Meta {f(current.targetKg)} kg • Capturado{" "}
                {f(current.total)} kg
              </p>
            )}
          </div>
          {current && (
            <div className="tripactions">
              <button
                className="editbtn"
                onClick={() => setEditing({ ...current, _type: "trip" })}
              >
                <Pencil /> Editar viagem
              </button>
              <button className="editbtn" onClick={() => downloadPdf(current)}>
                <FileDown /> PDF da viagem
              </button>
              <button className="editbtn" onClick={() => downloadPdf(current, "share")}><Share2 /> WhatsApp</button>
              <button className="deletebtn" onClick={() => del(current.id)}>
                <Trash2 /> Excluir viagem
              </button>
              <button onClick={() => finish(current.id)}>
                Finalizar viagem
              </button>
            </div>
          )}
        </div>
      )}
      {view === "Largadas" && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Largada</th>
                <th>Data</th>
                <th>Horário inicial</th>
                <th>Horário final</th>
                <th>Profundidade</th>
                <th>Posição inicial</th>
                <th>Posição final</th>
                <th>Captura</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {s.sets.map((x) => (
                <tr key={x.id}>
                  <td>
                    <b>#{String(x.setNumber).padStart(2, "0")}</b>
                  </td>
                  <td>{new Date(x.startedAt).toLocaleDateString("pt-BR")}</td>
                  <td>{new Date(x.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{x.finishedAt ? new Date(x.finishedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td>{x.depthMeters != null ? `${f(x.depthMeters)} m` : "—"}</td>
                  <td>
                    <small>Lat. {dmm(x.startLatitude, true)}</small>
                    <small>Long. {dmm(x.startLongitude, false)}</small>
                  </td>
                  <td>
                    <small>Lat. {dmm(x.endLatitude, true)}</small>
                    <small>Long. {dmm(x.endLongitude, false)}</small>
                  </td>
                  <td>{f(x.total)} kg</td>
                  <td>
                    <div className="rowactions">
                      <button
                        className="editbtn"
                        onClick={async () => {
                          const r = await fetch(`/api/fishing-set?id=${x.id}`);
                          setEditing(r.ok ? await r.json() : x);
                        }}
                      >
                        <Pencil /> Editar
                      </button>
                      <button
                        className="deletebtn"
                        onClick={() => remove("set", x.id)}
                      >
                        <Trash2 /> Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view === "Capturas" && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Largada</th>
                <th>Espécie</th>
                <th>Categoria</th>
                <th>Peso</th>
                <th>Observação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {s.catches.map((x) => (
                <tr key={x.id}>
                  <td>{new Date(x.caughtAt).toLocaleString("pt-BR")}</td>
                  <td>
                    #{s.sets.find((a) => a.id == x.fishingSetId)?.setNumber}
                  </td>
                  <td>{x.species}</td>
                  <td>{x.catchType === "MIXTURE" ? "Mistura" : x.catchType === "DISCARD" ? "Descarte" : "Corvina"}</td>
                  <td>
                    <b>{f(x.weightKg)} kg</b>
                  </td>
                  <td>{x.notes || "—"}</td>
                  <td>
                    <div className="rowactions">
                      <button
                        className="editbtn"
                        onClick={() => setEditingCatch(x)}
                      >
                        <Pencil /> Editar
                      </button>
                      <button
                        className="deletebtn"
                        onClick={() => remove("catch", x.id)}
                      >
                        <Trash2 /> Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view === "Embarcações" && (
        <div className="gridcards">
          {s.boats.map((x) => (
            <article key={x.id} className="boat-card">
              <Anchor />
              <small>{x.active ? "ATIVA" : "INATIVA"}</small>
              <h3>{x.name}</h3>
              <p>Matrícula: {x.registration}</p>
              <p>Porto base: {x.homePort || "—"}</p>
              <b>{f(x.storageCapacityKg)} kg de capacidade</b>
              <button
                type="button"
                className="deletebtn boat-delete"
                onClick={() => remove("boat", x.id)}
              >
                <Trash2 /> Excluir embarcação
              </button>
            </article>
          ))}
        </div>
      )}
      {view === "Espécies" && (
        <div className="gridcards">
          {s.species.map((x) => (
            <article key={x.id} className="species-card">
              <Fish />
              <small>{x.active ? "ATIVA" : "INATIVA"}</small>
              <h3>{x.commonName}</h3>
              <p>{x.scientificName || "Nome científico não informado"}</p>
              <b>{x.code || "Sem código"}</b>
              <div className="species-actions">
                <button type="button" className="editbtn" onClick={() => setEditingSpecies(x)}><Pencil /> Editar</button>
                <button type="button" className="deletebtn" onClick={() => remove("species", x.id)}><Trash2 /> Excluir</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {view === "Histórico" && selectedFinishedTrip && (
        <FinishedTripDashboard
          trip={selectedFinishedTrip}
          sets={s.sets}
          catches={s.catches}
          onBack={() => setSelectedFinishedTripId(null)}
        />
      )}
      {view === "Histórico" && !selectedFinishedTrip && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Viagem</th>
                <th>Embarcação</th>
                <th>Meta</th>
                <th>Captura</th>
                <th>Resultado</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {s.trips.map((x) => (
                <tr key={x.id}>
                  <td>
                    <b>{x.name}</b>
                    <small>
                      {new Date(x.departureDate).toLocaleDateString("pt-BR")}
                    </small>
                  </td>
                  <td>{x.boatName}</td>
                  <td>{f(x.targetKg)} kg</td>
                  <td>{f(x.total)} kg</td>
                  <td>{((x.total / x.targetKg) * 100).toFixed(1)}%</td>
                  <td>
                    <span className={`pill ${x.status}`}>
                      {status[x.status]}
                    </span>
                  </td>
                  <td>
                    <div className="rowactions">
                      <button
                        className="editbtn"
                        onClick={() => setEditing({ ...x, _type: "trip" })}
                        title="Editar viagem"
                      >
                        <Pencil /> Editar
                      </button>
                      {x.status === "FINISHED" && (
                        <button
                          className="analyzebtn"
                          onClick={() => setSelectedFinishedTripId(Number(x.id))}
                          title="Abrir dashboard desta viagem"
                        >
                          <BarChart3 /> Analisar
                        </button>
                      )}
                      <button className="editbtn" onClick={() => downloadPdf(x)} title="Baixar PDF da viagem"><FileDown /> PDF</button>
                      <button className="editbtn" onClick={() => downloadPdf(x, "share")}><Share2 /> WhatsApp</button>
                      <button className="deletebtn" onClick={() => del(x.id)} title="Excluir viagem"><Trash2 /> Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view === "Comparar viagens" && (
        <div className="compare">
          {s.trips.slice(0, 3).map((x) => (
            <article key={x.id}>
              <small>{x.boatName}</small>
              <h3>{x.name}</h3>
              <strong>{((x.total / x.targetKg) * 100).toFixed(1)}%</strong>
              <div>
                <i
                  style={{
                    width: `${Math.min(100, (x.total / x.targetKg) * 100)}%`,
                  }}
                />
              </div>
              <p>
                <span>Captura</span>
                <b>{f(x.total)} kg</b>
              </p>
              <p>
                <span>Meta</span>
                <b>{f(x.targetKg)} kg</b>
              </p>
              <p>
                <span>Largadas</span>
                <b>{x.sets}</b>
              </p>
            </article>
          ))}
        </div>
      )}
      {view === "Relatórios" && (
        <div className="report">
          <FileDown />
          <h3>Relatório profissional da viagem</h3>
          <p>
            Selecione uma viagem em andamento ou finalizada para gerar um PDF completo com embarcação, datas, totais e todas as largadas.
          </p>
          <div className="reportcontrols">
            <select value={reportTripId} onChange={(e) => setReportTripId(e.target.value)}>
              <option value="">Selecione a viagem</option>
              {s.trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.name} - {trip.boatName} ({status[trip.status]})</option>)}
            </select>
            <button disabled={!reportTripId} onClick={() => { const trip = s.trips.find((item) => String(item.id) === reportTripId); if (trip) downloadPdf(trip); }}><FileDown /> Gerar PDF</button>
            <button disabled={!reportTripId} onClick={() => { const trip = s.trips.find((item) => String(item.id) === reportTripId); if (trip) downloadPdf(trip, "share"); }}><Share2 /> WhatsApp</button>
          </div>
          <button className="csvbutton" onClick={csv}><Download /> Exportar resumo em CSV</button>
        </div>
      )}
      {view === "Configurações" && (
        <div className="settings">
          <h3>Preferências do painel</h3>
          <label>
            <span>Unidade padrão</span>
            <select>
              <option>Quilogramas (kg)</option>
              <option>Toneladas (t)</option>
            </select>
          </label>
          <label>
            <span>Permitir mais de uma viagem ativa por barco</span>
            <input type="checkbox" />
          </label>
          <label>
            <span>Modo de operação offline</span>
            <input type="checkbox" defaultChecked />
          </label>
          <button
            onClick={() => setMsg("Configurações salvas neste dispositivo.")}
          >
            Salvar configurações
          </button>
          <BackupImporter onImported={load} />
        </div>
      )}
      {!Object.keys(titles).includes(view) && (
        <div className="empty">
          <Anchor />
          <h3>Módulo disponível no menu</h3>
          <button onClick={onDashboard}>Voltar ao dashboard</button>
        </div>
      )}
      {pdfTrip && !pdfFile && (
        <div className="overlay">
          <form className="modal form" onSubmit={exportPdf} role="dialog" aria-modal="true" aria-labelledby="pdf-dates-title">
            <button type="button" className="modalx" disabled={saving} onClick={() => setPdfTrip(null)} aria-label="Fechar">×</button>
            <small>{pdfMode === "share" ? "COMPARTILHAR NO WHATSAPP" : "EXPORTAR PDF"}</small>
            <h2 id="pdf-dates-title">Datas da viagem</h2>
            <p>{pdfTrip.name}</p>
            <label>Data e horário de saída
              <TripDateInput key={`pdf-out-${pdfTrip.id}`} name="departureDate" label="saída" required value={pdfTrip.departureDate} />
            </label>
            <label>Data e horário de chegada ao porto
              <TripDateInput key={`pdf-in-${pdfTrip.id}`} name="returnDate" label="chegada" required={pdfTrip.status === "FINISHED"} value={pdfTrip.returnDate} />
            </label>
            <small>As datas serão salvas na viagem e usadas no PDF. Em viagens em andamento, deixe a chegada em branco se ainda não retornou.</small>
            {pdfError && <p role="alert">{pdfError}</p>}
            <button type="submit" disabled={saving}><FileDown /> {saving ? "Salvando e gerando..." : pdfMode === "share" ? "Salvar datas e preparar PDF" : "Salvar datas e gerar PDF"}</button>
          </form>
        </div>
      )}
      {pdfTrip && pdfFile && (
        <div className="overlay">
          <div className="modal form" role="dialog" aria-modal="true" aria-labelledby="share-pdf-title">
            <button type="button" className="modalx" disabled={sharing} onClick={() => { setPdfTrip(null); setPdfFile(null); }} aria-label="Fechar">×</button>
            <h2 id="share-pdf-title">PDF pronto para compartilhar</h2>
            <p>{pdfTrip.name}</p>
            <p>Toque abaixo e escolha o WhatsApp na lista de aplicativos para enviar o arquivo.</p>
            {pdfError && <p role="alert">{pdfError}</p>}
            <button type="button" disabled={sharing} onClick={sharePdf}><Share2 /> {sharing ? "Compartilhando..." : "Compartilhar PDF no WhatsApp"}</button>
            <button type="button" onClick={savePreparedPdf}><FileDown /> Baixar PDF</button>
            <button type="button" disabled={sharing} onClick={() => { setPdfFile(null); setPdfError(""); }}>Alterar datas</button>
          </div>
        </div>
      )}
      {editing?._type === "trip" && (
        <div className="overlay">
          <form
            className="modal form"
            onSubmit={saveTrip}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modalx"
              onClick={() => setEditing(null)}
            >
              ×
            </button>
            <small>EDITAR VIAGEM</small>
            <h2>{editing.name}</h2>
            <label>
              Nome/código
              <input name="name" required defaultValue={editing.name} />
            </label>
            <label>
              Embarcação
              <select name="boatId" required defaultValue={editing.boatId}>
                {s.boats.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="twocol">
              <label>
                Saída
                <TripDateInput key={`edit-out-${editing.id}`} name="departureDate" label="saída" required value={editing.departureDate} />
              </label>
              <label>
                Retorno previsto
                <input
                  name="expectedReturnDate"
                  type="datetime-local"
                  required
                  defaultValue={editing.expectedReturnDate?.slice(0, 16)}
                />
              </label>
            </div>
            <label>
              Chegada ao porto
              <TripDateInput key={`edit-in-${editing.id}`} name="returnDate" label="chegada" required={editing.status === "FINISHED"} value={editing.returnDate} />
              <small>Informe a chegada real. Esta data será usada no PDF da viagem finalizada.</small>
            </label>
            <label>
              Porto de saída
              <input
                name="departurePort"
                required
                defaultValue={editing.departurePort}
              />
            </label>
            <label>
              Porto de retorno
              <input
                name="returnPort"
                required
                defaultValue={editing.returnPort || ""}
              />
            </label>
            <label>
              Mestre
              <input name="captain" required defaultValue={editing.captain} />
            </label>
            <label>
              Tripulantes
              <input
                name="crewCount"
                type="number"
                min="1"
                defaultValue={editing.crewCount || 1}
              />
            </label>
            <label>
              Meta em kg
              <input
                name="target"
                type="number"
                min="1"
                required
                defaultValue={editing.targetKg}
              />
              <input type="hidden" name="unit" value="kg" />
            </label>
            <label>
              Espécie principal
              <select
                name="speciesId"
                defaultValue={editing.primarySpeciesId || ""}
              >
                <option value="">Selecione</option>
                {s.species.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.commonName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo de pesca
              <input
                name="fishingType"
                defaultValue={editing.fishingType || "Rede de emalhe"}
              />
            </label>
            <label>
              Status
              <select name="status" defaultValue={editing.status}>
                <option value="PLANNED">Planejada</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="FINISHED">Finalizada</option>
                <option value="CANCELLED">Cancelada</option>
              </select>
            </label>
            <label>
              Observações
              <input name="notes" defaultValue={editing.notes || ""} />
            </label>
            <button className="save">SALVAR ALTERAÇÕES</button>
            {msg && <p className="error">{msg}</p>}
          </form>
        </div>
      )}
      {editingCatch && (
        <div className="overlay" onMouseDown={() => setEditingCatch(null)}>
          <form
            className="modal form"
            onSubmit={saveCatch}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modalx"
              onClick={() => setEditingCatch(null)}
            >
              ×
            </button>
            <small>EDITAR CAPTURA</small>
            <h2>{editingCatch.species}</h2>
            <label>
              Espécie
              <select name="speciesId" defaultValue={editingCatch.speciesId}>
                {s.species.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.commonName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data e hora
              <input
                name="caughtAt"
                type="datetime-local"
                required
                defaultValue={editingCatch.caughtAt?.slice(0, 16)}
              />
            </label>
            <label>
              Peso (kg)
              <input
                name="weightKg"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={editingCatch.weightKg}
              />
            </label>
            <label>
              Observação
              <input name="notes" defaultValue={editingCatch.notes || ""} />
            </label>
            <button className="save">SALVAR ALTERAÇÕES</button>
            {msg && <p className="error">{msg}</p>}
          </form>
        </div>
      )}
      {editingSpecies && (
        <div className="overlay" onMouseDown={() => setEditingSpecies(null)}>
          <form className="modal form" onSubmit={saveSpecies} onMouseDown={(e) => e.stopPropagation()}>
            <button type="button" className="modalx" onClick={() => setEditingSpecies(null)}>×</button>
            <small>EDITAR ESPÉCIE</small>
            <h2>{editingSpecies.commonName}</h2>
            <label>Nome comum<input name="name" required defaultValue={editingSpecies.commonName} /></label>
            <label>Nome científico<input name="scientificName" defaultValue={editingSpecies.scientificName || ""} /></label>
            <label>Código<input name="code" defaultValue={editingSpecies.code || ""} /></label>
            <button type="submit" className="save">SALVAR ALTERAÇÕES</button>
            {msg && <p className="error" role="alert">{msg}</p>}
          </form>
        </div>
      )}
      {editing && editing._type !== "trip" && (
        <div className="overlay">
          <form
            className="modal form"
            onSubmit={saveSet}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modalx"
              onClick={() => setEditing(null)}
            >
              ×
            </button>
            <small>EDITAR REGISTRO</small>
            <h2>Largada #{String(editing.setNumber).padStart(2, "0")}</h2>
            <div className="twocol">
              <label>
                Início
                <input
                  name="startedAt"
                  type="datetime-local"
                  required
                  defaultValue={editing.startedAt?.slice(0, 16)}
                />
              </label>
              <label>
                Recolhimento
                <input
                  name="finishedAt"
                  type="datetime-local"
                  defaultValue={editing.finishedAt?.slice(0, 16)}
                />
              </label>
              <label>
                Latitude inicial
                <CoordinateInput name="startLatitude" direction="S" defaultDecimal={editing.startLatitude} />
              </label>
              <label>
                Longitude inicial
                <CoordinateInput name="startLongitude" direction="W" defaultDecimal={editing.startLongitude} />
              </label>
              <label>
                Latitude final
                <CoordinateInput name="endLatitude" direction="S" defaultDecimal={editing.endLatitude} />
              </label>
              <label>
                Longitude final
                <CoordinateInput name="endLongitude" direction="W" defaultDecimal={editing.endLongitude} />
              </label>
              <label>
                Profundidade (m)
                <input
                  name="depthMeters"
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={editing.depthMeters ?? ""}
                />
              </label>
              <label>
                Comprimento da rede (m)
                <input
                  name="netLengthMeters"
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={editing.netLengthMeters ?? ""}
                />
              </label>
              <label>
                Altura da rede (m)
                <input
                  name="netHeightMeters"
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={editing.netHeightMeters ?? ""}
                />
              </label>
              <label>
                Tamanho da malha
                <input
                  name="meshSize"
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={editing.meshSize ?? ""}
                />
              </label>
              <label>
                Quantidade de panos
                <input
                  name="netQuantity"
                  type="number"
                  min="0"
                  defaultValue={editing.netQuantity ?? ""}
                />
              </label>
              <label>
                Tempo na água (min)
                <input
                  name="soakTimeMinutes"
                  type="number"
                  min="0"
                  defaultValue={editing.soakTimeMinutes ?? ""}
                />
              </label>
              <label>
                Temperatura da água (°C)
                <input
                  name="waterTemperature"
                  type="number"
                  step="any"
                  defaultValue={editing.waterTemperature ?? ""}
                />
              </label>
            </div>
            <label>
              Observações
              <input name="notes" defaultValue={editing.notes ?? ""} />
            </label>
            <button className="save">SALVAR ALTERAÇÕES</button>
            {msg && <p className="error">{msg}</p>}
          </form>
        </div>
      )}
      {form && (
        <div className="overlay" onMouseDown={() => setForm(null)}>
          <form
            className="modal form"
            onSubmit={(e) => save(form, e)}
            onMouseDown={(e) => e.stopPropagation()}
            noValidate
          >
            <button
              type="button"
              className="modalx"
              onClick={() => setForm(null)}
            >
              ×
            </button>
            <small>NOVO REGISTRO</small>
            <h2>
              {form === "boat"
                ? "Embarcação"
                : form === "species"
                  ? "Espécie"
                  : "Viagem"}
            </h2>
            {form === "boat" && (
              <>
                <label>
                  Nome
                  <input name="name" required autoComplete="organization" enterKeyHint="next" />
                </label>
                <label>
                  Matrícula
                  <input name="registration" required autoCapitalize="characters" enterKeyHint="next" />
                </label>
                <label>
                  Proprietário
                  <input name="owner" />
                </label>
                <label>
                  Porto base
                  <input name="homePort" />
                </label>
                <label>
                  Capacidade em kg
                  <input name="capacity" type="number" inputMode="decimal" min="1" step="any" enterKeyHint="done" />
                </label>
              </>
            )}
            {form === "species" && (
              <>
                <label>
                  Nome comum
                  <input name="name" required />
                </label>
                <label>
                  Nome científico
                  <input name="scientificName" />
                </label>
                <label>
                  Código
                  <input name="code" />
                </label>
              </>
            )}
            {form === "trip" && (
              <>
                <label>
                  Nome/código
                  <input name="name" required />
                </label>
                <label>
                  Embarcação
                  <select name="boatId" required defaultValue="">
                    <option value="">Selecione</option>
                    {s.boats.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="twocol">
                  <label>
                    Saída
                    <input
                      name="departureDate"
                      type="datetime-local"
                      required
                    />
                  </label>
                  <label>
                    Retorno previsto
                    <input
                      name="expectedReturnDate"
                      type="datetime-local"
                      required
                    />
                  </label>
                </div>
                <label>
                  Porto de saída
                  <input name="departurePort" required />
                </label>
                <label>
                  Porto de retorno
                  <input name="returnPort" required />
                </label>
                <label>
                  Mestre
                  <input name="captain" required />
                </label>
                <label>
                  Número de tripulantes
                  <input name="crewCount" type="number" inputMode="numeric" min="1" defaultValue="1" required />
                </label>
                <label>
                  Meta
                  <div className="inline">
                    <input name="target" type="number" min="1" required />
                    <select name="unit">
                      <option value="kg">kg</option>
                      <option value="t">toneladas</option>
                    </select>
                  </div>
                </label>
                <label>
                  Espécie principal
                  <select
                    name="speciesId"
                    required
                    defaultValue={String(s.species.find((x) => x.commonName?.toLowerCase() === "corvina")?.id || "")}
                  >
                    <option value="">Selecione</option>
                    {s.species.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.commonName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo de pesca
                  <input name="fishingType" defaultValue="Rede de emalhe" required />
                </label>
                <label>
                  Status
                  <select name="status" defaultValue="IN_PROGRESS">
                    <option value="IN_PROGRESS">Em andamento</option>
                    <option value="PLANNED">Planejada</option>
                  </select>
                </label>
              </>
            )}
            {msg && <p className="error form-error" role="alert">{msg}</p>}
            <button type="submit" className="save mobile-save" disabled={saving}>
              {saving ? "SALVANDO..." : form === "boat" ? "SALVAR EMBARCAÇÃO" : "SALVAR"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
