"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, LoaderCircle, PlusCircle, Save, Search, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export default function AdminBillingPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [creditBusy, setCreditBusy] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>({});
  const [creditNotes, setCreditNotes] = useState<Record<string, string>>({});

  const adminFetch = async (url: string, init: RequestInit = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const headers = new Headers(init.headers || {});
    const token = sessionData.session?.access_token;
    if (token) headers.set("authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers, credentials: "include", cache: "no-store" });
  };

  const load = async () => {
    const response = await adminFetch("/api/billing/admin");
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result?.error || "Acesso administrativo indisponível.");
      return;
    }
    setData(result);
  };

  useEffect(() => { void load(); }, []);

  const testProviders = async () => {
    setHealthLoading(true);
    setError("");
    try {
      const response = await adminFetch("/api/provider-health");
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result?.error || "Não foi possível testar as APIs.");
        return;
      }
      setHealth(result);
    } catch {
      setError("Falha de rede no diagnóstico das APIs.");
    } finally {
      setHealthLoading(false);
    }
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const fd = new FormData(event.currentTarget);
    const settings: Record<string, string> = {};
    fd.forEach((value, key) => settings[key] = String(value));
    const response = await adminFetch("/api/billing/admin", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(result?.error || "Não foi possível salvar.");
      return;
    }
    setData(result);
    setSuccess("Configurações salvas.");
  }

  async function grantCredits(user: any, quickAmount?: number) {
    const amount = Math.round(Number(quickAmount ?? creditAmounts[user.userId] ?? 0));
    if (!Number.isFinite(amount) || amount < 1) {
      setError("Informe uma quantidade de créditos maior que zero.");
      return;
    }
    setCreditBusy(user.userId);
    setError("");
    setSuccess("");
    try {
      const response = await adminFetch("/api/billing/admin/credits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.userId, credits: amount, note: creditNotes[user.userId] || "" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result?.error || "Não foi possível adicionar os créditos.");
        return;
      }
      setData((current: any) => ({ ...current, stats: result.stats, users: result.users }));
      setCreditAmounts((current) => ({ ...current, [user.userId]: "" }));
      setCreditNotes((current) => ({ ...current, [user.userId]: "" }));
      setSuccess(`+${amount} créditos adicionados para ${user.email || "o usuário"}. Saldo atual: ${result.balance}.`);
    } catch {
      setError("Falha de rede ao adicionar créditos.");
    } finally {
      setCreditBusy("");
    }
  }

  if (!data) {
    return <section className="admin-billing-page"><div className="credits-loading"><LoaderCircle className="spin" /> Carregando administração...</div>{error && <div className="credits-error">{error}</div>}</section>;
  }

  const s = data.settings;
  const x = data.stats;
  const users = (Array.isArray(data.users) ? data.users : []).filter((item: any) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return String(item.email || "").toLowerCase().includes(q) || String(item.userId || "").toLowerCase().includes(q);
  });

  return <section className="admin-billing-page">
    <div className="credits-head"><div><small>SUPER ADMIN</small><h2>AIS, IA e Créditos</h2><p>Gerencie preços, consumo e créditos dos usuários.</p></div><ShieldCheck /></div>

    {success && <div className="admin-success"><CheckCircle2 /> {success}</div>}
    {error && <div className="credits-error">{error}</div>}

    <div className="admin-service-stats">
      <article><h3>Diagnóstico das APIs</h3><p>Teste sem consumir crédito do Painel. A consulta de saldo da Data Docked não consome crédito do provedor.</p><button type="button" className="primary" onClick={testProviders} disabled={healthLoading}>{healthLoading ? <LoaderCircle className="spin" /> : <Activity />} Testar APIs agora</button></article>
      {health && <><article><h3>Data Docked</h3><p>Status: <b>{health.datadocked?.ok ? "ONLINE" : "ERRO"}</b></p><p>Créditos do provedor: <b>{health.datadocked?.ok ? health.datadocked.credits : "—"}</b></p>{!health.datadocked?.ok && <p>{health.datadocked?.error}</p>}</article><article><h3>OpenAI</h3><p>Status: <b>{health.openai?.ok ? "CHAVE/MODELO OK" : "ERRO"}</b></p><p>Modelo: <b>{health.openai?.model || "—"}</b></p>{!health.openai?.ok && <p>{health.openai?.error}</p>}</article><article><h3>Banco</h3><p>Status: <b>{health.database?.ok ? "ONLINE" : "ERRO"}</b></p>{!health.database?.ok && <p>{health.database?.error}</p>}</article></>}
    </div>

    <div className="admin-kpis">
      <article><small>Créditos vendidos</small><b>{x.creditsSold}</b></article>
      <article><small>Créditos manuais</small><b>{x.manualCreditsGranted || 0}</b></article>
      <article><small>Créditos utilizados</small><b>{x.creditsUsed}</b></article>
      <article><small>Nas carteiras</small><b>{x.creditsInWallets}</b></article>
      <article><small>Bônus IA disponível</small><b>{brl(x.aiBonusOutstandingBrl || 0)}</b></article>
      <article><small>Receita confirmada</small><b>{brl(x.revenue)}</b></article>
      <article><small>Custo AIS estimado</small><b>{brl(x.ais.cost)}</b></article>
      <article><small>Custo OpenAI estimado</small><b>{brl(x.ai.cost)}</b></article>
      <article><small>Custo total</small><b>{brl(x.totalCost)}</b></article>
      <article><small>Resultado bruto</small><b>{brl(x.grossResult)}</b></article>
      <article><small>Margem estimada</small><b>{x.estimatedMarginPct == null ? "—" : `${x.estimatedMarginPct.toFixed(1)}%`}</b></article>
      <article><small>Usuários com carteira</small><b>{x.users || 0}</b></article>
    </div>

    <div className="admin-service-stats"><article><h3>AIS</h3><p>Consultas: <b>{x.ais.queries}</b></p><p>Barcos pesquisados: <b>{x.ais.vessels}</b></p><p>Créditos: <b>{x.ais.credits}</b></p><p>Chamadas API: <b>{x.ais.providerCalls}</b></p><p>Cache: <b>{x.ais.cacheHits}</b></p></article><article><h3>IA</h3><p>Solicitações: <b>{x.ai.queries}</b></p><p>Perguntas simples: <b>{x.ai.basic}</b></p><p>Análises completas: <b>{x.ai.full}</b></p><p>Análises avançadas: <b>{x.ai.advanced}</b></p><p>Créditos: <b>{x.ai.credits}</b></p><p>Tokens: <b>{x.ai.tokens}</b></p><p>Custo estimado: <b>{brl(x.ai.cost)}</b></p></article></div>

    <section className="admin-credit-manager">
      <div className="admin-credit-manager-head"><div><small>GESTÃO MANUAL</small><h3>Créditos dos usuários</h3><p>Escolha um usuário e adicione créditos diretamente na carteira.</p></div><WalletCards /></div>
      <label className="admin-user-search"><Search /><input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Buscar por e-mail ou ID do usuário" /></label>
      <div className="admin-user-credit-list">
        {users.length ? users.map((user: any) => <article key={user.userId} className="admin-user-credit-card">
          <div className="admin-user-identity"><div className="admin-user-avatar"><UserRound /></div><div><b>{user.email || "Sem e-mail"}</b><small>{user.role === "super_admin" ? "ADMINISTRADOR" : "USUÁRIO"} · {user.userId}</small></div><strong>{user.balance} créditos</strong></div>
          <div className="admin-credit-quick"><span>Rápido:</span>{[10, 20, 50, 100].map((value) => <button key={value} type="button" disabled={creditBusy === user.userId} onClick={() => void grantCredits(user, value)}>+{value}</button>)}</div>
          <div className="admin-credit-form-row"><input type="number" min="1" max="100000" step="1" value={creditAmounts[user.userId] || ""} onChange={(e) => setCreditAmounts((current) => ({ ...current, [user.userId]: e.target.value }))} placeholder="Quantidade de créditos" /><input value={creditNotes[user.userId] || ""} onChange={(e) => setCreditNotes((current) => ({ ...current, [user.userId]: e.target.value }))} maxLength={160} placeholder="Observação (opcional)" /><button type="button" className="primary" disabled={creditBusy === user.userId} onClick={() => void grantCredits(user)}>{creditBusy === user.userId ? <LoaderCircle className="spin" /> : <PlusCircle />} Adicionar</button></div>
        </article>) : <div className="admin-no-users">Nenhum usuário encontrado.</div>}
      </div>
    </section>

    <form className="admin-settings-form" onSubmit={submit}>
      <h3>Configurações administrativas</h3>
      <div className="admin-settings-grid">
        <label>Valor de 1 crédito (R$)<input name="CREDIT_UNIT_PRICE" type="number" min="0.01" step="0.01" defaultValue={s.CREDIT_UNIT_PRICE}/></label>
        <label>Consulta AIS (créditos)<input name="AIS_SINGLE_QUERY_CREDITS" type="number" min="0" step="1" defaultValue={s.AIS_SINGLE_QUERY_CREDITS}/></label>
        <label>Atualizar posição AIS (créditos)<input name="AIS_UPDATE_CREDITS" type="number" min="0" step="1" defaultValue={s.AIS_UPDATE_CREDITS}/></label>
        <label>Busca AIS por área 50 km (créditos)<input name="AIS_AREA_QUERY_CREDITS" type="number" min="0" step="1" defaultValue={s.AIS_AREA_QUERY_CREDITS}/></label>
        <label>Bônus inicial IA por novo usuário (R$)<input name="AI_WELCOME_BONUS_BRL" type="number" min="0" step="0.01" defaultValue={s.AI_WELCOME_BONUS_BRL ?? 2}/></label>
        <label>Pergunta IA (créditos)<input name="AI_BASIC_QUERY_CREDITS" type="number" min="0" step="1" defaultValue={s.AI_BASIC_QUERY_CREDITS}/></label>
        <label>Análise completa (créditos)<input name="AI_FULL_ANALYSIS_CREDITS" type="number" min="0" step="1" defaultValue={s.AI_FULL_ANALYSIS_CREDITS}/></label>
        <label>Análise avançada (créditos)<input name="AI_ADVANCED_ANALYSIS_CREDITS" type="number" min="0" step="1" defaultValue={s.AI_ADVANCED_ANALYSIS_CREDITS}/></label>
        <label>Cache AIS (minutos)<input name="AIS_CACHE_MINUTES" type="number" min="0" step="1" defaultValue={s.AIS_CACHE_MINUTES}/></label>
        <label>Custo interno AIS / chamada (R$)<input name="AIS_PROVIDER_COST_PER_QUERY_BRL" type="number" min="0" step="0.0001" defaultValue={s.AIS_PROVIDER_COST_PER_QUERY_BRL}/></label>
        <label>OpenAI input / 1M tokens (R$)<input name="OPENAI_INPUT_COST_PER_1M" type="number" min="0" step="0.01" defaultValue={s.OPENAI_INPUT_COST_PER_1M}/></label>
        <label>OpenAI output / 1M tokens (R$)<input name="OPENAI_OUTPUT_COST_PER_1M" type="number" min="0" step="0.01" defaultValue={s.OPENAI_OUTPUT_COST_PER_1M}/></label>
        <label>Modelo IA simples<input name="AI_BASIC_MODEL" defaultValue={s.AI_BASIC_MODEL || ""} placeholder="vazio = OPENAI_MODEL"/></label>
        <label>Modelo IA completa<input name="AI_FULL_MODEL" defaultValue={s.AI_FULL_MODEL || ""} placeholder="vazio = OPENAI_MODEL"/></label>
        <label>Modelo IA avançada<input name="AI_ADVANCED_MODEL" defaultValue={s.AI_ADVANCED_MODEL || ""} placeholder="vazio = OPENAI_MODEL"/></label>
      </div>
      <button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />} Salvar configurações</button>
    </form>
  </section>;
}
