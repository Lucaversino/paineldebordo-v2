"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, Search, Volume2, Square } from "lucide-react";
import { helpLessons } from "../lib/helpLessons";
import "./help.css";

const categories = ["Todos", ...Array.from(new Set(helpLessons.map(item => item.category)))];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export default function HelpCenter({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [selected, setSelected] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [audioMessage, setAudioMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const lesson = helpLessons.find(item => item.id === selected);
  const stop = () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); setSpeaking(false); };
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);
  const open = (id: string | null) => { stop(); setAudioMessage(""); setSelected(id); requestAnimationFrame(() => { heading.current?.focus(); heading.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }); };
  const speak = () => {
    if (!lesson) return;
    if (!("speechSynthesis" in window)) { setAudioMessage("Este navegador não oferece leitura em voz alta. O passo a passo está escrito abaixo."); return; }
    if (speaking) { stop(); return; }
    const utterance = new SpeechSynthesisUtterance([lesson.title, lesson.intro, ...lesson.steps.map((step, index) => `Passo ${index + 1}. ${step}`), lesson.tip].join(". "));
    utterance.lang = "pt-BR"; utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => { setSpeaking(false); setAudioMessage("Não foi possível reproduzir a voz. Leia os passos abaixo."); };
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); setSpeaking(true);
  };
  const results = helpLessons.filter(item => (category === "Todos" || item.category === category) && normalize([item.title, item.intro, ...item.steps, item.tip].join(" ")).includes(normalize(query.trim())));
  return <section className="help-center" aria-label="Central de ajuda">
    <header className="help-hero">
      <img src="/ajuda/pescador.webp" alt="Ilustração de pescador usando celular, embarcação no mar e registro da pescaria" width="1536" height="1024" />
      <div><span className="help-eyebrow">PAINEL DE BORDO · GUIA DO PESCADOR</span><h1 ref={heading} tabIndex={-1}>{lesson ? lesson.title : "Aprenda no seu ritmo."}</h1><p>{lesson ? lesson.intro : "Um passo de cada vez. Escolha o que quer fazer e acompanhe as explicações."}</p></div>
    </header>
    {lesson ? <>
      <div className="help-toolbar"><button onClick={() => open(null)}><ArrowLeft size={18} /> Todos os tutoriais</button><button onClick={speak}>{speaking ? <Square size={18} /> : <Volume2 size={18} />}{speaking ? "Parar leitura" : "Ouvir os passos"}</button></div>
      <p className="help-audio-note" role="status">{audioMessage || "A leitura em voz alta depende das vozes disponíveis no aparelho."}</p>
      {lesson.visual && <figure className="help-figure"><img src={`/ajuda/${lesson.visual}.svg`} alt={visualDescriptions[lesson.visual]} width="1000" height="540" /><figcaption>Ilustração didática · valores e posições de exemplo.</figcaption></figure>}
      {lesson.id === "clorofila" && <div className="help-comparison"><article><span>01 · SATÉLITE</span><h2>O que foi observado</h2><p>Estima a clorofila pela cor da água na superfície. Consulte a data: a leitura pode ser anterior ao dia de hoje.</p></article><article><span>02 · PREVISÃO</span><h2>O que pode acontecer</h2><p>O modelo combina cálculos e dados para prever a evolução. Cada valor representa uma área da grade e um período.</p></article></div>}
      <ol className="help-steps">{lesson.steps.map((step, index) => <li key={step}><span aria-hidden="true">{index + 1}</span><div><small>PASSO {index + 1}</small><p>{step}</p></div></li>)}</ol>
      <aside className="help-tip"><CircleHelp size={24} /><div><strong>Vale lembrar</strong><p>{lesson.tip}</p></div></aside>
      {lesson.id === "clorofila" && <div className="help-deeper"><h2>Exemplo: 3,2 no satélite e 0,9 na previsão</h2><p>São números fictícios para entender a diferença. Uma mancha mais concentrada, datas diferentes e a grade do modelo podem contribuir. Só esses dois números não provam a causa nem que os dois estejam corretos.</p><h3>Como decidir o que olhar?</h3><p>Para a mancha observada, veja o satélite e sua data. Para os próximos dias, acompanhe a previsão. Se a diferença parecer estranha, confira posição, fonte e horário antes de usar a informação.</p><h3>Leia a legenda, não só a cor</h3><p>mg/m³ quer dizer miligramas por metro cúbico. As cores dependem da escala do mapa. Não existe uma cor que garanta peixe.</p><p className="help-source">Referência do modelo: <a href="https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_BGC_001_028/description" target="_blank" rel="noreferrer">Copernicus Marine · descrição e qualidade do produto</a>.</p></div>}
      <div className="help-actions"><button className="help-primary" onClick={() => { stop(); onNavigate(lesson.target); }}>Abrir {lesson.target} <ArrowRight size={18} /></button><button aria-pressed={completed.includes(lesson.id)} onClick={() => setCompleted(old => old.includes(lesson.id) ? old.filter(id => id !== lesson.id) : [...old, lesson.id])}><Check size={18} /> {completed.includes(lesson.id) ? "Entendi este tutorial" : "Marcar como entendido"}</button></div>
      <p className="help-audio-note">As marcações valem enquanto esta página estiver aberta.</p>
      <nav className="help-next" aria-label="Continuar aprendendo">{helpLessons.indexOf(lesson) > 0 && <button onClick={() => open(helpLessons[helpLessons.indexOf(lesson) - 1].id)}>← Tutorial anterior</button>}{helpLessons.indexOf(lesson) < helpLessons.length - 1 && <button onClick={() => open(helpLessons[helpLessons.indexOf(lesson) + 1].id)}>Próximo tutorial →</button>}</nav>
    </> : <>
      <div className="help-start"><button onClick={() => open("primeiros-passos")}><BookOpen /><span><strong>É sua primeira vez?</strong><small>Comece pelo barco e pela viagem</small></span><ArrowRight /></button><button onClick={() => open("clorofila")}><CircleHelp /><span><strong>Clorofila está diferente?</strong><small>Entenda satélite e previsão</small></span><ArrowRight /></button></div>
      <label className="help-search"><Search size={22} /><span className="help-sr-only">Buscar tutorial</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="O que você quer aprender? Ex.: GPS, rota, clorofila" type="search" /></label>
      <div className="help-categories" aria-label="Filtrar tutoriais">{categories.map(item => <button key={item} aria-pressed={category === item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <p className="help-count" aria-live="polite">{results.length} tutoriais encontrados · toque para abrir</p>
      <div className="help-grid">{results.map(item => <button key={item.id} onClick={() => open(item.id)}><small>{item.category}</small><h2>{item.title}</h2><p>{item.intro}</p><span>Ver os 4 passos <ArrowRight size={17} /></span></button>)}</div>
      {!results.length && <div className="help-empty"><h2>Nenhum tutorial encontrado</h2><p>Tente uma palavra simples, como “barco”, “vento” ou “PDF”.</p><button onClick={() => { setQuery(""); setCategory("Todos"); }}>Mostrar todos</button></div>}
    </>}
  </section>;
}
const visualDescriptions: Record<string, string> = {
  viagem: "Sequência: cadastrar embarcação, iniciar viagem, registrar largadas e conferir capturas.",
  dashboard: "Resumo de uma viagem com total registrado, meta e capturas separadas por tipo.",
  capturas: "Exemplo: 600 kg de corvina, 40 kg de mistura e 10 kg de descarte, separados por tipo.",
  posicao: "254719 significa 25 graus e 47,19 minutos sul. 480296 significa 48 graus e 02,96 minutos oeste.",
  clorofila: "Satélite: estimativa na data observada. Modelo: previsão para os próximos dias. Confira data, posição e legenda; a previsão pode ser maior ou menor.",
  ais: "Barco, ponto salvo e linha de navegação. Confira data da posição, destino e distância.",
  rota: "Uma rota liga os pontos 1, 2 e 3 na ordem. Revise os trechos antes de iniciar.",
};
