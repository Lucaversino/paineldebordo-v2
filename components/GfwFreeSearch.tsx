"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GfwVessel } from "../lib/gfw";
import styles from "./GfwFreeSearch.module.css";
type Props = { children: ReactNode; request: (url: string, init?: RequestInit) => Promise<Response>; locate: (vessel: GfwVessel) => void; locating: boolean };
export default function GfwFreeSearch({ children, request, locate, locating }: Props) {
  const [tab, setTab] = useState("gfw");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [rows, setRows] = useState<GfwVessel[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function search(more = false) {
    if (controller.current) return;
    const q = more ? searched : query.trim();
    if (q.length < 3) { setError("Digite pelo menos 3 caracteres."); setOpen(true); return; }
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 16000);
    setBusy(true); setError(""); setOpen(true);
    if (!more) { setRows([]); setSince(null); setSearched(q); }
    try {
      const response = await request(`/api/ais-gfw?q=${encodeURIComponent(q)}${more && since ? `&since=${encodeURIComponent(since)}` : ""}`, { signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha na pesquisa.");
      setRows(previous => more ? [...previous, ...data.vessels] : data.vessels);
      setSince(data.since || null);
    } catch (err) { setError(err instanceof Error && err.name !== "AbortError" ? err.message : "A pesquisa demorou para responder. Tente novamente."); }
    finally { clearTimeout(timer); controller.current = null; setBusy(false); }
  }
  return <>
    <div className={styles.tabs} aria-label="Fontes de pesquisa FREE">
      <button type="button" aria-pressed={tab === "gfw"} onClick={() => setTab("gfw")}>Global Fishing Watch · FREE</button>
      <button type="button" aria-pressed={tab === "other"} onClick={() => setTab("other")}>Outras fontes</button>
    </div>
    <div hidden={tab !== "other"}>{children}</div>
    <div hidden={tab !== "gfw"}>
      <form className="ais-v138-free-form" onSubmit={e => { e.preventDefault(); void search(); }}>
        <input aria-label="Pesquisar no Global Fishing Watch" placeholder="Nome, MMSI, IMO ou indicativo" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? "BUSCANDO…" : "BUSCAR"}</button>
      </form>
      {open && <section className={styles.results} aria-live="polite">
        <header><b>Pesquisa de embarcações</b><button type="button" onClick={() => setOpen(false)} aria-label="Fechar resultados">×</button></header>
        <p>Cadastro e histórico de identidade. Esta pesquisa não fornece posição atual.</p>
        {error && <p role="alert">{error}</p>}
        {!busy && !error && !rows.length && <p>Nenhum barco encontrado para “{searched}”. Tente o MMSI ou outro nome.</p>}
        {rows.map((row, i) => <article key={`${row.id}-${i}`}>
          <b>{row.name || "Embarcação sem nome"}</b>
          <span>MMSI {row.mmsi || "—"} · IMO {row.imo || "—"}</span>
          <span>Bandeira {row.flag || "—"} · Indicativo {row.callsign || "—"}</span>
          {row.recordTo && <small>Fim do período de identidade: {row.recordTo.slice(0, 10)} (não é posição)</small>}
          <button type="button" disabled={!row.mmsi || locating} onClick={() => { locate(row); setTab("other"); }}>Consultar posição nas fontes FREE</button>
        </article>)}
        {since && <button type="button" disabled={busy} onClick={() => void search(true)}>{busy ? "Carregando…" : "Carregar mais"}</button>}
        <footer>Fonte: <a href="https://globalfishingwatch.org/" target="_blank" rel="noopener noreferrer">Global Fishing Watch</a> · Sem cobrança de créditos</footer>
      </section>}
    </div>
  </>;
}
