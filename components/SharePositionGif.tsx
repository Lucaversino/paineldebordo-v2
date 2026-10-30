"use client";

import { useState } from "react";
import { Download, MapPin, Share2 } from "lucide-react";

type Position = { latitude: number; longitude: number; accuracy: number; timestamp: number };

function coordinate(value: number) {
  // Formato náutico DDDº MMmm: minutos inteiros e dois decimais, sem S/W.
  // Arredondar em centésimos de minuto ANTES de separar evita 60,00 minutos.
  const totalHundredths = Math.round(Math.abs(value) * 60 * 100);
  const degrees = Math.floor(totalHundredths / 6000);
  const minutesHundredths = totalHundredths % 6000;
  return `${String(degrees).padStart(2, "0")}º ${String(minutesHundredths).padStart(4, "0")}`;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

async function createPositionGif(position: Position, boatName: string): Promise<Blob> {
  // Importação sob demanda: o codificador só é carregado ao compartilhar.
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 600;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Seu navegador não permite criar o GIF.");
  const logo = new Image();
  logo.src = "/icon-192.png";
  await new Promise<void>((resolve) => { logo.onload = () => resolve(); logo.onerror = () => resolve(); });
  const gif = GIFEncoder();
  const lat = coordinate(position.latitude);
  const lon = coordinate(position.longitude);
  const time = new Date(position.timestamp).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  for (let frame = 0; frame < 10; frame++) {
    const pulse = frame / 9;
    const background = ctx.createLinearGradient(0, 0, 600, 600);
    background.addColorStop(0, "#06242d"); background.addColorStop(1, "#061318");
    ctx.fillStyle = background; ctx.fillRect(0, 0, 600, 600);
    ctx.strokeStyle = "rgba(32,195,165,.12)"; ctx.lineWidth = 1;
    for (let x = 0; x < 600; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 600); ctx.stroke(); }
    for (let y = 0; y < 600; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(600, y); ctx.stroke(); }
    roundedRect(ctx, 30, 26, 540, 88, 20, "#0d353d");
    if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, 47, 38, 62, 62);
    ctx.fillStyle = "#f3ffff"; ctx.font = "bold 24px Arial"; ctx.fillText("PAINEL DE BORDO", 122, 69);
    ctx.fillStyle = "#54cbb8"; ctx.font = "bold 14px Arial"; ctx.fillText("PESCA INDUSTRIAL  •  POSIÇÃO GPS", 123, 92);
    ctx.fillStyle = "#f5fffe"; ctx.textAlign = "center"; ctx.font = "bold 26px Arial";
    ctx.fillText(boatName.slice(0, 30) || "MINHA EMBARCAÇÃO", 300, 167);
    const centerX = 300, centerY = 283;
    ctx.strokeStyle = `rgba(31,211,170,${0.65 - pulse * .55})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(centerX, centerY, 30 + pulse * 90, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#20cda7"; ctx.beginPath(); ctx.arc(centerX, centerY, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(centerX, centerY, 7, 0, Math.PI * 2); ctx.fill();
    roundedRect(ctx, 32, 365, 536, 192, 22, "#0c3038");
    ctx.textAlign = "center";
    ctx.fillStyle = "#69daca"; ctx.font = "bold 16px Arial"; ctx.fillText("LATITUDE", 300, 391);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 65px Arial"; ctx.fillText(lat, 300, 452);
    ctx.fillStyle = "#69daca"; ctx.font = "bold 16px Arial"; ctx.fillText("LONGITUDE", 300, 485);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 65px Arial"; ctx.fillText(lon, 300, 547);
    ctx.fillStyle = "#9fc4c6"; ctx.textAlign = "center"; ctx.font = "14px Arial";
    ctx.fillText(`GPS ${time}  •  precisão aprox. ${Math.round(position.accuracy)} m`, 300, 587);
    const rgba = ctx.getImageData(0, 0, 600, 600).data;
    const palette = quantize(rgba, 128);
    const indexed = applyPalette(rgba, palette);
    gif.writeFrame(indexed, 600, 600, { palette, delay: 120 });
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}

export default function SharePositionGif({ boatName = "" }: { boatName?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<{ blob: Blob; url: string } | null>(null);

  async function generate() {
    setBusy(true); setError("");
    try {
      if (!window.isSecureContext || !navigator.geolocation) throw new Error("O GPS exige HTTPS e permissão de localização no navegador.");
      const current = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
      const pos: Position = { latitude: current.coords.latitude, longitude: current.coords.longitude, accuracy: current.coords.accuracy, timestamp: current.timestamp };
      const blob = await createPositionGif(pos, boatName);
      const url = URL.createObjectURL(blob);
      setPrepared((previous) => { if (previous) URL.revokeObjectURL(previous.url); return { blob, url }; });
    } catch (err) {
      if (err instanceof GeolocationPositionError) setError(err.code === 1 ? "Localização negada. Permita o GPS nas configurações do navegador." : err.code === 3 ? "O GPS demorou demais. Verifique o sinal e tente novamente." : "Não foi possível obter a posição atual.");
      else setError(err instanceof Error ? err.message : "Não foi possível criar o GIF.");
    } finally { setBusy(false); }
  }

  async function share() {
    if (!prepared) return;
    const file = new File([prepared.blob], "painel-de-bordo-posicao.gif", { type: "image/gif" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        // Somente o arquivo: sem title, text, URL, legenda ou link.
        await navigator.share({ files: [file] });
        return;
      } catch (err) { if ((err as Error)?.name === "AbortError") return; }
    }
    // O WhatsApp Web não fornece API pública para anexar arquivo pelo navegador.
    // Fazemos download e abrimos a conversa SEM texto pré-preenchido.
    download();
    window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
  }

  function download() {
    if (!prepared) return;
    const a = document.createElement("a"); a.href = prepared.url; a.download = "painel-de-bordo-posicao.gif"; document.body.appendChild(a); a.click(); a.remove();
  }

  return <div className="share-position-gif">
    <div className="share-position-heading"><MapPin size={19} /><div><small>COMPARTILHAR LOCALIZAÇÃO</small><b>Minha posição atual em GIF</b></div></div>
    <p>Gere um GIF animado com a logo do Painel de Bordo, coordenadas grandes no formato 31º 4615 / 51º 0245 e horário do GPS. Sua posição só será obtida ao clicar no botão.</p>
    <div className="share-position-actions">
      <button type="button" onClick={generate} disabled={busy}><MapPin size={17} />{busy ? "Obtendo GPS e criando GIF..." : "Gerar GIF da minha posição"}</button>
      {prepared && <><button type="button" onClick={share}><Share2 size={17} /> Compartilhar no WhatsApp</button><button type="button" onClick={download}><Download size={17} /> Baixar GIF</button></>}
    </div>
    {prepared && <p className="share-position-ready">GIF pronto. Confira as coordenadas antes de enviar. Compartilhe apenas o GIF, sem legenda nem link. No computador, anexe manualmente o GIF baixado na conversa do WhatsApp Web.</p>}
    {error && <p className="share-position-error" role="alert">{error}</p>}
    <small className="share-position-privacy">Atenção: ao compartilhar, outras pessoas poderão ver sua localização exata. Precisão sujeita ao sinal do GPS.</small>
  </div>;
}
