"use client";
import { useState } from "react";
import { AlertTriangle, FileDown, Share2, X } from "lucide-react";

type Props = { trip: any; onClose: () => void; onFinished: () => void };
export default function FinishTripDialog({ trip, onClose, onFinished }: Props) {
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  async function finish() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/manage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "finish", id: trip.id }) });
      const result = await r.json().catch(() => ({}));
      if (!r.ok || !result.ok) throw new Error(result.error || "Não foi possível finalizar a viagem.");
      setFinished(true);
      onFinished();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao finalizar viagem."); }
    finally { setBusy(false); }
  }
  async function prepareFile(): Promise<File> {
    if (file) return file;
    const r = await fetch("/api/manage", { cache: "no-store" });
    if (!r.ok) throw new Error("Não foi possível carregar os dados atualizados.");
    const data = await r.json();
    const latestTrip = data.trips?.find((t: any) => Number(t.id) === Number(trip.id));
    if (!latestTrip || latestTrip.status !== "FINISHED") throw new Error("A viagem ainda não está finalizada no servidor.");
    const { generateTripPdf } = await import("../lib/tripPdf");
    const result = generateTripPdf(latestTrip, data.sets || [], data.catches || [], false);
    setFile(result);
    return result;
  }
  async function download() {
    setBusy(true); setError("");
    try {
      const pdf = await prepareFile();
      const url = URL.createObjectURL(pdf);
      const a = document.createElement("a"); a.href = url; a.download = pdf.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao gerar PDF."); }
    finally { setBusy(false); }
  }
  async function share() {
    setBusy(true); setError("");
    try {
      const pdf = await prepareFile();
      if (navigator.canShare?.({ files: [pdf] }) && navigator.share) {
        await navigator.share({ files: [pdf] });
      } else {
        const url = URL.createObjectURL(pdf);
        const a = document.createElement("a"); a.href = url; a.download = pdf.name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
        setError("PDF baixado. Anexe manualmente o arquivo na conversa do WhatsApp Web.");
      }
    } catch (e) { if (!(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Falha no compartilhamento."); }
    finally { setBusy(false); }
  }
  return <div className="overlay finish-trip-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="modal form finish-trip-dialog" role="dialog" aria-modal="true" aria-label="Finalizar viagem" onMouseDown={(e) => e.stopPropagation()}>
      <button type="button" className="modalx" onClick={onClose} disabled={busy}><X /></button>
      <span className="finish-trip-alert"><AlertTriangle size={22}/>{finished ? "VIAGEM FINALIZADA" : "CONFIRMAÇÃO DE ENCERRAMENTO"}</span>
      <h2>{trip.name}</h2>
      {!finished ? <><p>Tem certeza que deseja finalizar esta viagem? Ela sairá da lista de viagens em andamento e será arquivada no histórico. Confirme apenas após registrar as capturas e largadas.</p>
        <div className="finish-trip-buttons"><button type="button" className="editbtn" onClick={onClose} disabled={busy}>Cancelar</button><button type="button" className="finish-trip-danger" onClick={finish} disabled={busy}>{busy ? "Finalizando..." : "Sim, finalizar viagem"}</button></div>
      </> : <><p>Finalização confirmada no servidor. Agora você pode exportar o relatório final em PDF ou compartilhar pelo WhatsApp.</p>
        <div className="finish-trip-buttons"><button type="button" className="editbtn" onClick={download} disabled={busy}><FileDown size={17}/> Baixar PDF</button><button type="button" className="editbtn" onClick={share} disabled={busy}><Share2 size={17}/> WhatsApp</button></div>
        <button type="button" className="editbtn" onClick={onClose}>Fechar</button>
      </>}
      {error && <p role="status" className="finish-trip-error">{error}</p>}
    </div>
  </div>;
}
