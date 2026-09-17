"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BrainCircuit,
  Droplets,
  LoaderCircle,
  MessageSquareText,
  MoonStar,
  RefreshCw,
  Send,
  Sparkles,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";

const n = (v: any, d = 1) =>
  v == null || Number.isNaN(Number(v))
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }).format(Number(v));
const tm = (v?: string | null) =>
  v
    ? new Date(v).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

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

const suggestions = [
  "Faça uma análise profunda da viagem atual e diga o que mais chama atenção.",
  "Compare a viagem atual com as viagens finalizadas e encontre diferenças de rendimento.",
  "Quais horários e profundidades tiveram melhor rendimento nas minhas largadas?",
  "Cruze lua, vento, mar, temperatura e clorofila com meu histórico e diga o que observar na próxima largada.",
];

function modelLabel(model?: string) {
  if (!model) return "OpenAI";
  if (model === "gpt-5.6-sol" || model === "gpt-5.6") return "GPT-5.6 Sol";
  if (model === "gpt-5.6-terra") return "GPT-5.6 Terra";
  if (model === "gpt-5.6-luna") return "GPT-5.6 Luna";
  if (model === "gpt-6-astra") return "GPT-6 Astra";
  return model;
}

export default function OceanIntelligence() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assistant, setAssistant] = useState<AssistantStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const loadOcean = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/ocean-intelligence", { cache: "no-store" });
      if (response.ok) setData(await response.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let alive = true;
    loadOcean();
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, asking]);

  const ask = async (preset?: string) => {
    const text = String(preset ?? question).trim();
    if (!text || asking) return;
    setAssistantError("");
    setQuestion("");
    const previous = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setAsking(true);
    try {
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: text,
          environment: data?.environment || null,
          statisticalAnalysis: data?.analysis || null,
          conversation: previous,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "A IA não conseguiu analisar os dados agora.");
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.answer, model: result.model },
      ]);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "Falha ao consultar a IA.");
    } finally {
      setAsking(false);
    }
  };

  if (loading)
    return (
      <section className="ocean-intel loading">
        <div>
          <BrainCircuit />
          <b>INTELIGÊNCIA OCEÂNICA</b>
        </div>
        <p>Carregando lua, vento, mar, clorofila e histórico das largadas…</p>
      </section>
    );
  if (!data) return null;

  const e = data.environment;
  const a = data.analysis;

  return (
    <section className="ocean-intel">
      <div className="ocean-head">
        <div>
          <BrainCircuit />
          <span>
            <small>ASSISTENTE DE PESCA</small>
            <b>Inteligência oceânica + análise das largadas</b>
          </span>
        </div>
        <div className="ocean-head-actions">
          <button type="button" onClick={() => loadOcean(true)} disabled={refreshing} title="Atualizar dados oceânicos">
            <RefreshCw className={refreshing ? "spin" : ""} /> Atualizar
          </button>
          <em>confiança {a.confidence}</em>
        </div>
      </div>

      {!e ? (
        <div className="ocean-empty">Registre uma largada com coordenadas para liberar os dados do ponto de pesca.</div>
      ) : (
        <>
          <div className="ocean-grid">
            <article>
              <MoonStar />
              <small>LUA AGORA</small>
              <b>{e.lunar.name}</b>
              <span>{n(e.lunar.illumination * 100, 0)}% iluminada</span>
              <i>Nasce {tm(e.lunar.moonrise)} • põe {tm(e.lunar.moonset)}</i>
            </article>
            <article>
              <Wind />
              <small>VENTO</small>
              <b>{n(e.wind?.speedKmh)} km/h</b>
              <span>
                Direção: {e.wind?.direction || "—"}
                {e.wind?.directionDeg != null ? ` (${n(e.wind.directionDeg, 0)}°)` : ""}
              </span>
              <i>Rajadas {n(e.wind?.gustKmh)} km/h • Atualização {tm(e.wind?.time)}</i>
            </article>
            <article>
              <Waves />
              <small>MAR / ONDA</small>
              <b>{n(e.sea?.waveHeightM)} m</b>
              <span>Período {n(e.sea?.wavePeriodS)} s • swell {n(e.sea?.swellHeightM)} m</span>
              <i>Corrente {n(e.sea?.currentKmh)} km/h</i>
            </article>
            <article>
              <Droplets />
              <small>MARÉ MODELADA</small>
              <b>{n(e.sea?.seaLevelMslM, 2)} m MSL</b>
              <span>
                {e.sea?.extrema?.[0]
                  ? `${e.sea.extrema[0].type === "HIGH" ? "Próx. alta" : "Próx. baixa"} ${tm(e.sea.extrema[0].time)}`
                  : "Sem extremo próximo"}
              </span>
              <i>Não usar para navegação</i>
            </article>
            <article>
              <Thermometer />
              <small>TEMPERATURA DO MAR</small>
              <b>{n(e.sea?.sstC)} °C</b>
              <span>Posição da largada #{e.position.setNumber}</span>
              <i>{n(e.position.lat, 4)}, {n(e.position.lon, 4)}</i>
            </article>
            <article>
              <Activity />
              <small>CLOROFILA-a</small>
              <b>{e.chlorophyll ? `${n(e.chlorophyll.mgM3, 2)} mg/m³` : "Sem leitura"}</b>
              <span>{e.chlorophyll ? "Satélite VIIRS" : "Nuvem/grade pode impedir leitura"}</span>
              <i>{e.chlorophyll?.time ? new Date(e.chlorophyll.time).toLocaleDateString("pt-BR") : "NOAA CoastWatch"}</i>
            </article>
          </div>
          <div className="sunline">
            <span>☀️ Sol nasce <b>{tm(e.sun?.sunrise)}</b></span>
            <span>🌅 Sol se põe <b>{tm(e.sun?.sunset)}</b></span>
          </div>
        </>
      )}

      <div className="ai-analysis">
        <div>
          <small>ANÁLISE ESTATÍSTICA LOCAL</small>
          <h3>{a.sampleCount} largadas com captura analisadas</h3>
        </div>
        <div className="ai-findings">
          <span>
            <small>Melhor horário observado</small>
            <b>{a.bestHour?.label || "Aguardando dados"}</b>
            <em>{a.bestHour ? `${n(a.bestHour.avgKg, 0)} kg/largada • ${a.bestHour.samples} amostras` : ""}</em>
          </span>
          <span>
            <small>Melhor profundidade observada</small>
            <b>{a.bestDepth?.label || "Aguardando dados"}</b>
            <em>{a.bestDepth ? `${n(a.bestDepth.avgKg, 0)} kg/largada • ${a.bestDepth.samples} amostras` : ""}</em>
          </span>
          <span>
            <small>Fase lunar com maior média</small>
            <b>{a.bestMoon?.label || "Aguardando dados"}</b>
            <em>{a.bestMoon ? `${n(a.bestMoon.avgKg, 0)} kg/largada • ${a.bestMoon.samples} amostras` : ""}</em>
          </span>
        </div>
        <p>{a.notes?.[0]} O sistema mostra tamanho da amostra para evitar conclusões falsas.</p>
      </div>

      <div className="openai-assistant">
        <div className="openai-assistant-head">
          <div className="openai-assistant-title">
            <span className="openai-mark"><Sparkles /></span>
            <div>
              <small>PAINEL IA • OPENAI</small>
              <h3>Assistente de análise profunda</h3>
              <p>Cruza suas viagens, largadas, capturas e o ambiente oceânico atual para responder perguntas sobre desempenho.</p>
            </div>
          </div>
          <div className={assistant?.configured ? "ai-status ready" : "ai-status"}>
            <i />
            {assistant?.configured ? `${modelLabel(assistant.model)} • ${assistant.reasoningEffort || "high"}` : "Aguardando API OpenAI"}
          </div>
        </div>

        <div className="ai-suggestions">
          {suggestions.map((item, index) => (
            <button key={index} type="button" onClick={() => ask(item)} disabled={asking || assistant?.configured === false}>
              {index === 0 ? <BrainCircuit /> : <MessageSquareText />}
              <span>{item}</span>
            </button>
          ))}
        </div>

        <div className="ai-chat" aria-live="polite">
          {messages.length === 0 ? (
            <div className="ai-welcome">
              <BrainCircuit />
              <div>
                <b>Pronto para analisar o histórico do barco.</b>
                <span>Faça uma pergunta ou use uma das análises rápidas acima. A IA recebe os registros da sua conta no momento da consulta.</span>
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
                <small>{message.role === "user" ? "VOCÊ" : modelLabel(message.model || assistant?.model)}</small>
                <div>{message.content}</div>
              </div>
            ))
          )}
          {asking && (
            <div className="ai-message assistant thinking">
              <small>{modelLabel(assistant?.model)}</small>
              <div><LoaderCircle className="spin" /> Analisando viagens, largadas e condições oceânicas…</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {assistantError && <div className="ai-error">{assistantError}</div>}
        {assistant?.configured === false && (
          <div className="ai-config-warning">
            Adicione <b>OPENAI_API_KEY</b> nas Environment Variables da Vercel e faça um novo deploy para ativar o assistente.
          </div>
        )}

        <div className="ai-composer">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                ask();
              }
            }}
            placeholder="Ex.: olhando minhas 19 largadas e o vento de agora, o que devo observar antes da próxima largada?"
            rows={2}
            maxLength={2000}
            disabled={asking || assistant?.configured === false}
          />
          <button type="button" onClick={() => ask()} disabled={asking || !question.trim() || assistant?.configured === false} title="Enviar pergunta">
            {asking ? <LoaderCircle className="spin" /> : <Send />}
          </button>
        </div>
        <div className="ai-disclaimer">
          A IA apoia a análise operacional; não substitui experiência do mestre, procedimentos de segurança, carta náutica ou avisos oficiais.
        </div>
      </div>

      <footer>Fontes ambientais: Open-Meteo + NOAA CoastWatch. Maré e dados oceânicos são modelados e não substituem referências oficiais de navegação.</footer>
    </section>
  );
}
