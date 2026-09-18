"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

type AssistantStatus = {
  enabled?: boolean;
  configured?: boolean;
  model?: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function restoreMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.sessionStorage.getItem("fish-ia-chat-v87");
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(-20)
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .map((item) => ({ role: item.role, content: item.content }));
  } catch {
    return [];
  }
}

export default function FishAI() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [accessEnabled, setAccessEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(restoreMessages);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [oceanContext, setOceanContext] = useState<any>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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
        signal: init.signal || AbortSignal.timeout(isPost ? 60_000 : 12_000),
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

  const loadAccess = async () => {
    try {
      const response = await aiFetch("/api/ai-assistant");
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (response.status === 403) {
        setAccessEnabled(false);
        setOpen(false);
        return;
      }
      if (!response.ok) return;
      setAccessEnabled(result?.enabled !== false);
      setStatus(result);
    } catch {
      // Não bloqueia o botão por uma falha temporária de rede.
    }
  };

  useEffect(() => {
    try {
      ["painel-ia-chat-v86", "painel-ia-chat-v85", "painel-ia-chat-v76", "painel-ia-chat-v73", "painel-ia-chat-v72"].forEach((key) => sessionStorage.removeItem(key));
    } catch {}
    void loadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { window.sessionStorage.setItem("fish-ia-chat-v87", JSON.stringify(messages.slice(-20))); } catch {}
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    if (!status) void loadAccess();
    if (!oceanContext) {
      fetch("/api/ocean-intelligence", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((result) => result && setOceanContext(result))
        .catch(() => null);
    }
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, asking, open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;

    setQuestion("");
    setError("");
    const previous = messages.slice(-10);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setAsking(true);

    try {
      const response = await aiFetch("/api/ai-assistant", {
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
      if (response.status === 403) {
        setAccessEnabled(false);
        setOpen(false);
        return;
      }
      if (!response.ok) throw new Error(result?.error || "A FISH IA não conseguiu responder agora.");
      const answer = String(result?.answer || "").trim();
      if (!answer) throw new Error("A FISH IA não retornou resposta.");
      setMessages((current) => [...current, { role: "assistant", content: answer }]);
    } catch (cause) {
      const message = cause instanceof DOMException && cause.name === "TimeoutError"
        ? "Demorou mais que o esperado. Tente de novo."
        : cause instanceof Error ? cause.message : "Falha ao consultar a FISH IA.";
      setError(message);
    } finally {
      setAsking(false);
    }
  };

  if (accessEnabled === false) return null;

  const unavailable = status?.configured === false;

  return <div className={open ? "fish-ai open" : "fish-ai"}>
    {open && <section className="fish-ai-panel" aria-label="FISH IA">
      <button type="button" className="fish-ai-close" onClick={() => setOpen(false)} aria-label="Fechar"><X /></button>
      <div className="fish-ai-chat" aria-live="polite">
        {messages.map((message, index) => <article className={`fish-ai-message ${message.role}`} key={`${message.role}-${index}`}><div>{message.content}</div></article>)}
        {asking && <article className="fish-ai-message assistant thinking" aria-label="Respondendo"><div><span className="fish-ai-dot"/><span className="fish-ai-dot"/><span className="fish-ai-dot"/></div></article>}
        <div ref={endRef} />
      </div>
      {error && <div className="fish-ai-error">{error}</div>}
      {unavailable && <div className="fish-ai-error">FISH IA indisponível no momento.</div>}
      <div className="fish-ai-composer">
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
          placeholder=""
          aria-label="Mensagem para FISH IA"
          rows={1}
          maxLength={2000}
          disabled={asking || unavailable}
        />
        <button type="button" onClick={() => void ask()} disabled={asking || !question.trim() || unavailable} aria-label="Enviar">
          {asking ? <LoaderCircle className="spin" /> : <Send />}
        </button>
      </div>
    </section>}

    <button type="button" className="fish-ai-trigger" onClick={() => setOpen((value) => !value)} aria-label={open ? "Fechar FISH IA" : "Abrir FISH IA"}>
      <span className="fish-ai-trigger-icon"><Sparkles /></span>
      <b>FISH IA</b>
      <i />
    </button>
  </div>;
}
