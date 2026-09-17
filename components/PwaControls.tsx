"use client";

import { Download, Share2, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaControls({ login = false }: { login?: boolean }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    navigator.serviceWorker?.register("/sw.js").catch(() => undefined);

    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);

    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  async function install() {
    if (ios && !installed) {
      setShowIos(true);
      return;
    }
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setPrompt(null);
  }

  const canInstall = !installed && (Boolean(prompt) || ios);
  return (
    <>
      <div className={login ? "pwa-actions login-pwa" : "pwa-actions"}>
        {canInstall && (
          <button type="button" className="pwa-button" onClick={install}>
            <Download /> <span>{ios ? "CRIAR ATALHO" : "INSTALAR APP"}</span>
          </button>
        )}
      </div>
      {showIos && (
        <div className="pwa-overlay" onClick={() => setShowIos(false)}>
          <section className="pwa-guide" onClick={(event) => event.stopPropagation()}>
            <button className="pwa-close" onClick={() => setShowIos(false)} aria-label="Fechar"><X /></button>
            <div className="pwa-guide-icon"><SquarePlus /></div>
            <small>IPHONE E IPAD</small>
            <h2>Adicionar à Tela de Início</h2>
            <ol>
              <li>Abra este site pelo <b>Safari</b>.</li>
              <li>Toque no botão <Share2 /> <b>Compartilhar</b>.</li>
              <li>Escolha <SquarePlus /> <b>Adicionar à Tela de Início</b>.</li>
              <li>Toque em <b>Adicionar</b>.</li>
            </ol>
            <button className="pwa-understood" onClick={() => setShowIos(false)}>ENTENDI</button>
          </section>
        </div>
      )}
    </>
  );
}
