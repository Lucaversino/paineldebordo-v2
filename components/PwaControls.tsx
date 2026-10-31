"use client";

import { Download, Share2, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "painel-pwa-install-dismissed-v268";
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export default function PwaControls({ login = false }: { login?: boolean }) {
  const [pendingPrompt, setPendingPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [ios, setIos] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inSafari, setInSafari] = useState(false);
  const [secure, setSecure] = useState(true);

  useEffect(() => {
    const ua = navigator.userAgent;
    const apple = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const phone = apple || /Android/i.test(ua);
    const standalone = isStandalone();
    setIos(apple);
    setMobile(phone);
    setInstalled(standalone);
    setSecure(window.isSecureContext);
    setInSafari(apple && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua));

    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
        reg.update().catch(() => undefined);
      }).catch(() => undefined);
    }

    const allowed = () => sessionStorage.getItem(DISMISS_KEY) !== "1";
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPendingPrompt(event as InstallPromptEvent);
      if (!standalone && phone && allowed()) setShowInvite(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPendingPrompt(null);
      setShowGuide(false);
      setShowInvite(false);
    };
    const onDisplayChange = () => {
      if (isStandalone()) onInstalled();
    };
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener?.("change", onDisplayChange);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (apple && !standalone && allowed()) {
      const id = window.setTimeout(() => setShowInvite(true), 1700);
      return () => { window.clearTimeout(id); media.removeEventListener?.("change", onDisplayChange); window.removeEventListener("beforeinstallprompt", onInstallPrompt); window.removeEventListener("appinstalled", onInstalled); };
    }
    return () => { media.removeEventListener?.("change", onDisplayChange); window.removeEventListener("beforeinstallprompt", onInstallPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  async function install() {
    setShowInvite(false);
    if (ios || !pendingPrompt) { setShowGuide(true); return; }
    const event = pendingPrompt;
    setPendingPrompt(null);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "dismissed") sessionStorage.setItem(DISMISS_KEY, "1");
    } catch { setShowGuide(true); }
  }
  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setShowInvite(false);
  }
  const canInstall = !installed && mobile;

  return <>
    <div className={login ? "pwa-actions login-pwa" : "pwa-actions"}>
      {canInstall && <button type="button" className="pwa-button" onClick={install} aria-label="Instalar Painel de Bordo"><Download /><span>INSTALAR APP</span></button>}
    </div>
    {canInstall && showInvite && <div className="pwa-install-toast" role="dialog" aria-label="Instalar Painel de Bordo">
      <button className="pwa-toast-close" onClick={dismiss} type="button" aria-label="Não mostrar nesta sessão"><X /></button>
      <div className="pwa-toast-icon"><Download /></div>
      <div><b>Instalar Painel de Bordo</b><span>Abra o painel direto pela tela inicial do celular.</span></div>
      <button className="pwa-toast-action" type="button" onClick={install}>INSTALAR</button>
    </div>}
    {showGuide && <div className="pwa-overlay" onClick={() => setShowGuide(false)}>
      <section className="pwa-guide" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" onClick={e => e.stopPropagation()}>
        <button type="button" className="pwa-close" onClick={() => setShowGuide(false)} aria-label="Fechar"><X /></button>
        <div className="pwa-guide-icon"><SquarePlus /></div>
        <small>{ios ? "IPHONE / IPAD" : "ANDROID"}</small>
        <h2 id="install-guide-title">Adicionar à tela de início</h2>
        {!secure && <p>Abra o endereço HTTPS do Painel de Bordo para habilitar a instalação.</p>}
        {ios ? <>
          {!inSafari && <p>Para instalar, abra este endereço no Safari. Navegadores internos de aplicativos podem impedir a opção.</p>}
          <ol><li>Abra o Painel de Bordo no <b>Safari</b>.</li><li>Toque em <Share2 /> <b>Compartilhar</b> (ou no menu do Safari).</li><li>Escolha <SquarePlus /> <b>Adicionar à Tela de Início</b>.</li><li>Confirme em <b>Adicionar</b>.</li></ol>
        </> : <ol><li>Abra o site no <b>Chrome</b> do Android.</li><li>Abra o menu <b>⋮</b> do navegador.</li><li>Toque em <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</li><li>Confirme a instalação.</li></ol>}
        <button type="button" className="pwa-understood" onClick={() => setShowGuide(false)}>ENTENDI</button>
      </section>
    </div>}
  </>;
}
