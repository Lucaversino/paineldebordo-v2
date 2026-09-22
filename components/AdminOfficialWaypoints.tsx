"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, MapPin, Pencil, PlusCircle, RefreshCw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { coordinateInputToDecimal, decimalToCoordinateInput, formatCoordinateInput } from "../lib/marineCoordinate";
import { officialWaypointIconDataUri } from "../lib/officialWaypointIcons";

type OfficialWaypointType = "skull" | "rock" | "reef" | "wreck";
type OfficialWaypoint = {
  id: number;
  name: string;
  waypointType: OfficialWaypointType;
  latitude: number;
  longitude: number;
  description: string;
  visible: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

const TYPES: Array<{ value: OfficialWaypointType; label: string; hint: string }> = [
  { value: "skull", label: "Caveira", hint: "Perigo / atenção máxima" },
  { value: "rock", label: "Pedra", hint: "Pedra, laje ou risco" },
  { value: "reef", label: "Parcel", hint: "Parcel / elevação do fundo" },
  { value: "wreck", label: "Naufrágio", hint: "Barco ou estrutura naufragada" },
];

function iconSrc(type: OfficialWaypointType) {
  return officialWaypointIconDataUri(type);
}

function typeLabel(type: OfficialWaypointType) {
  return TYPES.find((item) => item.value === type)?.label || "Waypoint";
}

export default function AdminOfficialWaypoints() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<OfficialWaypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [waypointType, setWaypointType] = useState<OfficialWaypointType>("rock");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(true);

  const adminFetch = async (url: string, init: RequestInit = {}) => {
    const makeRequest = async (token?: string | null) => {
      const headers = new Headers(init.headers || {});
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(url, { ...init, headers, credentials: "include", cache: "no-store", signal: init.signal || AbortSignal.timeout(18_000) });
    };
    const { data: sessionData } = await supabase.auth.getSession();
    let response = await makeRequest(sessionData.session?.access_token || null);
    if (response.status !== 401) return response;
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ? makeRequest(refreshed.session.access_token) : response;
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setWaypointType("rock");
    setLatitude("");
    setLongitude("");
    setDescription("");
    setVisible(true);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminFetch("/api/official-waypoints?includeHidden=1");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível carregar os waypoints oficiais.");
      setItems(Array.isArray(data?.waypoints) ? data.waypoints : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar waypoints oficiais.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const edit = (item: OfficialWaypoint) => {
    setEditingId(item.id);
    setName(item.name);
    setWaypointType(item.waypointType);
    setLatitude(decimalToCoordinateInput(item.latitude));
    setLongitude(decimalToCoordinateInput(item.longitude));
    setDescription(item.description || "");
    setVisible(item.visible !== false);
    setMessage("");
    setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const lat = coordinateInputToDecimal(latitude, true);
    const lon = coordinateInputToDecimal(longitude, true);
    if (lat == null || lon == null) {
      setError("Confira latitude e longitude no padrão 25°4719 / 48°0296.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await adminFetch("/api/official-waypoints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editingId, name, waypointType, latitude: lat, longitude: lon, description, visible }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível salvar.");
      setMessage(editingId ? "Waypoint oficial atualizado." : "Waypoint oficial adicionado ao AIS.");
      resetForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar waypoint oficial.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: OfficialWaypoint) => {
    if (!window.confirm(`Apagar definitivamente o waypoint oficial “${item.name}”?`)) return;
    setDeletingId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await adminFetch(`/api/official-waypoints?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível apagar.");
      setItems((current) => current.filter((row) => row.id !== item.id));
      if (editingId === item.id) resetForm();
      setMessage("Waypoint oficial apagado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao apagar waypoint oficial.");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleVisibility = async (item: OfficialWaypoint) => {
    setError("");
    setMessage("");
    try {
      const response = await adminFetch("/api/official-waypoints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...item, visible: !item.visible }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível alterar a visibilidade.");
      setItems((current) => current.map((row) => row.id === item.id ? data.waypoint : row));
      setMessage(!item.visible ? "Waypoint exibido no AIS." : "Waypoint ocultado do AIS.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao alterar visibilidade.");
    }
  };

  return <section className="admin-official-waypoints">
    <div className="admin-official-head">
      <div><small>MAPA AIS · SUPER ADMIN</small><h3><MapPin /> Waypoints Oficiais</h3><p>Cadastre perigos, pedras, parcéis e naufrágios. Usuários apenas visualizam; exclusão fica protegida no servidor para o administrador principal.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <RefreshCw />} Atualizar</button>
    </div>

    {message && <div className="admin-official-success"><CheckCircle2 /> {message}</div>}
    {error && <div className="credits-error">{error}</div>}

    <div className="admin-official-grid">
      <form className="admin-official-form" onSubmit={submit}>
        <div className="admin-official-form-title"><span><ShieldCheck /><b>{editingId ? "EDITAR WAYPOINT OFICIAL" : "NOVO WAYPOINT OFICIAL"}</b></span>{editingId && <button type="button" onClick={resetForm}><X /></button>}</div>
        <label>Nome<input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Ex.: Pedra do Sul" required /></label>
        <div className="admin-official-types">
          {TYPES.map((type) => <button key={type.value} type="button" className={waypointType === type.value ? "active" : ""} onClick={() => setWaypointType(type.value)}>
            <img src={iconSrc(type.value)} alt="" /><span><b>{type.label}</b><small>{type.hint}</small></span>
          </button>)}
        </div>
        <div className="admin-official-coords">
          <label>LAT S<input inputMode="numeric" value={latitude} onChange={(e) => setLatitude(formatCoordinateInput(e.target.value))} placeholder="25°4719" required /></label>
          <label>LON W<input inputMode="numeric" value={longitude} onChange={(e) => setLongitude(formatCoordinateInput(e.target.value))} placeholder="48°0296" required /></label>
        </div>
        <label>Observação<textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} placeholder="Descrição, risco, profundidade conhecida, referência..." rows={3} /></label>
        <label className="admin-official-visible"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /><span>{visible ? <Eye /> : <EyeOff />} Mostrar automaticamente no AIS</span></label>
        <button className="primary admin-official-save" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : editingId ? <Save /> : <PlusCircle />}{saving ? "SALVANDO..." : editingId ? "SALVAR ALTERAÇÕES" : "ADICIONAR AO AIS"}</button>
      </form>

      <div className="admin-official-list">
        <div className="admin-official-list-head"><b>CADASTRADOS</b><span>{items.length} waypoint(s)</span></div>
        {loading && !items.length ? <div className="credits-loading"><LoaderCircle className="spin" /> Carregando...</div> : items.length ? items.map((item) => <article key={item.id} className={!item.visible ? "hidden" : ""}>
          <img src={iconSrc(item.waypointType)} alt="" />
          <div className="admin-official-item-main"><b>{item.name}</b><small>{typeLabel(item.waypointType)} · {decimalToCoordinateInput(item.latitude)} S / {decimalToCoordinateInput(item.longitude)} W</small><p>{item.description || "Sem observação."}</p></div>
          <div className="admin-official-item-actions">
            <button type="button" onClick={() => void toggleVisibility(item)} title={item.visible ? "Ocultar do AIS" : "Mostrar no AIS"}>{item.visible ? <Eye /> : <EyeOff />}</button>
            <button type="button" onClick={() => edit(item)} title="Editar"><Pencil /></button>
            <button type="button" className="danger" disabled={deletingId === item.id} onClick={() => void remove(item)} title="Apagar — somente administrador principal">{deletingId === item.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button>
          </div>
        </article>) : <div className="admin-official-empty"><MapPin /><span>Nenhum waypoint oficial cadastrado.</span></div>}
      </div>
    </div>
  </section>;
}
