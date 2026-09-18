"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, LoaderCircle, MessageSquareText, Minimize2, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

type AssistantStatus = {
  configured: boolean;
  model: string;
  reasoningEffort?: string;
  connection?: { ok: boolean; status?: number; error?: string };
  free?: boolean;
};
type ChatMessage = { role: "user" | "assistant"; content: string; model?: string };
type AiMode = "basic" | "full" | "advanced";

const quickPrompts: Array<{ label: string; prompt: string; mode: AiMode }> = [
  { label: "Analisar viagem", mode: "full", prompt: "Faça uma análise profunda da viagem atual e diga o que mais chama atenção." },
  { label: "Comparar viagens", mode: "full", prompt: "Compare a viagem atual com as viagens finalizadas e encontre diferenças de rendimento." },
  { label: "Melhores condições", mode: "advanced", prompt: "Quais horários e profundidades tiveram melhor rendimento nas minhas largadas? Cruze também as condições ambientais disponíveis." },
  { label: "Próxima largada", mode: "advanced", prompt: "Cruze lua, vento, mar, temperatura e clorofila com meu histórico e diga o que observar na próxima largada." },
];

function modelLabel(model?: string) {
  if (!model) return "OpenAI";
  if (model === "gpt-5.6-sol" || model === "gpt-5.6") return "GPT-5.6 Sol";
  if (model === "gpt-5.6-terra") return "GPT-5.6 Terra";
  if (model === "gpt-5.6-luna") return "GPT-5.6 Luna";
  if (model === "gpt-6-astra") return "GPT-6 Astra";
  return model;
}
function restoreMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.sessionStorage.getItem("painel-ia-chat-v85") || window.sessionStorage.getItem("painel-ia-chat-v76") || window.sessionStorage.getItem("painel-ia-chat-v73") || window.sessionStorage.getItem("painel-ia-chat-v72");
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-18).filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").map((item) => ({ role: item.role, content: item.content, model: item.model }));
  } catch { return []; }
}

