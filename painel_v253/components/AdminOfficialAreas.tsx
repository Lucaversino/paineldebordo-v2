"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, MapPinned, Pencil, RefreshCw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

type AreaColor = "green" | "yellow" | "red";
type AreaPoint = { latitude: number; longitude: number };
type OfficialArea = {
  id: number; name: string; color: AreaColor; transparency: number; points: AreaPoint[];
  description: string; visible: boolean; createdBy: string; createdAt: string; updatedAt: string;
};

const COLOR_LABEL: Record<AreaColor, string> = { green: "Verde", yellow: "Amarelo", red: "Vermelho" };
const COLOR_HEX: Record<AreaColor, string> = { green: "#2bd47d", yellow: "#f0c84b", red: "#ef5350" };

export default function AdminOfficialAreas() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<OfficialArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<OfficialArea | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<AreaColor>("green");
  const [transparency, setTransparency] = useState(55);
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const adminFetch = async (url: string, init: RequestInit = {}) => {
    const makeRequest = async (token?: string | null) => {
      const headers = new Headers(init.headers || {});
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(url, { ...init, headers, credentials: "include", cache: "no-store", signal: init.signal || AbortSignal.timeout(18_000) });
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
      const response = await adminFetch("/api/official-areas?includeHidden=1");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível carregar as áreas oficiais.");
      setItems(Array.isArray(data?.areas) ? data.areas : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar áreas oficiais."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const beginEdit = (item: OfficialArea) => {
    setEditing(item); setName(item.name); setColor(item.color); setTransparency(item.transparency);
    setDescription(item.description || ""); setVisible(item.visible !== false); setMessage(""); setError("");
  };
  const cancelEdit = () => { setEditing(null); setName(""); setColor("green"); setTransparency(55); setDescription(""); setVisible(true); };

  const saveEdit = async () => {
    if (!editing || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await adminFetch("/api/official-areas", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editing.id, name, color, transparency, description, visible, points: editing.points }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível atualizar a área.");
      setItems((current) => current.map((row) => row.id === editing.id ? data.area : row));
      setMessage("Área oficial atualizada."); cancelEdit();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar área oficial."); }
    finally { setSaving(false); }
  };

  const toggleVisibility = async (item: OfficialArea) => {
    setError(""); setMessage("");
    try {
      const response = await adminFetch("/api/official-areas", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...item, visible: !item.visible }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível alterar a visibilidade.");
      setItems((current) => current.map((row) => row.id === item.id ? data.area : row));
      setMessage(item.visible ? "Área ocultada do AIS." : "Área exibida no AIS.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao alterar visibilidade."); }
  };

  const remove = async (item: OfficialArea) => {
    if (!window.confirm(`Apagar definitivamente a área “${item.name}”?`)) return;
    setDeletingId(item.id); setError(""); setMessage("");
    try {
      const response = await adminFetch(`/api/official-areas?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível apagar.");
      setItems((current) => current.filter((row) => row.id !== item.id));
      if (editing?.id === item.id) cancelEdit();
      setMessage("Área oficial apagada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao apagar área oficial."); }
    finally { setDeletingId(null); }
  };

  return <section className="admin-official-areas">
    <div className="admin-official-head">
      <div><small>MAPA AIS · SUPER ADMIN</small><h3><MapPinned /> Áreas / Reservas Oficiais</h3><p>O desenho é feito diretamente no AIS pelo botão ÁREA ADMIN. Aqui você gerencia nome, cor, transparência, visibilidade e exclusão.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <RefreshCw />} Atualizar</button>
    </div>
    {message && <div className="admin-official-success"><CheckCircle2 /> {message}</div>}
    {error && <div className="credits-error">{error}</div>}

    {editing && <div className="admin-area-editor">
      <div className="admin-official-form-title"><span><ShieldCheck /><b>EDITAR ÁREA OFICIAL</b></span><button type="button" onClick={cancelEdit}><X /></button></div>
      <label>Nome<input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} /></label>
      <div className="admin-area-colors">{(["green","yellow","red"] as AreaColor[]).map((value) => <button key={value} type="button" className={color === value ? "active" : ""} onClick={() => setColor(value)}><i style={{background:COLOR_HEX[value]}} />{COLOR_LABEL[value]}</button>)}</div>
      <label>Transparência <b>{transparency}%</b><input type="range" min="0" max="100" value={transparency} onChange={(e) => setTransparency(Number(e.target.value))} /></label>
      <label>Observação<textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} /></label>
      <label className="admin-official-visible"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /><span>{visible ? <Eye /> : <EyeOff />} Mostrar automaticamente no AIS</span></label>
      <button type="button" className="primary admin-official-save" onClick={() => void saveEdit()} disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />} SALVAR ALTERAÇÕES</button>
    </div>}

    <div className="admin-area-list">
      {loading && !items.length ? <div className="credits-loading"><LoaderCircle className="spin" /> Carregando...</div> : items.length ? items.map((item) => <article key={item.id} className={!item.visible ? "hidden" : ""}>
        <span className="admin-area-swatch" style={{borderColor:COLOR_HEX[item.color], background:`color-mix(in srgb, ${COLOR_HEX[item.color]} ${100-item.transparency}%, transparent)`}} />
        <div><b>{item.name}</b><small>{COLOR_LABEL[item.color]} · transparência {item.transparency}% · {item.points.length} pontos</small><p>{item.description || "Sem observação."}</p></div>
        <div className="admin-official-item-actions"><button type="button" onClick={() => void toggleVisibility(item)} title={item.visible ? "Ocultar" : "Mostrar"}>{item.visible ? <Eye /> : <EyeOff />}</button><button type="button" onClick={() => beginEdit(item)} title="Editar"><Pencil /></button><button type="button" className="danger" onClick={() => void remove(item)} disabled={deletingId===item.id} title="Apagar — somente Super Admin">{deletingId===item.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button></div>
      </article>) : <div className="admin-official-empty"><MapPinned /><span>Nenhuma área oficial desenhada ainda. Abra o AIS e use ÁREA ADMIN.</span></div>}
    </div>
  </section>;
}
