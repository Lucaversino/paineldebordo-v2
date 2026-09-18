"use client";

import { useEffect, useState } from "react";
import { CreditCard, LoaderCircle, RefreshCw, WalletCards } from "lucide-react";

type Billing = {
  wallet: { balance: number; freeAisAccess?: boolean; freeAiAccess?: boolean; isSuperAdmin?: boolean };
  settings: { creditUnitPrice: number; aisSingleCredits: number; aisUpdateCredits: number; aiBasicCredits: number; aiFullCredits: number; aiAdvancedCredits: number };
  packages: Array<{ credits: number; amountBrl: number }>;
  transactions: Array<{ id: number; delta: number; balanceAfter: number; kind: string; description: string; amountBrl?: number | null; createdAt: string }>;
};

function brl(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0); }
function when(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR"); }

export default function CreditsPage() {
  const [data, setData] = useState<Billing | null>(null);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/billing", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result?.error || "Não foi possível carregar os créditos.");
      setData(result);
      if (result?.wallet && Number.isFinite(Number(result.wallet.balance))) window.dispatchEvent(new CustomEvent("painel-billing-changed", { detail: { balance: Number(result.wallet.balance) } }));
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      setError(timedOut ? "A carteira demorou para responder. Tente novamente." : cause instanceof Error ? cause.message : "Não foi possível carregar os créditos.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    try {
      const status = new URLSearchParams(window.location.search).get("payment") || "";
      setPaymentStatus(status);
      if (status === "success" || status === "pending") {
        const timers = [1800, 4500, 8000].map((ms) => window.setTimeout(() => void load(), ms));
        return () => timers.forEach((timer) => window.clearTimeout(timer));
      }
    } catch {}
  }, []);

  async function buy(credits: number) {
    setBuying(credits); setError("");
    try {
      const response = await fetch("/api/payments/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credits }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Não foi possível iniciar o pagamento.");
      window.location.href = result.checkoutUrl;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao iniciar pagamento."); setBuying(null); }
  }

  if (!data) return <section className="credits-page"><div className="credits-loading">{loading ? <><LoaderCircle className="spin" /> Carregando carteira...</> : <><WalletCards /> Carteira indisponível</>}</div>{error && <div className="credits-error">{error}<button type="button" onClick={() => void load()}><RefreshCw /> Tentar novamente</button></div>}</section>;
  const equivalent = data.wallet.balance * data.settings.creditUnitPrice;
  return <section className="credits-page">
    <div className="credits-head"><div><small>CARTEIRA ÚNICA</small><h2>Meus créditos</h2><p>AIS e Painel IA usam a mesma carteira.</p></div><button type="button" onClick={load}><RefreshCw /> Atualizar</button></div>
    {paymentStatus && <div className={`credits-payment-status ${paymentStatus}`}>{paymentStatus === "success" ? "Pagamento recebido pelo Mercado Pago. Aguardando/confirmação do webhook para liberar os créditos." : paymentStatus === "pending" ? "Pagamento pendente. Os créditos serão liberados somente após a confirmação do Mercado Pago." : "Pagamento não concluído. Nenhum crédito foi adicionado."}</div>}
    <article className="credits-balance"><WalletCards /><div><span>Saldo atual</span><b>{data.wallet.isSuperAdmin ? "GRÁTIS — ADMIN" : `${data.wallet.balance} créditos`}</b>{!data.wallet.isSuperAdmin && <em>Equivalente: {brl(equivalent)}</em>}</div></article>
    <div className="credits-services">
      <article><b>Consulta AIS</b><span>{data.wallet.freeAisAccess ? "GRÁTIS — ADMIN" : `${data.settings.aisSingleCredits} créditos`}</span><small>Localizar um barco</small></article>
      <article><b>Atualizar AIS</b><span>{data.wallet.freeAisAccess ? "GRÁTIS — ADMIN" : `${data.settings.aisUpdateCredits} créditos`}</span><small>Nova posição</small></article>
      <article><b>Pergunta IA</b><span>{data.wallet.freeAiAccess ? "GRÁTIS — ADMIN" : `${data.settings.aiBasicCredits} crédito(s)`}</span><small>Pergunta simples</small></article>
      <article><b>Análise completa</b><span>{data.wallet.freeAiAccess ? "GRÁTIS — ADMIN" : `${data.settings.aiFullCredits} créditos`}</span><small>Viagem e largadas</small></article>
      <article><b>Análise avançada</b><span>{data.wallet.freeAiAccess ? "GRÁTIS — ADMIN" : `${data.settings.aiAdvancedCredits} créditos`}</span><small>Histórico + ambiente</small></article>
    </div>
    {!data.wallet.isSuperAdmin && <><h3 className="credits-section-title">Comprar créditos</h3><div className="credits-packages">{data.packages.map((pack) => <button key={pack.credits} type="button" onClick={() => buy(pack.credits)} disabled={buying != null}><CreditCard /><b>{pack.credits} CRÉDITOS</b><span>{brl(pack.amountBrl)}</span>{buying === pack.credits && <LoaderCircle className="spin" />}</button>)}</div></>}
    {error && <div className="credits-error">{error}</div>}
    <div className="credits-statement"><div className="credits-statement-head"><div><small>MOVIMENTAÇÃO</small><h3>Extrato de créditos</h3></div></div>{data.transactions.length ? data.transactions.map((item) => <article key={item.id}><div><b>{item.description}</b><small>{when(item.createdAt)}</small></div><div className={item.delta >= 0 ? "plus" : "minus"}>{item.delta >= 0 ? "+" : ""}{item.delta} créditos<small>Saldo: {item.balanceAfter}</small></div></article>) : <p>Nenhuma movimentação ainda.</p>}</div>
  </section>;
}
