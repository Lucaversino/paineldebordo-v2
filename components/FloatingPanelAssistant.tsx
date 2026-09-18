"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCircuit,
  LoaderCircle,
  MessageSquareText,
  Minimize2,
  Send,
  Sparkles,
  X,
} from "lucide-react";

type AssistantStatus = {
  configured: boolean;
  model: string;
  reasoningEffort?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  model?: string;
};

const quickPrompts = [
  "Analise profundamente a viagem atual e diga o que mais chama atenção.",
  "Compare a viagem atual com as viagens anteriores.",
  "Quais horários, profundidades e condições ambientais renderam melhor?",
  "Com base nas largadas registradas, o que devo observar na próxima largada?",
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
    const saved = window.sessionStorage.getItem("painel-ia-chat-v73") || window.sessionStorage.getItem("painel-ia-chat-v72");
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(-18)
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .map((item) => ({ role: item.role, content: item.content, model: item.model }));
  } catch {
    return [];
  }
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

  useEffect(() => {
    let alive = true;
    fetch("/api/ai-assistant", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((status) => {
        if (alive && status) setAssistant(status);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem("painel-ia-chat-v73", JSON.stringify(messages.slice(-18)));
    } catch {
      // sessionStorage é apenas conveniência; o chat segue funcionando sem ele.
    }
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "end" });
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    if (!oceanContext) {
      fetch("/api/ocean-intelligence", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((result) => {
          if (result) setOceanContext(result);
        })
        .catch(() => null);
    }
    return () => window.clearTimeout(timer);
  }, [open, oceanContext]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, asking, open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const statusText = useMemo(() => {
    if (!assistant) return "Verificando IA";
    if (!assistant.configured) return "API não configurada";
    return `${modelLabel(assistant.model)} • ${assistant.reasoningEffort || "high"}`;
  }, [assistant]);

  const ask = async (preset?: string) => {
    const text = String(preset ?? question).trim();
    if (!text || asking) return;

    setQuestion("");
    setError("");
    const previous = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setAsking(true);

    try {
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: text,
          conversation: previous,
          environment: oceanContext?.environment || null,
          statisticalAnalysis: oceanContext?.analysis || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (!response.ok) throw new Error(result?.error || "A IA não conseguiu responder agora.");
      setMessages((current) => [
        ...current,
        { role: "assistant", content: String(result.answer || ""), model: result.model },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar a IA.");
    } finally {
      setAsking(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setQuestion("");
    setError("");
    try {
      window.sessionStorage.removeItem("painel-ia-chat-v73");
      window.sessionStorage.removeItem("painel-ia-chat-v72");
    } catch {}
  };

  return (
    <div className={open ? "floating-ai open" : "floating-ai"}>
      {open && (
        <section className="floating-ai-panel" aria-label="Assistente do Painel de Bordo">
          <header className="floating-ai-head">
            <div className="floating-ai-brand">
              <span><Sparkles /></span>
              <div>
                <small>PAINEL IA</small>
                <b>Assistente de pesca</b>
                <em className={assistant?.configured ? "ready" : ""}>{statusText}</em>
              </div>
            </div>
            <div className="floating-ai-head-actions">
              <button type="button" onClick={clearConversation} title="Limpar conversa">Limpar</button>
              <button type="button" className="icon" onClick={() => setOpen(false)} title="Minimizar"><Minimize2 /></button>
              <button type="button" className="icon close" onClick={() => setOpen(false)} title="Fechar"><X /></button>
            </div>
          </header>

          <div className="floating-ai-context">
            <BrainCircuit />
            <span>Leio viagens, largadas, capturas e os registros ambientais preservados no painel.</span>
          </div>

          <div className="floating-ai-quick">
            {quickPrompts.map((prompt, index) => (
              <button
                key={prompt}
                type="button"
                onClick={() => ask(prompt)}
                disabled={asking || assistant?.configured === false}
              >
                {index === 0 ? <BrainCircuit /> : <MessageSquareText />}
                <span>{index === 0 ? "Analisar viagem" : index === 1 ? "Comparar viagens" : index === 2 ? "Melhores condições" : "Próxima largada"}</span>
              </button>
            ))}
          </div>

          <div className="floating-ai-chat" aria-live="polite">
            {messages.length === 0 ? (
              <div className="floating-ai-welcome">
                <Sparkles />
                <div>
                  <b>Converse com o Painel IA</b>
                  <span>Pergunte sobre rendimento, posições, horários, profundidade, vento, mar, lua ou histórico das viagens.</span>
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <article className={`floating-ai-message ${message.role}`} key={`${message.role}-${index}`}>
                  <small>{message.role === "user" ? "VOCÊ" : modelLabel(message.model || assistant?.model)}</small>
                  <div>{message.content}</div>
                </article>
              ))
            )}
            {asking && (
              <article className="floating-ai-message assistant thinking">
                <small>{modelLabel(assistant?.model)}</small>
                <div><LoaderCircle className="spin" /> Analisando os dados do painel…</div>
              </article>
            )}
            <div ref={endRef} />
          </div>

          {error && <div className="floating-ai-error">{error}</div>}
          {assistant?.configured === false && (
            <div className="floating-ai-warning">Configure <b>OPENAI_API_KEY</b> na Vercel para ativar a conversa.</div>
          )}

          <div className="floating-ai-composer">
            <textarea
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }}
              placeholder="Pergunte ao Painel IA…"
              rows={1}
              maxLength={2000}
              disabled={asking || assistant?.configured === false}
            />
            <button
              type="button"
              onClick={() => void ask()}
              disabled={asking || !question.trim() || assistant?.configured === false}
              title="Enviar"
            >
              {asking ? <LoaderCircle className="spin" /> : <Send />}
            </button>
          </div>
          <footer>IA para apoio operacional. Confirme sempre segurança, navegação e condições reais a bordo.</footer>
        </section>
      )}

      <button
        type="button"
        className="floating-ai-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Fechar Painel IA" : "Abrir Painel IA"}
        title="Painel IA"
      >
        <span className="floating-ai-trigger-icon"><Sparkles /></span>
        <span className="floating-ai-trigger-copy"><small>ASSISTENTE</small><b>PAINEL IA</b></span>
        <i />
      </button>
    </div>
  );
}
