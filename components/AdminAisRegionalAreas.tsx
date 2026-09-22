"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, LoaderCircle, Radio, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { decimalToCoordinateInput } from "../lib/marineCoordinate";

type AdminArea = {
  id: number;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusNm: number;
  autoUpdate: boolean;
  visible: boolean;
  vesselCount: number;
  source: string;
  lastRefreshedAt: string;
  lastAttemptAt: string;
};

function dateTime(value: string) {
  if (!value) return "Nunca";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

export default function AdminAisRegionalAreas() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<AdminArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const adminFetch = async (url: string, init: RequestInit = {}) => {
    const makeRequest = async (token?: string | null) => {
      const headers = new Headers(init.headers || {});
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(url, { ...init, headers, credentials: "include", cache: "no-store", signal: init.signal || AbortSignal.timeout(30_000) });
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
      const response = await adminFetch("/api/admin-ais-areas");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível carregar as áreas AIS administrativas.");
      setItems(Array.isArray(data?.areas) ? data.areas : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar áreas AIS administrativas.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const refresh = async (item: AdminArea) => {
    setBusyId(item.id); setError(""); setMessage("");
    try {
      const response = await adminFetch("/api/admin-ais-areas", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh", id: item.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível atualizar a área.");
      setItems((current) => current.map((row) => row.id === item.id ? data.area : row));
      setMessage(data?.preserved ? `${item.name}: nenhum sinal novo; o snapshot anterior foi preservado.` : `${item.name}: área atualizada manualmente.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar a área."); }
    finally { setBusyId(null); }
  };

  const settings = async (item: AdminArea, patch: Partial<Pick<AdminArea, "autoUpdate" | "visible">>) => {
    setBusyId(item.id); setError(""); setMessage("");
    try {
      const next = { ...item, ...patch };
      const response = await adminFetch("/api/admin-ais-areas", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "settings", id: item.id, name: item.name, autoUpdate: next.autoUpdate, visible: next.visible }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível alterar a área.");
      setItems((current) => current.map((row) => row.id === item.id ? data.area : row));
      setMessage(`${item.name}: configuração atualizada.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao alterar a área."); }
    finally { setBusyId(null); }
  };

  const remove = async (item: AdminArea) => {
    if (!window.confirm(`Excluir a área AIS “${item.name}” para todos os usuários?`)) return;
    setBusyId(item.id); setError(""); setMessage("");
    try {
      const response = await adminFetch(`/api/admin-ais-areas?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível excluir a área.");
      setItems((current) => current.filter((row) => row.id !== item.id));
      setMessage(`${item.name}: área excluída.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao excluir a área."); }
    finally { setBusyId(null); }
  };

  return <section className="admin-ais-regional">
    <div className="admin-ais-regional-head">
      <div><small>AIS · SUPER ADMIN</small><h3><Radio /> Áreas AIS compartilhadas · 80 MN</h3><p>Crie a área pelo botão <b>ADM 80</b> no mapa AIS. Ela fica salva para todos os usuários e pode atualizar automaticamente uma vez por dia.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <RefreshCw />} Atualizar lista</button>
    </div>
    {message && <div className="admin-official-success">{message}</div>}
    {error && <div className="credits-error">{error}</div>}
    <div className="admin-ais-regional-list">
      {items.length ? items.map((item) => <article key={item.id}>
        <div className="admin-ais-regional-main"><span><Radio /></span><div><b>{item.name}</b><small>{decimalToCoordinateInput(item.centerLatitude)} {item.centerLatitude < 0 ? "S" : "N"} · {decimalToCoordinateInput(item.centerLongitude)} {item.centerLongitude < 0 ? "W" : "E"} · {item.radiusNm} MN</small><em>{item.vesselCount} barco(s) salvos · última atualização: {dateTime(item.lastRefreshedAt)}</em></div></div>
        <div className="admin-ais-regional-actions">
          <button type="button" onClick={() => void refresh(item)} disabled={busyId === item.id}>{busyId === item.id ? <LoaderCircle className="spin" /> : <RotateCw />} Atualizar agora</button>
          <button type="button" className={item.autoUpdate ? "active" : ""} onClick={() => void settings(item, { autoUpdate: !item.autoUpdate })} disabled={busyId === item.id}><RefreshCw /> Diário {item.autoUpdate ? "ON" : "OFF"}</button>
          <button type="button" className={item.visible ? "active" : ""} onClick={() => void settings(item, { visible: !item.visible })} disabled={busyId === item.id}>{item.visible ? <Eye /> : <EyeOff />} {item.visible ? "Visível" : "Oculta"}</button>
          <button type="button" className="danger" onClick={() => void remove(item)} disabled={busyId === item.id}><Trash2 /> Excluir</button>
        </div>
      </article>) : <div className="admin-no-users">Nenhuma área AIS administrativa de 80 MN foi criada ainda.</div>}
    </div>
  </section>;
}
