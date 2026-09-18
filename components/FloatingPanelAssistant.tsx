"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, LoaderCircle, MessageSquareText, Minimize2, Send, Sparkles, X } from "lucide-react";

type AssistantStatus = {
  configured: boolean;
  model: string;
  reasoningEffort?: string;
  wallet?: { balance: number; aiBonusBrl?: number; freeAiAccess?: boolean; isSuperAdmin?: boolean };
  pricing?: { basicCredits: number; fullCredits: number; advancedCredits: number; basicBrl: number; fullBrl: number; advancedBrl: number; basicBonusBrl?: number; fullBonusBrl?: number; advancedBonusBrl?: number; welcomeBonusBrl?: number; adminFree: boolean };
};
type ChatMessage = { role: "user" | "assistant"; content: string; model?: string };
type AiMode = "basic" | "full" | "advanced";

const quickPrompts: Array<{ label: string; prompt: string; mode: AiMode }> = [
  { label: "Analisar viagem", mode: "full", prompt: "Analise profundamente a viagem atual e diga o que mais chama atenção." },
  { label: "Comparar viagens", mode: "full", prompt: "Compare a viagem atual com as viagens anteriores." },
  { label: "Melhores condições", mode: "advanced", prompt: "Quais horários, profundidades e condições ambientais renderam melhor?" },
  { label: "Próxima largada", mode: "advanced", prompt: "Com base nas largadas e dados ambientais registrados, o que devo observar na próxima largada?" },
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
    const saved = window.sessionStorage.getItem("painel-ia-chat-v76") || window.sessionStorage.getItem("painel-ia-chat-v73") || window.sessionStorage.getItem("painel-ia-chat-v72");
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-18).filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").map((item) => ({ role: item.role, content: item.content, model: item.model }));
  } catch { return []; }
}

