"use client";

import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, Save, ShieldCheck } from "lucide-react";

function brl(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0); }

export default function AdminBillingPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = async () => {
    const response = await fetch("/api/billing/admin", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result?.error || "Acesso administrativo indisponível."); return; }
    setData(result);
  };
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const fd = new FormData(event.currentTarget); const settings: Record<string,string> = {};
    fd.forEach((value,key) => settings[key] = String(value));
    const response = await fetch("/api/billing/admin", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings }) });
    const result = await response.json().catch(() => ({})); setSaving(false);
    if (!response.ok) { setError(result?.error || "Não foi possível salvar."); return; }
    setData(result);
  }
  if (!data) return <section className="admin-billing-page"><div className="credits-loading"><LoaderCircle className="spin" /> Carregando administração...</div>{error && <div className="credits-error">{error}</div>}</section>;
  const s=data.settings, x=data.stats;
  return <section className="admin-billing-page">
    <div className="credits-head"><div><small>SUPER ADMIN</small><h2>AIS, IA e Créditos</h2><p>Preços, consumo, custos e resultado do sistema.</p></div><ShieldCheck /></div>
    <div className="admin-kpis"><article><small>Créditos vendidos</small><b>{x.creditsSold}</b></article><article><small>Créditos utilizados</small><b>{x.creditsUsed}</b></article><article><small>Nas carteiras</small><b>{x.creditsInWallets}</b></article><article><small>Bônus IA disponível</small><b>{brl(x.aiBonusOutstandingBrl || 0)}</b></article><article><small>Receita confirmada</small><b>{brl(x.revenue)}</b></article><article><small>Custo AIS estimado</small><b>{brl(x.ais.cost)}</b></article><article><small>Custo OpenAI estimado</small><b>{brl(x.ai.cost)}</b></article><article><small>Custo total</small><b>{brl(x.totalCost)}</b></article><article><small>Resultado bruto</small><b>{brl(x.grossResult)}</b></article><article><small>Margem estimada</small><b>{x.estimatedMarginPct == null ? "—" : `${x.estimatedMarginPct.toFixed(1)}%`}</b></article></div>
    <div className="admin-service-stats"><article><h3>AIS</h3><p>Consultas: <b>{x.ais.queries}</b></p><p>Barcos pesquisados: <b>{x.ais.vessels}</b></p><p>Créditos: <b>{x.ais.credits}</b></p><p>Chamadas API: <b>{x.ais.providerCalls}</b></p><p>Cache: <b>{x.ais.cacheHits}</b></p></article><article><h3>IA</h3><p>Solicitações: <b>{x.ai.queries}</b></p><p>Perguntas simples: <b>{x.ai.basic}</b></p><p>Análises completas: <b>{x.ai.full}</b></p><p>Análises avançadas: <b>{x.ai.advanced}</b></p><p>Créditos: <b>{x.ai.credits}</b></p><p>Tokens: <b>{x.ai.tokens}</b></p><p>Custo estimado: <b>{brl(x.ai.cost)}</b></p></article></div>
    <form className="admin-settings-form" onSubmit={submit}>
      <h3>Configurações administrativas</h3>
      <div className="admin-settings-grid">
        <label>Valor de 1 crédito (R$)<input name="CREDIT_UNIT_PRICE" type="number" min="0.01" step="0.01" defaultValue={s.CREDIT_UNIT_PRICE}/></label>
        <label>Consulta AIS (créditos)<input name="AIS_SINGLE_QUERY_CREDITS" type="number" min="0" step="1" defaultValue={s.AIS_SINGLE_QUERY_CREDITS}/></label>
        <label>Atualizar posição AIS (créditos)<input name="AIS_UPDATE_CREDITS" type="number" min="0" step="1" defaultValue={s.AIS_UPDATE_CREDITS}/></label>
        <label>Busca AIS por área 50 km (créditos)<input name="AIS_AREA_QUERY_CREDITS" type="number" min="0" step="1" defaultValue={s.AIS_AREA_QUERY_CREDITS}/></label>
        <label>Bônus inicial IA por novo usuário (R$)<input name="AI_WELCOME_BONUS_BRL" type="number" min="0" step="0.01" defaultValue={s.AI_WELCOME_BONUS_BRL ?? 2}/></label><label>Pergunta IA (créditos)<input name="AI_BASIC_QUERY_CREDITS" type="number" min="0" step="1" defaultValue={s.AI_BASIC_QUERY_CREDITS}/></label>
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
      <button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <Save/>} Salvar configurações</button>
    </form>{error && <div className="credits-error">{error}</div>}
  </section>;
}