export default function FloatingPanelAssistant() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  async function aiFetch(input: string, init: RequestInit = {}) {
    const makeRequest = async (token?: string | null) => {
      const headers = new Headers(init.headers || {});
      if (token) headers.set("authorization", `Bearer ${token}`);
      const isPost = String(init.method || "GET").toUpperCase() === "POST";
      return fetch(input, {
        ...init,
        headers,
        credentials: "include",
        cache: "no-store",
        signal: init.signal || AbortSignal.timeout(isPost ? 65_000 : 12_000),
      });
    };

    const { data: sessionData } = await supabase.auth.getSession();
    let response = await makeRequest(sessionData.session?.access_token || null);
    if (response.status !== 401) return response;
    const { data: refreshed } = await supabase.auth.refreshSession();
    const token = refreshed.session?.access_token;
    if (!token) return response;
    return makeRequest(token);
  }

  const [open, setOpen] = useState(false);
  const [assistant, setAssistant] = useState<AssistantStatus | null>(null);
  const [checkingApi, setCheckingApi] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(restoreMessages);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [oceanContext, setOceanContext] = useState<any>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const loadStatus = async () => {
    setCheckingApi(true);
    try {
      const response = await aiFetch("/api/ai-assistant");
      const status = await response.json().catch(() => null);
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (status) setAssistant(status);
    } catch {
      setAssistant((current) => current ? ({ ...current, connection: { ok: false, error: "Não foi possível testar a API." } }) : null);
    } finally {
      setCheckingApi(false);
    }
  };

  useEffect(() => { if (open && !assistant) void loadStatus(); }, [open, assistant]);
  useEffect(() => { try { window.sessionStorage.setItem("painel-ia-chat-v85", JSON.stringify(messages.slice(-18))); } catch {} }, [messages]);
  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "end" });
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    if (!oceanContext) fetch("/api/ocean-intelligence", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((r) => r && setOceanContext(r)).catch(() => null);
    return () => window.clearTimeout(timer);
  }, [open, oceanContext]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, asking, open]);
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, []);

  const statusText = useMemo(() => {
    if (checkingApi) return "Testando conexão OpenAI…";
    if (!assistant) return "Verificando IA";
    if (!assistant.configured) return "OPENAI_API_KEY não configurada";
    if (assistant.connection && !assistant.connection.ok) return "API com erro";
    if (assistant.connection?.ok) return `API CONECTADA • ${modelLabel(assistant.model)}`;
    return `${modelLabel(assistant.model)} • ${assistant.reasoningEffort || "high"}`;
  }, [assistant, checkingApi]);

  const ask = async (preset?: string, mode: AiMode = "basic") => {
    const text = String(preset ?? question).trim();
    if (!text || asking) return;
    setQuestion(""); setError("");
    const previous = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setAsking(true);
    try {
      const response = await aiFetch("/api/ai-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, mode, conversation: previous, environment: oceanContext?.environment || null, statisticalAnalysis: oceanContext?.analysis || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result?.error || "A IA não conseguiu responder agora.");
      setMessages((current) => [...current, { role: "assistant", content: String(result.answer || ""), model: result.model }]);
    } catch (cause) {
      const message = cause instanceof DOMException && cause.name === "TimeoutError"
        ? "A análise demorou mais que o esperado. Tente novamente. A IA é grátis e nenhum crédito foi consumido."
        : cause instanceof Error ? cause.message : "Falha ao consultar a IA.";
      setError(message);
    } finally { setAsking(false); }
  };

  const clearConversation = () => { setMessages([]); setQuestion(""); setError(""); try { ["painel-ia-chat-v85","painel-ia-chat-v76","painel-ia-chat-v73","painel-ia-chat-v72"].forEach((k) => sessionStorage.removeItem(k)); } catch {} };

  return <div className={open ? "floating-ai open" : "floating-ai"}>
    {open && <section className="floating-ai-panel" aria-label="Assistente do Painel de Bordo">
      <header className="floating-ai-head">
        <div className="floating-ai-brand"><span><Sparkles /></span><div><small>PAINEL IA • V52</small><b>Assistente de pesca</b><em className={assistant?.connection?.ok ? "ready" : ""}>{statusText}</em></div></div>
        <div className="floating-ai-head-actions"><button type="button" onClick={() => void loadStatus()} disabled={checkingApi}>{checkingApi ? <LoaderCircle className="spin" /> : <RefreshCw />} Testar API</button><button type="button" onClick={clearConversation}>Limpar</button><button type="button" className="icon" onClick={() => setOpen(false)}><Minimize2 /></button><button type="button" className="icon close" onClick={() => setOpen(false)}><X /></button></div>
      </header>
      <div className="floating-ai-creditbar"><span>PAINEL IA</span><b>GRÁTIS — SEM CRÉDITOS</b><em>USO LIVRE</em></div>
      <div className="floating-ai-context"><BrainCircuit /><span>Versão de análise da V52: cruza viagens, largadas, capturas e condições oceânicas disponíveis no painel.</span></div>
      <div className="floating-ai-quick">{quickPrompts.map((item, index) => <button key={item.label} type="button" onClick={() => void ask(item.prompt, item.mode)} disabled={asking || assistant?.configured === false}>{index === 0 ? <BrainCircuit /> : <MessageSquareText />}<span>{item.label}<small>GRÁTIS</small></span></button>)}</div>
      <div className="floating-ai-chat" aria-live="polite">
        {messages.length === 0 ? <div className="floating-ai-welcome"><Sparkles /><div><b>Pronto para analisar o histórico do barco.</b><span>Faça uma pergunta ou use uma das análises rápidas. O Painel IA está livre e não desconta créditos.</span></div></div> : messages.map((message, index) => <article className={`floating-ai-message ${message.role}`} key={`${message.role}-${index}`}><small>{message.role === "user" ? "VOCÊ" : modelLabel(message.model || assistant?.model)}</small><div>{message.content}</div></article>)}
        {asking && <article className="floating-ai-message assistant thinking"><small>{modelLabel(assistant?.model)}</small><div><LoaderCircle className="spin" /> Analisando viagens, largadas e condições oceânicas…</div></article>}
        <div ref={endRef} />
      </div>
      {error && <div className="floating-ai-error">{error}</div>}
      {assistant?.configured === false && <div className="floating-ai-warning">Configure <b>OPENAI_API_KEY</b> na Vercel e faça um novo deploy para ativar a conversa.</div>}
      {assistant?.configured && assistant?.connection && !assistant.connection.ok && <div className="floating-ai-warning">A chave/modelo da OpenAI não passou no teste: <b>{assistant.connection.error || "falha de conexão"}</b></div>}
      <div className="floating-ai-composer"><textarea ref={inputRef} value={question} onChange={(e) => setQuestion(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }} placeholder="Pergunte ao Painel IA — GRÁTIS" rows={1} maxLength={2000} disabled={asking || assistant?.configured === false}/><button type="button" onClick={() => void ask()} disabled={asking || !question.trim() || assistant?.configured === false} title="Enviar">{asking ? <LoaderCircle className="spin" /> : <Send />}</button></div>
      <footer>IA para apoio operacional. Confirme sempre segurança, navegação e condições reais a bordo.</footer>
    </section>}
    <button type="button" className="floating-ai-trigger" onClick={() => setOpen((v) => !v)} aria-label={open ? "Fechar Painel IA" : "Abrir Painel IA"}><span className="floating-ai-trigger-icon"><Sparkles /></span><span className="floating-ai-trigger-copy"><small>ASSISTENTE</small><b>PAINEL IA</b></span><i /></button>
  </div>;
}