export default function FloatingPanelAssistant() {
  const [open, setOpen] = useState(false);
  const [assistant, setAssistant] = useState<AssistantStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(restoreMessages);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [oceanContext, setOceanContext] = useState<any>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const loadStatus = () => fetch("/api/ai-assistant", { cache: "no-store", signal: AbortSignal.timeout(10000) })
    .then((r) => r.ok ? r.json() : null)
    .then((status) => { if (status) setAssistant(status); })
    .catch(() => null);

  useEffect(() => { if (open && !assistant) void loadStatus(); }, [open, assistant]);
  useEffect(() => { try { window.sessionStorage.setItem("painel-ia-chat-v76", JSON.stringify(messages.slice(-18))); } catch {} }, [messages]);
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
    if (!assistant) return "Verificando IA";
    if (!assistant.configured) return "API não configurada";
    return `${modelLabel(assistant.model)} • ${assistant.reasoningEffort || "high"}`;
  }, [assistant]);
  const costLabel = (mode: AiMode) => {
    if (assistant?.pricing?.adminFree) return "GRÁTIS";
    if (!assistant?.pricing) return "VALOR...";
    const credits = mode === "advanced" ? assistant.pricing.advancedCredits : mode === "full" ? assistant.pricing.fullCredits : assistant.pricing.basicCredits;
    const costBrl = mode === "advanced" ? assistant.pricing.advancedBrl : mode === "full" ? assistant.pricing.fullBrl : assistant.pricing.basicBrl;
    const bonus = Number(assistant?.wallet?.aiBonusBrl || 0);
    if (bonus > 0 && bonus + 0.0001 >= costBrl) return "BÔNUS IA";
    return `${credits} CR`;
  };

  const ask = async (preset?: string, mode: AiMode = "basic") => {
    const text = String(preset ?? question).trim();
    if (!text || asking) return;
    setQuestion(""); setError("");
    const previous = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setAsking(true);
    try {
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, mode, conversation: previous, environment: oceanContext?.environment || null, statisticalAnalysis: oceanContext?.analysis || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result?.error || "A IA não conseguiu responder agora.");
      setMessages((current) => [...current, { role: "assistant", content: String(result.answer || ""), model: result.model }]);
      if (result?.billing) {
        const nextBalance = Number(result.billing.balance ?? assistant?.wallet?.balance ?? 0);
        setAssistant((current) => current ? ({ ...current, wallet: { ...(current.wallet || { balance: 0 }), balance: nextBalance, aiBonusBrl: Number(result.billing.aiBonusBrl ?? current.wallet?.aiBonusBrl ?? 0) } }) : current);
        window.dispatchEvent(new CustomEvent("painel-billing-changed", { detail: { balance: nextBalance } }));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao consultar a IA."); }
    finally { setAsking(false); }
  };

  const clearConversation = () => { setMessages([]); setQuestion(""); setError(""); try { ["painel-ia-chat-v76","painel-ia-chat-v73","painel-ia-chat-v72"].forEach((k) => sessionStorage.removeItem(k)); } catch {} };

  return <div className={open ? "floating-ai open" : "floating-ai"}>
    {open && <section className="floating-ai-panel" aria-label="Assistente do Painel de Bordo">
      <header className="floating-ai-head">
        <div className="floating-ai-brand"><span><Sparkles /></span><div><small>PAINEL IA</small><b>Assistente de pesca</b><em className={assistant?.configured ? "ready" : ""}>{statusText}</em></div></div>
        <div className="floating-ai-head-actions"><button type="button" onClick={clearConversation}>Limpar</button><button type="button" className="icon" onClick={() => setOpen(false)}><Minimize2 /></button><button type="button" className="icon close" onClick={() => setOpen(false)}><X /></button></div>
      </header>
      <div className="floating-ai-creditbar"><span>MEUS CRÉDITOS</span><b>{assistant?.pricing?.adminFree ? "GRÁTIS — ADMIN" : `${assistant?.wallet?.balance ?? 0} créditos`}</b>{!assistant?.pricing?.adminFree && Number(assistant?.wallet?.aiBonusBrl || 0) > 0 && <em>Bônus IA: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(assistant?.wallet?.aiBonusBrl || 0))}</em>}</div>
      <div className="floating-ai-context"><BrainCircuit /><span>Leio viagens, largadas, capturas e registros ambientais preservados no painel.</span></div>
      <div className="floating-ai-quick">{quickPrompts.map((item, index) => <button key={item.label} type="button" onClick={() => ask(item.prompt, item.mode)} disabled={asking || assistant?.configured === false}>{index === 0 ? <BrainCircuit /> : <MessageSquareText />}<span>{item.label}<small>{costLabel(item.mode)}</small></span></button>)}</div>
      <div className="floating-ai-chat" aria-live="polite">
        {messages.length === 0 ? <div className="floating-ai-welcome"><Sparkles /><div><b>Converse com o Painel IA</b><span>{Number(assistant?.wallet?.aiBonusBrl || 0) > 0 ? `Você tem R$ ${Number(assistant?.wallet?.aiBonusBrl || 0).toFixed(2).replace(".", ",")} de bônus exclusivo para testar a IA. ` : ""}Perguntas simples usam menos dados e custam {costLabel("basic")}. Análises completas e avançadas usam o histórico necessário.</span></div></div> : messages.map((message, index) => <article className={`floating-ai-message ${message.role}`} key={`${message.role}-${index}`}><small>{message.role === "user" ? "VOCÊ" : modelLabel(message.model || assistant?.model)}</small><div>{message.content}</div></article>)}
        {asking && <article className="floating-ai-message assistant thinking"><small>{modelLabel(assistant?.model)}</small><div><LoaderCircle className="spin" /> Analisando os dados do painel…</div></article>}
        <div ref={endRef} />
      </div>
      {error && <div className="floating-ai-error">{error}</div>}
      {assistant?.configured === false && <div className="floating-ai-warning">Configure <b>OPENAI_API_KEY</b> na Vercel para ativar a conversa.</div>}
      <div className="floating-ai-composer"><textarea ref={inputRef} value={question} onChange={(e) => setQuestion(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(undefined, "basic"); } }} placeholder={assistant?.pricing?.adminFree ? "Pergunte ao Painel IA — GRÁTIS" : `Pergunte ao Painel IA — ${costLabel("basic")}`} rows={1} maxLength={2000} disabled={asking || assistant?.configured === false}/><button type="button" onClick={() => void ask(undefined, "basic")} disabled={asking || !question.trim() || assistant?.configured === false} title="Enviar">{asking ? <LoaderCircle className="spin" /> : <Send />}</button></div>
      <footer>IA para apoio operacional. Confirme sempre segurança, navegação e condições reais a bordo.</footer>
    </section>}
    <button type="button" className="floating-ai-trigger" onClick={() => setOpen((v) => !v)} aria-label={open ? "Fechar Painel IA" : "Abrir Painel IA"}><span className="floating-ai-trigger-icon"><Sparkles /></span><span className="floating-ai-trigger-copy"><small>ASSISTENTE</small><b>PAINEL IA</b></span><i /></button>
  </div>;
}
