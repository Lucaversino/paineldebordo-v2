"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LoaderCircle, PlusCircle, RefreshCw, Search, Ship, Trash2, Zap, ZapOff } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

type FreeSearchVessel = {
  id: string;
  name: string;
  mmsi: string;
  imo: string;
  callsign: string;
  flag: string;
};

type AdminFreeVessel = {
  id: number;
  vesselKey: string;
  name: string;
  mmsi: string;
  imo: string;
  callsign: string;
  flag: string;
  automatic: boolean;
  latitude: number | null;
  longitude: number | null;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  vesselType: string;
  navStatus: string;
  dataSource: string;
  positionReceived: string;
  lastCheckedAt: string;
  lastError: string;
  createdAt: string;
  updatedAt: string;
};

function when(value: string) {
  if (!value) return "nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function position(row: AdminFreeVessel) {
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return "SEM POSIÇÃO FREE";
  return `${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}`;
}

export default function AdminFreeVessels() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<AdminFreeVessel[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FreeSearchVessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [addingKey, setAddingKey] = useState("");
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const adminFetch = async (url: string, init: RequestInit = {}) => {
    const makeRequest = async (token?: string | null) => {
      const headers = new Headers(init.headers || {});
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(url, { ...init, headers, credentials: "include", cache: "no-store", signal: init.signal || AbortSignal.timeout(240_000) });
    };
    const { data } = await supabase.auth.getSession();
    let response = await makeRequest(data.session?.access_token || null);
    if (response.status !== 401) return response;
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ? makeRequest(refreshed.session.access_token) : response;
  };

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await adminFetch("/api/admin-free-vessels");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível carregar os barcos FREE.");
      setItems(Array.isArray(data?.vessels) ? data.vessels : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar barcos FREE."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 3) { setError("Digite pelo menos 3 caracteres."); return; }
    setSearching(true); setError(""); setMessage(""); setResults([]);
    try {
      const response = await adminFetch("/api/admin-free-vessels", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "search", query: q }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Pesquisa FREE indisponível.");
      setResults(Array.isArray(data?.vessels) ? data.vessels : []);
      if (!data?.vessels?.length) setMessage("Nenhuma embarcação encontrada. Tente MMSI, IMO ou outro nome.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na pesquisa FREE."); }
    finally { setSearching(false); }
  };

  const add = async (vessel: FreeSearchVessel) => {
    const key = vessel.mmsi || vessel.imo || vessel.id || vessel.name;
    if (!key || addingKey) return;
    setAddingKey(key); setError(""); setMessage("");
    try {
      const response = await adminFetch("/api/admin-free-vessels", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", vessel }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível adicionar o barco.");
      await load();
      setMessage(`${data?.vessel?.name || vessel.name || "Barco"} adicionado ao AIS de todos os usuários.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao adicionar barco."); }
    finally { setAddingKey(""); }
  };

  const refreshOne = async (item: AdminFreeVessel) => {
    setBusyId(item.id); setError(""); setMessage("");
    try {
      const response = await adminFetch("/api/admin-free-vessels", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh", id: item.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível atualizar a posição.");
      setItems((current) => current.map((row) => row.id === item.id ? data.vessel : row));
      setMessage(data?.vessel?.lastError ? `Consulta concluída, mas sem nova posição FREE para ${item.name}.` : `${item.name} atualizado.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar barco."); }
    finally { setBusyId(null); }
  };

  const refreshAll = async () => {
    if (refreshingAll) return;
    setRefreshingAll(true); setError(""); setMessage("");
    try {
      const response = await adminFetch("/api/admin-free-vessels", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh-all" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível atualizar a lista.");
      await load();
      setMessage(`${Number(data?.updated || 0)} barco(s) automático(s) consultado(s).`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar barcos."); }
    finally { setRefreshingAll(false); }
  };

  const toggleAutomatic = async (item: AdminFreeVessel) => {
    setBusyId(item.id); setError(""); setMessage("");
    try {
      const response = await adminFetch("/api/admin-free-vessels", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "automatic", id: item.id, automatic: !item.automatic }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível alterar o automático.");
      setItems((current) => current.map((row) => row.id === item.id ? data.vessel : row));
      setMessage(!item.automatic ? "Atualização automática diária ativada." : "Atualização automática desativada para este barco.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao alterar atualização automática."); }
    finally { setBusyId(null); }
  };

  const remove = async (item: AdminFreeVessel) => {
    if (!window.confirm(`Excluir “${item.name}” da lista FREE global? Ele deixará de aparecer para todos os usuários.`)) return;
    setBusyId(item.id); setError(""); setMessage("");
    try {
      const response = await adminFetch(`/api/admin-free-vessels?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível excluir o barco.");
      setItems((current) => current.filter((row) => row.id !== item.id));
      setMessage(`${item.name} removido do AIS global.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao excluir barco."); }
    finally { setBusyId(null); }
  };

  return <section className="admin-free-vessels">
    <div className="admin-free-head">
      <div><small>AIS FREE · SUPER ADMIN</small><h3><Ship /> Barcos FREE para todos</h3><p>Pesquise um barco específico, adicione à lista global e mantenha a posição salva. Não faz busca por área. O botão FREE normal dos usuários continua separado.</p></div>
      <button type="button" onClick={() => void refreshAll()} disabled={refreshingAll || !items.length}>{refreshingAll ? <LoaderCircle className="spin" /> : <RefreshCw />} Atualizar automáticos</button>
    </div>

    {message && <div className="admin-official-success"><CheckCircle2 /> {message}</div>}
    {error && <div className="credits-error">{error}</div>}

    <form className="admin-free-search" onSubmit={search}>
      <Search />
      <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} placeholder="Nome, MMSI, IMO ou indicativo do barco" />
      <button type="submit" disabled={searching}>{searching ? <LoaderCircle className="spin" /> : <Search />} PESQUISAR BARCO FREE</button>
    </form>

    {results.length > 0 && <div className="admin-free-results">
      <div className="admin-free-subhead"><b>RESULTADOS DA PESQUISA</b><span>{results.length} encontrado(s)</span></div>
      {results.map((row, index) => {
        const key = row.mmsi || row.imo || row.id || row.name || String(index);
        const already = items.some((item) => (row.mmsi && item.mmsi === row.mmsi) || (row.imo && item.imo === row.imo));
        return <article key={`${key}-${index}`}>
          <Ship />
          <div><b>{row.name || "Embarcação sem nome"}</b><small>MMSI {row.mmsi || "—"} · IMO {row.imo || "—"} · {row.flag || "bandeira —"}</small><span>{row.callsign ? `Indicativo ${row.callsign}` : "Fonte AIS FREE atual"}</span></div>
          <button type="button" disabled={already || addingKey === key} onClick={() => void add(row)}>{addingKey === key ? <LoaderCircle className="spin" /> : <PlusCircle />}{already ? "JÁ ADICIONADO" : "ADICIONAR"}</button>
        </article>;
      })}
    </div>}

    <div className="admin-free-list">
      <div className="admin-free-subhead"><b>LISTA GLOBAL</b><span>{items.length} barco(s) · automática 1x/dia</span></div>
      {loading && !items.length ? <div className="credits-loading"><LoaderCircle className="spin" /> Carregando...</div> : items.length ? items.map((item) => <article key={item.id} className={!item.automatic ? "manual" : ""}>
        <div className="admin-free-ship"><Ship /></div>
        <div className="admin-free-info">
          <b>{item.name}</b>
          <small>MMSI {item.mmsi || "—"} · IMO {item.imo || "—"} · {item.flag || "—"}</small>
          <span className={Number.isFinite(item.latitude) && Number.isFinite(item.longitude) ? "position ok" : "position"}>{position(item)}</span>
          <em><Clock3 /> Última consulta: {when(item.lastCheckedAt)} {item.positionReceived ? `· posição ${when(item.positionReceived)}` : ""}</em>
          {item.lastError && <p>{item.lastError}</p>}
        </div>
        <div className="admin-free-actions">
          <button type="button" className={item.automatic ? "auto on" : "auto off"} onClick={() => void toggleAutomatic(item)} disabled={busyId === item.id} title="Liga/desliga atualização diária">{item.automatic ? <Zap /> : <ZapOff />}<span>{item.automatic ? "AUTO" : "MANUAL"}</span></button>
          <button type="button" onClick={() => void refreshOne(item)} disabled={busyId === item.id} title="Atualizar agora">{busyId === item.id ? <LoaderCircle className="spin" /> : <RefreshCw />}<span>ATUALIZAR</span></button>
          <button type="button" className="danger" onClick={() => void remove(item)} disabled={busyId === item.id} title="Excluir da lista global"><Trash2 /><span>EXCLUIR</span></button>
        </div>
      </article>) : <div className="admin-official-empty"><Ship /><span>Nenhum barco FREE global cadastrado. Pesquise acima e adicione.</span></div>}
    </div>
  </section>;
}
