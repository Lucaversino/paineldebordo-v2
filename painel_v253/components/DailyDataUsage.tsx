"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronDown, ChevronUp, Database, Gauge, Satellite, Wifi } from "lucide-react";

const STARLINK_PRICE_PER_GB = 12.5;
const STORAGE_KEY = "painel:data-usage:v1";
const GB_BYTES = 1_000_000_000;
const MB_BYTES = 1_000_000;

type StoredUsage = Record<string, number>;

function dayKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function readUsage(): StoredUsage {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeUsage(usage: StoredUsage) {
  try {
    const keys = Object.keys(usage).sort().slice(-31);
    const compact: StoredUsage = {};
    keys.forEach((key) => {
      compact[key] = Math.max(0, Number(usage[key] || 0));
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
  } catch {
    // O medidor é informativo e nunca deve bloquear o painel.
  }
}

function formatData(bytes: number) {
  const safe = Math.max(0, Number(bytes || 0));
  if (safe >= GB_BYTES) {
    return {
      value: (safe / GB_BYTES).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      unit: "GB",
    };
  }
  return {
    value: (safe / MB_BYTES).toLocaleString("pt-BR", { minimumFractionDigits: safe >= 10_000_000 ? 1 : 2, maximumFractionDigits: 2 }),
    unit: "MB",
  };
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function entryBytes(entry: PerformanceEntry) {
  const timing = entry as PerformanceResourceTiming;
  const transfer = Number(timing.transferSize || 0);
  if (Number.isFinite(transfer) && transfer > 0) return transfer;

  // Para a navegação principal alguns navegadores informam apenas o tamanho codificado.
  if (entry.entryType === "navigation") {
    const encoded = Number(timing.encodedBodySize || 0);
    return Number.isFinite(encoded) && encoded > 0 ? encoded : 0;
  }
  return 0;
}

export default function DailyDataUsage() {
  const [todayBytes, setTodayBytes] = useState(0);
  const [sessionBytes, setSessionBytes] = useState(0);
  const [supported, setSupported] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const seen = useRef(new Set<string>());
  const currentDay = useRef(dayKey());

  useEffect(() => {
    const initial = readUsage();
    setTodayBytes(Number(initial[currentDay.current] || 0));

    if (typeof performance === "undefined" || typeof PerformanceObserver === "undefined") {
      setSupported(false);
      return;
    }

    const addEntry = (entry: PerformanceEntry) => {
      const key = `${entry.entryType}|${entry.name}|${entry.startTime.toFixed(3)}|${entry.duration.toFixed(3)}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);

      const bytes = entryBytes(entry);
      if (!bytes) return;

      const today = dayKey();
      if (today !== currentDay.current) {
        currentDay.current = today;
        setTodayBytes(0);
        setSessionBytes(0);
        seen.current.clear();
      }

      setSessionBytes((value) => value + bytes);
      setTodayBytes((value) => {
        const next = value + bytes;
        const usage = readUsage();
        usage[today] = next;
        writeUsage(usage);
        return next;
      });
    };

    performance.getEntriesByType("navigation").forEach(addEntry);
    performance.getEntriesByType("resource").forEach(addEntry);

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        list.getEntries().forEach(addEntry);
      });
      observer.observe({ entryTypes: ["resource"] });
    } catch {
      setSupported(false);
    }

    const midnightCheck = window.setInterval(() => {
      const today = dayKey();
      if (today !== currentDay.current) {
        currentDay.current = today;
        seen.current.clear();
        setTodayBytes(Number(readUsage()[today] || 0));
        setSessionBytes(0);
      }
    }, 60_000);

    return () => {
      observer?.disconnect();
      window.clearInterval(midnightCheck);
    };
  }, []);

  const today = useMemo(() => formatData(todayBytes), [todayBytes]);
  const session = useMemo(() => formatData(sessionBytes), [sessionBytes]);
  const costToday = (todayBytes / GB_BYTES) * STARLINK_PRICE_PER_GB;
  const costPer100Mb = STARLINK_PRICE_PER_GB / 10;
  const gbPercent = Math.min(100, (todayBytes / GB_BYTES) * 100);

  return (
    <section className={`daily-data-usage ${expanded ? "expanded" : "collapsed"}`} aria-label="Consumo diário de dados do Painel de Bordo">
      <button
        type="button"
        className="daily-data-summary"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="daily-data-summary-icon"><Satellite /></span>
        <span className="daily-data-summary-label">
          <small>STARLINK</small>
          <b>Internet hoje</b>
        </span>
        <span className="daily-data-summary-metric">
          <small>DADOS</small>
          <b>{today.value} <em>{today.unit}</em></b>
        </span>
        <span className="daily-data-summary-metric cost">
          <small>CUSTO</small>
          <b>{formatBrl(costToday)}</b>
        </span>
        <span className="daily-data-summary-rate">R$ 12,50/GB</span>
        <span className="daily-data-summary-toggle">{expanded ? <ChevronUp /> : <ChevronDown />}</span>
      </button>

      {expanded && (
        <div className="daily-data-details">
          <div className="daily-data-grid">
            <article className="primary">
              <Database />
              <span><small>USADO HOJE</small><b>{today.value} <em>{today.unit}</em></b><i>Acumulado desde 00:00</i></span>
            </article>
            <article className="cost">
              <Activity />
              <span><small>CUSTO HOJE</small><b>{formatBrl(costToday)}</b><i>Calculado a R$ 12,50/GB</i></span>
            </article>
            <article>
              <Gauge />
              <span><small>ESTA SESSÃO</small><b>{session.value} <em>{session.unit}</em></b><i>Desde que abriu o painel</i></span>
            </article>
            <article>
              <Wifi />
              <span><small>CUSTO A CADA 100 MB</small><b>{formatBrl(costPer100Mb)}</b><i>Referência rápida</i></span>
            </article>
          </div>

          <div className="daily-data-progress">
            <div><span style={{ width: `${gbPercent}%` }} /></div>
            <small>{todayBytes < GB_BYTES ? `${(1000 - todayBytes / MB_BYTES).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB até 1 GB` : `${(todayBytes / GB_BYTES).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB usados hoje`}</small>
          </div>

          <div className="daily-data-note">
            <span>{supported ? "MEDIÇÃO ATIVA" : "MEDIÇÃO LIMITADA"}</span>
            <p>Mede somente o tráfego do Painel de Bordo neste aparelho, não o consumo total da Starlink.</p>
          </div>
        </div>
      )}
    </section>
  );
}
