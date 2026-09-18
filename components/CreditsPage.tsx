"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, Copy, LoaderCircle, QrCode, RefreshCw, WalletCards, X } from "lucide-react";

type Billing = {
  wallet: { balance: number; aiBonusBrl?: number; freeAisAccess?: boolean; freeAiAccess?: boolean; isSuperAdmin?: boolean };
  settings: { creditUnitPrice: number; aisSingleCredits: number; aisUpdateCredits: number; aiBasicCredits: number; aiFullCredits: number; aiAdvancedCredits: number; aiWelcomeBonusBrl?: number };
  packages: Array<{ credits: number; amountBrl: number }>;
  transactions: Array<{ id: number; delta: number; balanceAfter: number; kind: string; description: string; amountBrl?: number | null; createdAt: string }>;
};

type PixPayment = {
  paymentId: string;
  externalReference: string;
  status: string;
  credits: number;
  amountBrl: number;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string;
  expiresAt?: string | null;
  approved?: boolean;
};

function brl(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0); }
function when(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR"); }
function cpfDigits(value: string) { return value.replace(/\D/g, "").slice(0, 11); }
function cpfMask(value: string) {
  const d = cpfDigits(value);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export default function CreditsPage() {
  const [data, setData] = useState<Billing | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [selectedPack, setSelectedPack] = useState<{ credits: number; amountBrl: number } | null>(null);
  const [cpf, setCpf] = useState("");
  const [creatingPix, setCreatingPix] = useState(false);
  const [checkingPix, setCheckingPix] = useState(false);
  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [copied, setCopied] = useState(false);
  const [pixError, setPixError] = useState("");

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
    } catch {}
  }, []);

  async function generatePix() {
    if (!selectedPack) return;
    if (cpfDigits(cpf).length !== 11) { setPixError("Informe um CPF com 11 dígitos."); return; }
    setCreatingPix(true); setPixError(""); setCopied(false);
    try {
      const response = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credits: selectedPack.credits, cpf: cpfDigits(cpf) }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result?.error || "Não foi possível gerar o PIX.");
      setPixPayment({ ...result, approved: false });
    } catch (cause) {
      setPixError(cause instanceof Error ? cause.message : "Falha ao gerar o PIX.");
    } finally {
      setCreatingPix(false);
    }
  }

  async function checkPix() {
    if (!pixPayment?.paymentId || checkingPix || pixPayment.approved) return;
    setCheckingPix(true);
    try {
      const response = await fetch(`/api/payments/status?paymentId=${encodeURIComponent(pixPayment.paymentId)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result?.error || "Não foi possível verificar o PIX.");
      if (result?.approved) {
        setPixPayment((current) => current ? { ...current, status: "approved", approved: true } : current);
        setPaymentStatus("success");
        await load();
      } else {
        setPixPayment((current) => current ? { ...current, status: String(result?.status || current.status || "pending") } : current);
      }
    } catch (cause) {
      setPixError(cause instanceof Error ? cause.message : "Não foi possível verificar o PIX.");
    } finally {
      setCheckingPix(false);
    }
  }

  useEffect(() => {
    if (!pixPayment?.paymentId || pixPayment.approved) return;
    const timer = window.setInterval(() => void checkPix(), 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixPayment?.paymentId, pixPayment?.approved]);

  async function copyPix() {
    if (!pixPayment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixPayment.qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setPixError("Não foi possível copiar automaticamente. Selecione o código abaixo e copie manualmente.");
    }
  }

  function openPix(pack: { credits: number; amountBrl: number }) {
    setSelectedPack(pack); setPixPayment(null); setPixError(""); setCopied(false);
  }
  function closePix() {
    setSelectedPack(null); setPixPayment(null); setPixError(""); setCreatingPix(false); setCheckingPix(false); setCopied(false); setCpf("");
  }

  const pixStatusText = useMemo(() => {
    if (!pixPayment) return "";
    if (pixPayment.approved || pixPayment.status === "approved") return "Pagamento aprovado";
    if (["rejected", "cancelled", "refunded", "charged_back"].includes(String(pixPayment.status))) return "Pagamento não concluído";
    return "Aguardando pagamento";
  }, [pixPayment]);

  if (!data) return <section className="credits-page"><div className="credits-loading">{loading ? <><LoaderCircle className="spin" /> Carregando carteira...</> : <><WalletCards /> Carteira indisponível</>}</div>{error && <div className="credits-error">{error}<button type="button" onClick={() => void load()}><RefreshCw /> Tentar novamente</button></div>}</section>;
  const equivalent = data.wallet.balance * data.settings.creditUnitPrice;

  return <section className="credits-page">
    <div className="credits-head"><div><small>CARTEIRA AIS</small><h2>Meus créditos</h2><p>Os créditos são usados no AIS. O Painel IA V86 está livre e não desconta créditos.</p></div><button type="button" onClick={load}><RefreshCw /> Atualizar</button></div>
    {paymentStatus === "success" && <div className="credits-payment-status success">Pagamento PIX confirmado. Seus créditos foram atualizados.</div>}
    <article className="credits-balance"><WalletCards /><div><span>Saldo AIS</span><b>{`${data.wallet.balance} créditos`}</b><em>{data.wallet.isSuperAdmin ? "ADMIN · saldo inicial 80 créditos" : `Equivalente: ${brl(equivalent)}`}</em></div><div className="credits-ai-bonus"><small>PAINEL IA V86</small><b>GRÁTIS</b><span>Uso livre, sem consumir créditos da carteira.</span></div></article>
    <div className="credits-services">
      <article><b>Consulta AIS</b><span>{`${data.settings.aisSingleCredits} créditos`}</span><small>Localizar um barco</small></article>
      <article><b>Atualizar AIS</b><span>{`${data.settings.aisUpdateCredits} créditos`}</span><small>Nova posição</small></article>
      <article><b>Painel IA V86</b><span>GRÁTIS</span><small>Perguntas e análises sem desconto de créditos</small></article>
    </div>

    {!data.wallet.isSuperAdmin && <><div className="credits-section-heading"><div><h3 className="credits-section-title">Comprar créditos</h3><p>Pagamento somente por PIX. O QR Code e o Pix Copia e Cola aparecem aqui mesmo.</p></div><span><QrCode /> PIX</span></div><div className="credits-packages">{data.packages.map((pack) => <button key={pack.credits} type="button" onClick={() => openPix(pack)}><QrCode /><b>{pack.credits} CRÉDITOS</b><span>{brl(pack.amountBrl)}</span><small>PAGAR COM PIX</small></button>)}</div></>}
    {error && <div className="credits-error">{error}</div>}
    <div className="credits-statement"><div className="credits-statement-head"><div><small>MOVIMENTAÇÃO</small><h3>Extrato de créditos</h3></div></div>{data.transactions.length ? data.transactions.map((item) => <article key={item.id}><div><b>{item.description}</b><small>{when(item.createdAt)}</small></div><div className={item.delta > 0 ? "plus" : item.delta < 0 ? "minus" : "bonus"}>{item.kind === "ai_welcome_bonus" ? `${brl(Number(item.amountBrl || 0))} bônus IA` : item.kind === "ai_bonus_spend" ? `${brl(Math.abs(Number(item.amountBrl || 0)))} bônus usado` : <>{item.delta >= 0 ? "+" : ""}{item.delta} créditos</>}<small>Saldo: {item.balanceAfter}</small></div></article>) : <p>Nenhuma movimentação ainda.</p>}</div>

    {selectedPack && <div className="pix-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePix(); }}>
      <section className="pix-modal" role="dialog" aria-modal="true" aria-label="Pagamento por PIX">
        <button className="pix-modal-close" type="button" onClick={closePix} aria-label="Fechar"><X /></button>
        <div className="pix-modal-head"><div className="pix-modal-icon"><QrCode /></div><div><small>CHECKOUT PIX</small><h3>{selectedPack.credits} créditos</h3><b>{brl(selectedPack.amountBrl)}</b></div></div>

        {!pixPayment ? <>
          <div className="pix-cpf-box"><label htmlFor="pix-cpf">CPF do pagador</label><input id="pix-cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={cpfMask(cpf)} onChange={(event) => setCpf(cpfDigits(event.target.value))} /><small>O CPF é enviado diretamente ao Mercado Pago para gerar o PIX e não é salvo pelo Painel de Bordo.</small></div>
          {pixError && <div className="pix-error">{pixError}</div>}
          <button className="pix-generate" type="button" onClick={() => void generatePix()} disabled={creatingPix}>{creatingPix ? <><LoaderCircle className="spin" /> GERANDO PIX...</> : <><QrCode /> GERAR QR CODE PIX</>}</button>
        </> : <>
          <div className={`pix-status ${pixPayment.approved ? "approved" : "pending"}`}>{pixPayment.approved ? <BadgeCheck /> : <LoaderCircle className="spin" />}<div><b>{pixStatusText}</b><small>{pixPayment.approved ? `${pixPayment.credits} créditos adicionados à sua carteira.` : "Abra o banco, escaneie o QR Code ou use o Pix Copia e Cola."}</small></div></div>
          {!pixPayment.approved && <>
            <div className="pix-qr-wrap"><img src={`data:image/jpeg;base64,${pixPayment.qrCodeBase64}`} alt="QR Code PIX" /></div>
            <div className="pix-copy-box"><label>PIX COPIA E COLA</label><textarea readOnly value={pixPayment.qrCode} onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void copyPix()}>{copied ? <><Check /> COPIADO</> : <><Copy /> COPIAR CÓDIGO PIX</>}</button></div>
            <div className="pix-total"><span>Valor do PIX</span><b>{brl(pixPayment.amountBrl)}</b></div>
            {pixError && <div className="pix-error">{pixError}</div>}
            <button className="pix-check" type="button" onClick={() => void checkPix()} disabled={checkingPix}>{checkingPix ? <><LoaderCircle className="spin" /> VERIFICANDO...</> : <><RefreshCw /> JÁ PAGUEI · VERIFICAR AGORA</>}</button>
            <p className="pix-note">A liberação dos créditos só acontece depois que o Mercado Pago confirmar o pagamento como aprovado.</p>
          </>}
          {pixPayment.approved && <button className="pix-generate" type="button" onClick={closePix}><Check /> FECHAR E USAR CRÉDITOS</button>}
        </>}
      </section>
    </div>}
  </section>;
}
