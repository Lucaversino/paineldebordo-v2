"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, BrainCircuit, CheckCircle2, CircleDollarSign, Coins, ExternalLink, LoaderCircle, PlusCircle, Power, PowerOff, RefreshCw, Save, Search, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import AdminOfficialWaypoints from "./AdminOfficialWaypoints";
import AdminOfficialAreas from "./AdminOfficialAreas";
import AdminFreeVessels from "./AdminFreeVessels";

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}
function usd(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(value || 0);
}
function integer(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value || 0);
}
function shortDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function AdminBillingPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [health, setHealth] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [openAiReport, setOpenAiReport] = useState<any>(null);
  const [openAiLoading, setOpenAiLoading] = useState(false);
  const [openAiError, setOpenAiError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [creditBusy, setCreditBusy] = useState("");
  const [aiBusy, setAiBusy] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>({});
  const [creditNotes, setCreditNotes] = useState<Record<string, string>>({});

  const adminFetch = async (url: string, init: RequestInit = {}) => {
    const makeRequest = async (token?: string | null) => {
      const headers = new Headers(init.headers || {});
      if (token) headers.set("authorization", `Bearer ${token}`);
      const isWrite = String(init.method || "GET").toUpperCase() !== "GET";
      return fetch(url, {
        ...init,
        headers,
        credentials: "include",
        cache: "no-store",
        signal: init.signal || AbortSignal.timeout(isWrite ? 25_000 : 15_000),
      });
    };

    const { data: sessionData } = await supabase.auth.getSession();
    let response = await makeRequest(sessionData.session?.access_token || null);
    if (response.status !== 401) return response;

    const { data: refreshed } = await supabase.auth.refreshSession();
    const token = refreshed.session?.access_token;
    if (!token) return response;
    return makeRequest(token);
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const response = await adminFetch("/api/billing/admin?section=users");
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result?.error || "Não foi possível carregar os usuários.");
      setData((current: any) => ({ ...(current || {}), users: Array.isArray(result.users) ? result.users : [] }));
    } catch (cause) {
      const message = cause instanceof DOMException && cause.name === "TimeoutError"
        ? "A lista de usuários demorou demais para responder. Use Atualizar usuários para tentar novamente."
        : cause instanceof Error ? cause.message : "Falha ao carregar os usuários.";
      setUsersError(message);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadOpenAiReport = async () => {
    setOpenAiLoading(true);
    setOpenAiError("");
    try {
      const response = await adminFetch("/api/billing/admin/openai");
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result?.error || "Não foi possível carregar o relatório OpenAI.");
      setOpenAiReport(result);
    } catch (cause) {
      setOpenAiError(cause instanceof Error ? cause.message : "Falha ao carregar o relatório OpenAI.");
    } finally {
      setOpenAiLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminFetch("/api/billing/admin?section=overview");
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result?.error || "Acesso administrativo indisponível.");
      setData({ settings: result.settings, stats: result.stats, users: [] });
      void loadUsers();
      void loadOpenAiReport();
    } catch (cause) {
      const message = cause instanceof DOMException && cause.name === "TimeoutError"
        ? "O painel administrativo demorou mais de 15 segundos para responder. A conexão com o banco/API foi interrompida para não ficar carregando infinito."
        : cause instanceof Error ? cause.message : "Falha ao carregar o painel administrativo.";
      setError(message);
    } finally {
      setLoading(false);
    }
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
    try {
      const response = await adminFetch("/api/billing/admin", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result?.error || "Não foi possível salvar.");
      setData((current: any) => ({ ...(current || {}), settings: result.settings, stats: result.stats || current?.stats }));
      setSuccess("Configurações salvas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFishAi(user: any) {
    setAiBusy(user.userId);
    setError("");
    setSuccess("");
    try {
      const nextEnabled = user.fishAiEnabled === false;
      const response = await adminFetch("/api/billing/admin/fish-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.userId, enabled: nextEnabled }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result?.error || "Não foi possível alterar a FISH IA.");
      setData((current: any) => ({
        ...current,
        users: (current?.users || []).map((item: any) => item.userId === user.userId ? { ...item, fishAiEnabled: result.fishAiEnabled } : item),
      }));
      setSuccess(`FISH IA ${result.fishAiEnabled ? "ligada" : "desligada"} para ${user.email || "o usuário"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao alterar a FISH IA.");
    } finally {
      setAiBusy("");
    }
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
      setData((current: any) => ({
        ...current,
        stats: result.stats || current?.stats,
        users: (current?.users || []).map((item: any) => item.userId === user.userId ? { ...item, balance: result.balance } : item),
      }));
      setCreditAmounts((current) => ({ ...current, [user.userId]: "" }));
      setCreditNotes((current) => ({ ...current, [user.userId]: "" }));
      setSuccess(`+${amount} créditos adicionados para ${user.email || "o usuário"}. Saldo atual: ${result.balance}.`);
    } catch {
      setError("Falha de rede ao adicionar créditos.");
    } finally {
      setCreditBusy("");
    }
  }

  if (!data && loading) {
    return <section className="admin-billing-page"><div className="credits-loading"><LoaderCircle className="spin" /> Carregando administração...</div></section>;
  }

  if (!data) {
    return <section className="admin-billing-page">
      <div className="credits-error">{error || "Não foi possível carregar a administração."}</div>
      <button type="button" className="primary" onClick={() => void load()}><RefreshCw /> Tentar novamente</button>
    </section>;
  }

  const s = data.settings;
  const x = data.stats;
  const users = (Array.isArray(data.users) ? data.users : []).filter((item: any) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return String(item.email || "").toLowerCase().includes(q) || String(item.userId || "").toLowerCase().includes(q);
  });

  return <section className="admin-billing-page">
    <div className="credits-head"><div><small>SUPER ADMIN</small><h2>AIS, FISH IA e Créditos</h2><p>Gerencie créditos do AIS e controle o acesso à FISH IA de cada usuário.</p></div><ShieldCheck /></div>

    {success && <div className="admin-success"><CheckCircle2 /> {success}</div>}
    {error && <div className="credits-error">{error}</div>}

    <div className="admin-service-stats">
      <article><h3>Diagnóstico das APIs</h3><p>Teste a conexão real da Data Docked, OpenAI e banco usados pelo sistema.</p><button type="button" className="primary" onClick={testProviders} disabled={healthLoading}>{healthLoading ? <LoaderCircle className="spin" /> : <Activity />} Testar APIs agora</button></article>
      {health && <><article><h3>Data Docked</h3><p>Status: <b>{health.datadocked?.ok ? "ONLINE" : "ERRO"}</b></p><p>Créditos do provedor: <b>{health.datadocked?.ok ? health.datadocked.credits : "—"}</b></p>{!health.datadocked?.ok && <p>{health.datadocked?.error}</p>}</article><article><h3>OpenAI</h3><p>Status: <b>{health.openai?.ok ? "CHAVE/MODELO OK" : "ERRO"}</b></p><p>Modelo: <b>{health.openai?.model || "—"}</b></p>{!health.openai?.ok && <p>{health.openai?.error}</p>}</article><article><h3>Banco</h3><p>Status: <b>{health.database?.ok ? "ONLINE" : "ERRO"}</b></p>{!health.database?.ok && <p>{health.database?.error}</p>}</article></>}
    </div>

    <section className="admin-openai-report">
      <div className="admin-openai-head">
        <div><small>OPENAI API · RELATÓRIO FINANCEIRO</small><h3>Consumo, tokens e custos</h3><p>Resumo do uso da FISH IA e, com Admin API Key, valores oficiais da organização OpenAI.</p></div>
        <button type="button" onClick={() => void loadOpenAiReport()} disabled={openAiLoading}>{openAiLoading ? <LoaderCircle className="spin" /> : <RefreshCw />} Atualizar OpenAI</button>
      </div>

      {openAiError && <div className="credits-error">{openAiError}</div>}
      {openAiLoading && !openAiReport ? <div className="credits-loading"><LoaderCircle className="spin" /> Carregando consumo da OpenAI...</div> : openAiReport && (() => {
        const live = openAiReport.live || {};
        const local = openAiReport.local || {};
        const ls = local.summary || {};
        const hasLive = Boolean(live.configured && live.ok);
        const todayCost = hasLive ? usd(live.todayCostUsd) : brl(ls.todayCostBrl);
        const monthCost = hasLive ? usd(live.monthCostUsd) : brl(ls.monthCostBrl);
        const todayTokens = hasLive ? live.todayTokens : ls.todayTokens;
        const monthTokens = hasLive ? live.monthTokens : ls.monthTokens;
        return <>
          <div className={`admin-openai-status ${hasLive ? "live" : "local"}`}>
            <BrainCircuit />
            <div><b>{hasLive ? "DADOS OFICIAIS OPENAI CONECTADOS" : "MODO LOCAL DO PAINEL"}</b><span>{hasLive ? "Custos oficiais em USD · dados da OpenAI em UTC." : (live.error || "Custo calculado pelos registros internos da FISH IA.")}</span></div>
          </div>

          <div className="admin-openai-kpis">
            <article className="today"><CircleDollarSign /><span><small>GASTO HOJE</small><b>{todayCost}</b><em>{hasLive ? "Oficial OpenAI · UTC" : "Estimativa interna · Brasil"}</em></span></article>
            <article><BarChart3 /><span><small>GASTO NO MÊS</small><b>{monthCost}</b><em>{hasLive ? "Organização OpenAI" : "Registros da FISH IA"}</em></span></article>
            <article className="remaining"><Coins /><span><small>DISPONÍVEL ATÉ O LIMITE</small><b>{hasLive && live.remainingToLimitUsd != null ? usd(live.remainingToLimitUsd) : "—"}</b><em>{hasLive && live.spendLimitUsd != null ? `Limite mensal: ${usd(live.spendLimitUsd)}` : "Nenhum limite mensal legível pela API"}</em></span></article>
            <article><Activity /><span><small>TOKENS HOJE</small><b>{integer(todayTokens)}</b><em>Mês: {integer(monthTokens)}</em></span></article>
          </div>

          <div className="admin-openai-secondary">
            <article><small>REQUISIÇÕES HOJE</small><b>{integer(hasLive ? live.todayRequests : ls.todayRequests)}</b><span>Erros locais hoje: {integer(ls.todayErrors)}</span></article>
            <article><small>ENTRADA HOJE</small><b>{integer(hasLive ? live.todayInputTokens : ls.todayInputTokens)}</b><span>tokens</span></article>
            <article><small>SAÍDA HOJE</small><b>{integer(hasLive ? live.todayOutputTokens : ls.todayOutputTokens)}</b><span>tokens</span></article>
            <article><small>ÚLTIMOS 7 DIAS</small><b>{hasLive ? usd(live.weekCostUsd) : brl(ls.weekCostBrl)}</b><span>{integer(ls.weekRequests)} chamadas registradas</span></article>
          </div>

          <div className="admin-openai-columns">
            <article className="admin-openai-table-card">
              <div className="admin-openai-card-head"><div><small>HISTÓRICO LOCAL</small><h4>Últimos dias da FISH IA</h4></div><span>Horário do Brasil</span></div>
              <div className="admin-openai-table">
                <div className="head"><span>Dia</span><span>Chamadas</span><span>Tokens</span><span>Custo est.</span></div>
                {(local.daily || []).slice(0, 10).map((item: any) => <div key={item.day}><span>{shortDate(item.day)}</span><span>{integer(item.requests)}</span><span>{integer(item.totalTokens)}</span><span>{brl(item.costBrl)}</span></div>)}
                {!(local.daily || []).length && <p>Nenhum uso registrado ainda.</p>}
              </div>
            </article>

            <article className="admin-openai-table-card">
              <div className="admin-openai-card-head"><div><small>MODELOS</small><h4>Consumo por modelo</h4></div><span>{hasLive ? "OpenAI · mês atual" : "Painel · 30 dias"}</span></div>
              <div className="admin-openai-models">
                {(hasLive ? live.models : local.models || []).slice(0, 8).map((item: any) => <div key={item.model}><span><b>{item.model}</b><small>{integer(item.requests)} requisições</small></span><strong>{integer(item.totalTokens)} tokens</strong></div>)}
                {!(hasLive ? live.models : local.models || []).length && <p>Nenhum modelo registrado.</p>}
              </div>
            </article>
          </div>

          {hasLive && (live.lineItems || []).length > 0 && <article className="admin-openai-lineitems">
            <div className="admin-openai-card-head"><div><small>FATURAMENTO OPENAI</small><h4>Custos do mês por categoria</h4></div><span>USD</span></div>
            <div>{live.lineItems.slice(0, 10).map((item: any) => <p key={item.name}><span>{item.name}</span><b>{usd(item.costUsd)}</b></p>)}</div>
          </article>}

          <div className="admin-openai-credit-note">
            <Coins />
            <div><b>SALDO PRÉ-PAGO DA OPENAI</b><p>{openAiReport.prepaidBalance?.message}</p></div>
            <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer">Abrir Billing OpenAI <ExternalLink /></a>
          </div>

          {!live.configured && <div className="admin-openai-admin-key">
            <b>Para ativar os valores oficiais:</b>
            <span>adicione <code>OPENAI_ADMIN_KEY</code> nas variáveis de ambiente da Vercel. A chave comum <code>OPENAI_API_KEY</code> continua sendo usada normalmente pela FISH IA.</span>
          </div>}
        </>;
      })()}
    </section>

    <div className="admin-kpis">
      <article><small>Créditos vendidos</small><b>{x.creditsSold}</b></article>
      <article><small>Créditos manuais</small><b>{x.manualCreditsGranted || 0}</b></article>
      <article><small>Créditos utilizados</small><b>{x.creditsUsed}</b></article>
      <article><small>Nas carteiras</small><b>{x.creditsInWallets}</b></article>
      <article><small>FISH IA</small><b>Controle individual</b></article>
      <article><small>Receita confirmada</small><b>{brl(x.revenue)}</b></article>
      <article><small>Custo AIS estimado</small><b>{brl(x.ais.cost)}</b></article>
      <article><small>Custo OpenAI estimado</small><b>{brl(x.ai.cost)}</b></article>
      <article><small>Custo total</small><b>{brl(x.totalCost)}</b></article>
      <article><small>Resultado bruto</small><b>{brl(x.grossResult)}</b></article>
      <article><small>Margem estimada</small><b>{x.estimatedMarginPct == null ? "—" : `${x.estimatedMarginPct.toFixed(1)}%`}</b></article>
      <article><small>Usuários com carteira</small><b>{x.users || 0}</b></article>
    </div>

    <div className="admin-service-stats"><article><h3>AIS</h3><p>Consultas: <b>{x.ais.queries}</b></p><p>Barcos pesquisados: <b>{x.ais.vessels}</b></p><p>Créditos: <b>{x.ais.credits}</b></p><p>Chamadas API: <b>{x.ais.providerCalls}</b></p><p>Cache: <b>{x.ais.cacheHits}</b></p></article><article><h3>FISH IA</h3><p>Conversas: <b>{x.ai.queries}</b></p><p>Tokens: <b>{x.ai.tokens}</b></p><p>Custo estimado da API: <b>{brl(x.ai.cost)}</b></p></article></div>

    <section className="admin-credit-manager">
      <div className="admin-credit-manager-head"><div><small>GESTÃO MANUAL</small><h3>Créditos dos usuários</h3><p>Escolha um usuário e adicione créditos diretamente na carteira.</p></div><div className="admin-credit-manager-actions"><button type="button" onClick={() => void loadUsers()} disabled={usersLoading}>{usersLoading ? <LoaderCircle className="spin" /> : <RefreshCw />} Atualizar usuários</button><WalletCards /></div></div>
      {usersError && <div className="credits-error">{usersError}</div>}
      <label className="admin-user-search"><Search /><input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Buscar por e-mail ou ID do usuário" /></label>
      <div className="admin-user-credit-list">
        {usersLoading && !users.length ? <div className="credits-loading"><LoaderCircle className="spin" /> Carregando usuários...</div> : users.length ? users.map((user: any) => <article key={user.userId} className="admin-user-credit-card">
          <div className="admin-user-identity"><div className="admin-user-avatar"><UserRound /></div><div><b>{user.email || "Sem e-mail"}</b><small>{user.role === "super_admin" ? "ADMINISTRADOR" : "USUÁRIO"} · {user.userId}</small></div><strong>{user.balance} créditos</strong></div>
          <div className="admin-user-ai-control"><span>FISH IA</span><button type="button" className={`admin-fish-toggle ${user.fishAiEnabled === false ? "off" : "on"}`} disabled={aiBusy === user.userId} onClick={() => void toggleFishAi(user)}>{aiBusy === user.userId ? <LoaderCircle className="spin" /> : user.fishAiEnabled === false ? <PowerOff /> : <Power />}{user.fishAiEnabled === false ? "DESLIGADA" : "LIGADA"}</button></div>
          <div className="admin-credit-quick"><span>Rápido:</span>{[10, 20, 50, 100].map((value) => <button key={value} type="button" disabled={creditBusy === user.userId} onClick={() => void grantCredits(user, value)}>+{value}</button>)}</div>
          <div className="admin-credit-form-row"><input type="number" min="1" max="100000" step="1" value={creditAmounts[user.userId] || ""} onChange={(e) => setCreditAmounts((current) => ({ ...current, [user.userId]: e.target.value }))} placeholder="Quantidade de créditos" /><input value={creditNotes[user.userId] || ""} onChange={(e) => setCreditNotes((current) => ({ ...current, [user.userId]: e.target.value }))} maxLength={160} placeholder="Observação (opcional)" /><button type="button" className="primary" disabled={creditBusy === user.userId} onClick={() => void grantCredits(user)}>{creditBusy === user.userId ? <LoaderCircle className="spin" /> : <PlusCircle />} Adicionar</button></div>
        </article>) : <div className="admin-no-users">Nenhum usuário encontrado.</div>}
      </div>
    </section>


    <AdminFreeVessels />
    <AdminOfficialWaypoints />
    <AdminOfficialAreas />

    <form className="admin-settings-form" onSubmit={submit}>
      <h3>Configurações administrativas <small>• FISH IA</small></h3>
      <div className="admin-settings-grid">
        <label>Valor de 1 crédito (R$)<input name="CREDIT_UNIT_PRICE" type="number" min="0.01" step="0.01" defaultValue={s.CREDIT_UNIT_PRICE}/></label>
        <label>Consulta AIS (créditos)<input name="AIS_SINGLE_QUERY_CREDITS" type="number" min="0" step="1" defaultValue={s.AIS_SINGLE_QUERY_CREDITS}/></label>
        <label>Atualizar posição AIS (créditos)<input name="AIS_UPDATE_CREDITS" type="number" min="0" step="1" defaultValue={s.AIS_UPDATE_CREDITS}/></label>
        <label>Busca AIS por área 50 km (créditos)<input name="AIS_AREA_QUERY_CREDITS" type="number" min="0" step="1" defaultValue={s.AIS_AREA_QUERY_CREDITS}/></label>
        
        
        
        
        <label>Cache AIS (minutos)<input name="AIS_CACHE_MINUTES" type="number" min="0" step="1" defaultValue={s.AIS_CACHE_MINUTES}/></label>
        <label>Custo interno AIS / chamada (R$)<input name="AIS_PROVIDER_COST_PER_QUERY_BRL" type="number" min="0" step="0.0001" defaultValue={s.AIS_PROVIDER_COST_PER_QUERY_BRL}/></label>
        <label>OpenAI input / 1M tokens (R$)<input name="OPENAI_INPUT_COST_PER_1M" type="number" min="0" step="0.01" defaultValue={s.OPENAI_INPUT_COST_PER_1M}/></label>
        <label>OpenAI output / 1M tokens (R$)<input name="OPENAI_OUTPUT_COST_PER_1M" type="number" min="0" step="0.01" defaultValue={s.OPENAI_OUTPUT_COST_PER_1M}/></label>
      </div>
      <button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />} Salvar configurações</button>
    </form>
  </section>;
}
