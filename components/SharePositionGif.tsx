"use client";

import { useState } from "react";
import { Download, MapPin, Share2 } from "lucide-react";

type Position = { latitude: number; longitude: number; accuracy: number; timestamp: number };

function coordinate(value: number, positive: string, negative: string) {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  return `${String(degrees).padStart(2, "0")}° ${minutes.toFixed(4).replace(".", ",")}' ${value < 0 ? negative : positive}`;
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
  const lat = coordinate(position.latitude, "N", "S");
  const lon = coordinate(position.longitude, "L", "W");
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
    roundedRect(ctx, 39, 396, 522, 149, 22, "#0c3038");
    ctx.textAlign = "left"; ctx.fillStyle = "#69daca"; ctx.font = "bold 16px Arial"; ctx.fillText("LATITUDE", 62, 428);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 25px Arial"; ctx.fillText(lat, 62, 458);
    ctx.fillStyle = "#69daca"; ctx.font = "bold 16px Arial"; ctx.fillText("LONGITUDE", 62, 491);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 25px Arial"; ctx.fillText(lon, 62, 522);
    ctx.fillStyle = "#9fc4c6"; ctx.textAlign = "center"; ctx.font = "14px Arial";
    ctx.fillText(`GPS ${time}  •  precisão aprox. ${Math.round(position.accuracy)} m`, 300, 580);
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
  const [prepared, setPrepared] = useState<{ blob: Blob; url: string; text: string } | null>(null);

  async function generate() {
    setBusy(true); setError("");
    try {
      if (!window.isSecureContext || !navigator.geolocation) throw new Error("O GPS exige HTTPS e permissão de localização no navegador.");
      const current = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
      const pos: Position = { latitude: current.coords.latitude, longitude: current.coords.longitude, accuracy: current.coords.accuracy, timestamp: current.timestamp };
      const blob = await createPositionGif(pos, boatName);
      const url = URL.createObjectURL(blob);
      setPrepared((previous) => { if (previous) URL.revokeObjectURL(previous.url); return { blob, url, text: `📍 Minha posição GPS | ${boatName || "Painel de Bordo"}\n${coordinate(pos.latitude, "N", "S")} / ${coordinate(pos.longitude, "L", "W")}\nhttps://www.google.com/maps?q=${pos.latitude},${pos.longitude}\nAtualizado: ${new Date(pos.timestamp).toLocaleString("pt-BR")}` }; });
    } catch (err) {
      if (err instanceof GeolocationPositionError) setError(err.code === 1 ? "Localização negada. Permita o GPS nas configurações do navegador." : err.code === 3 ? "O GPS demorou demais. Verifique o sinal e tente novamente." : "Não foi possível obter a posição atual.");
      else setError(err instanceof Error ? err.message : "Não foi possível criar o GIF.");
    } finally { setBusy(false); }
  }

  async function share() {
    if (!prepared) return;
    const file = new File([prepared.blob], "painel-de-bordo-posicao.gif", { type: "image/gif" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Minha posição | Painel de Bordo", text: prepared.text }); return; }
      catch (err) { if ((err as Error)?.name === "AbortError") return; }
    }
    // Em desktops sem Web Share de arquivos, baixar o GIF e abrir o WhatsApp com as coordenadas.
    download();
    window.open(`https://wa.me/?text=${encodeURIComponent(prepared.text + "\nGIF salvo no dispositivo: anexe-o nesta conversa.")}`, "_blank", "noopener,noreferrer");
  }

  function download() {
    if (!prepared) return;
    const a = document.createElement("a"); a.href = prepared.url; a.download = "painel-de-bordo-posicao.gif"; document.body.appendChild(a); a.click(); a.remove();
  }

  return <div className="share-position-gif">
    <div className="share-position-heading"><MapPin size={19} /><div><small>COMPARTILHAR LOCALIZAÇÃO</small><b>Minha posição atual em GIF</b></div></div>
    <p>Gere um GIF animado com a logo do Painel de Bordo, coordenadas e horário do GPS. Sua posição só será obtida ao clicar no botão.</p>
    <div className="share-position-actions">
      <button type="button" onClick={generate} disabled={busy}><MapPin size={17} />{busy ? "Obtendo GPS e criando GIF..." : "Gerar GIF da minha posição"}</button>
      {prepared && <><button type="button" onClick={share}><Share2 size={17} /> Compartilhar no WhatsApp</button><button type="button" onClick={download}><Download size={17} /> Baixar GIF</button></>}
    </div>
    {prepared && <p className="share-position-ready">GIF pronto. Confira as coordenadas antes de enviar. No computador, o WhatsApp abrirá com o texto e você deverá anexar o GIF baixado.</p>}
    {error && <p className="share-position-error" role="alert">{error}</p>}
    <small className="share-position-privacy">Atenção: ao compartilhar, outras pessoas poderão ver sua localização exata. Precisão sujeita ao sinal do GPS.</small>
  </div>;
}
