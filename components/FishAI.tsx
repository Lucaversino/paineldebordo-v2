"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, FolderClock, LoaderCircle, Send, Sparkles, Trash2, X } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

type AssistantStatus = {
  enabled?: boolean;
  configured?: boolean;
  model?: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };
type ConversationRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

const HISTORY_LIMIT = 50;
const MESSAGE_LIMIT = 40;

function safeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MESSAGE_LIMIT)
    .filter((item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .map((item: any) => ({ role: item.role, content: String(item.content) }));
}

function safeHistory(value: unknown): ConversationRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item: any) => item && typeof item.id === "string" && typeof item.createdAt === "string")
    .map((item: any) => ({
      id: String(item.id),
      createdAt: String(item.createdAt),
      updatedAt: String(item.updatedAt || item.createdAt),
      messages: safeMessages(item.messages),
    }))
    .filter((item: ConversationRecord) => item.messages.length > 0)
    .sort((a: ConversationRecord, b: ConversationRecord) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, HISTORY_LIMIT);
}

function newConversationId() {
  try { return crypto.randomUUID(); } catch { return `fish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
}

function historyKey(userId: string) { return `fish-ai-history-v88:${userId}`; }
function activeKey(userId: string) { return `fish-ai-active-v88:${userId}`; }

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function conversationTitle(conversation: ConversationRecord) {
  const firstUser = conversation.messages.find((message) => message.role === "user")?.content.trim() || "Conversa";
  return firstUser.length > 58 ? `${firstUser.slice(0, 58)}…` : firstUser;
}

export default function FishAI() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [accessEnabled, setAccessEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [oceanContext, setOceanContext] = useState<any>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ConversationRecord[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [storageUserId, setStorageUserId] = useState<string | null>(null);
  const hydratedRef = useRef(false);
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
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const userId = data.session?.user?.id;
      if (!userId) return;
      setStorageUserId(userId);

      let storedHistory: ConversationRecord[] = [];
      try { storedHistory = safeHistory(JSON.parse(localStorage.getItem(historyKey(userId)) || "[]")); } catch {}

      let activeId: string | null = null;
      try { activeId = localStorage.getItem(activeKey(userId)); } catch {}

      let activeConversation = activeId ? storedHistory.find((conversation) => conversation.id === activeId) : undefined;

      if (!storedHistory.length) {
        try {
          const legacy = safeMessages(JSON.parse(sessionStorage.getItem("fish-ia-chat-v87") || "[]"));
          if (legacy.length) {
            const now = new Date().toISOString();
            activeId = newConversationId();
            activeConversation = { id: activeId, createdAt: now, updatedAt: now, messages: legacy };
            storedHistory = [activeConversation];
          }
        } catch {}
      }

      if (!activeConversation && storedHistory.length) {
        activeConversation = storedHistory[0];
        activeId = activeConversation.id;
      }

      setHistory(storedHistory);
      setActiveConversationId(activeId);
      setMessages(activeConversation?.messages || []);
      hydratedRef.current = true;
    });

    try {
      ["painel-ia-chat-v86", "painel-ia-chat-v85", "painel-ia-chat-v76", "painel-ia-chat-v73", "painel-ia-chat-v72"].forEach((key) => sessionStorage.removeItem(key));
    } catch {}
    void loadAccess();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !storageUserId) return;
    try { localStorage.setItem(historyKey(storageUserId), JSON.stringify(history.slice(0, HISTORY_LIMIT))); } catch {}
  }, [history, storageUserId]);

  useEffect(() => {
    if (!hydratedRef.current || !storageUserId) return;
    try {
      if (activeConversationId) localStorage.setItem(activeKey(storageUserId), activeConversationId);
      else localStorage.removeItem(activeKey(storageUserId));
    } catch {}
  }, [activeConversationId, storageUserId]);

  useEffect(() => {
    if (!hydratedRef.current || !activeConversationId || !messages.length) return;
    const now = new Date().toISOString();
    setHistory((current) => {
      const existing = current.find((conversation) => conversation.id === activeConversationId);
      const updated: ConversationRecord = {
        id: activeConversationId,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        messages: messages.slice(-MESSAGE_LIMIT),
      };
      return [updated, ...current.filter((conversation) => conversation.id !== activeConversationId)]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, HISTORY_LIMIT);
    });
  }, [messages, activeConversationId]);

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
    if (open && !historyOpen) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, asking, open, historyOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && (historyOpen ? setHistoryOpen(false) : setOpen(false));
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [historyOpen]);

  function ensureConversation() {
    if (activeConversationId) return activeConversationId;
    const id = newConversationId();
    setActiveConversationId(id);
    return id;
  }

  function clearConversation() {
    setQuestion("");
    setError("");
    setAsking(false);
    setMessages([]);
    setActiveConversationId(null);
    setHistoryOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }

  function openConversation(conversation: ConversationRecord) {
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setQuestion("");
    setError("");
    setHistoryOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }

  function deleteConversation(id: string) {
    setHistory((current) => current.filter((conversation) => conversation.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
      setQuestion("");
      setError("");
    }
  }

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;

    ensureConversation();
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
      if (!response.ok) throw new Error(result?.error || "A FISH AI não conseguiu responder agora.");
      const answer = String(result?.answer || "").trim();
      if (!answer) throw new Error("A FISH AI não retornou resposta.");
      setMessages((current) => [...current, { role: "assistant", content: answer }]);
    } catch (cause) {
      const message = cause instanceof DOMException && cause.name === "TimeoutError"
        ? "Demorou mais que o esperado. Tente de novo."
        : cause instanceof Error ? cause.message : "Falha ao consultar a FISH AI.";
      setError(message);
    } finally {
      setAsking(false);
    }
  };

  if (accessEnabled === false) return null;

  const unavailable = status?.configured === false;

  return <div className={open ? "fish-ai open" : "fish-ai"}>
    {open && <section className="fish-ai-panel" aria-label="FISH AI">
      <header className="fish-ai-header">
        <strong>FISH AI</strong>
        <div className="fish-ai-header-actions">
          <button type="button" onClick={() => setHistoryOpen((value) => !value)} aria-label="Histórico de conversas" title="Histórico"><FolderClock /></button>
          <button type="button" onClick={clearConversation} aria-label="Limpar conversa" title="Limpar conversa"><Eraser /></button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" title="Fechar"><X /></button>
        </div>
      </header>

      <div className="fish-ai-chat" aria-live="polite">
        {messages.map((message, index) => <article className={`fish-ai-message ${message.role}`} key={`${message.role}-${index}`}><div>{message.content}</div></article>)}
        {asking && <article className="fish-ai-message assistant thinking" aria-label="Respondendo"><div><span className="fish-ai-dot"/><span className="fish-ai-dot"/><span className="fish-ai-dot"/></div></article>}
        <div ref={endRef} />
      </div>

      {historyOpen && <aside className="fish-ai-history" aria-label="Histórico de conversas">
        <div className="fish-ai-history-head"><b>Histórico</b><span>{history.length}</span></div>
        <div className="fish-ai-history-list">
          {!history.length && <div className="fish-ai-history-empty">Nenhuma conversa salva.</div>}
          {history.map((conversation) => <div className={`fish-ai-history-item ${conversation.id === activeConversationId ? "active" : ""}`} key={conversation.id}>
            <button type="button" className="fish-ai-history-open" onClick={() => openConversation(conversation)}>
              <b>{conversationTitle(conversation)}</b>
              <small>{formatDateTime(conversation.updatedAt)}</small>
            </button>
            <button type="button" className="fish-ai-history-delete" onClick={() => deleteConversation(conversation.id)} aria-label="Excluir conversa" title="Excluir conversa"><Trash2 /></button>
          </div>)}
        </div>
      </aside>}

      {error && <div className="fish-ai-error">{error}</div>}
      {unavailable && <div className="fish-ai-error">FISH AI indisponível no momento.</div>}
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
          aria-label="Mensagem para FISH AI"
          rows={1}
          maxLength={2000}
          disabled={asking || unavailable}
        />
        <button type="button" onClick={() => void ask()} disabled={asking || !question.trim() || unavailable} aria-label="Enviar">
          {asking ? <LoaderCircle className="spin" /> : <Send />}
        </button>
      </div>
    </section>}

    <button type="button" className="fish-ai-trigger" onClick={() => setOpen((value) => !value)} aria-label={open ? "Fechar FISH AI" : "Abrir FISH AI"}>
      <span className="fish-ai-trigger-icon"><Sparkles /></span>
      <b>FISH AI</b>
      <i />
    </button>
  </div>;
}
