"use client";

import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Home,
  RefreshCw,
  Ship,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const MARINE_TRAFFIC_URL =
  "https://www.marinetraffic.com/en/ais/home/centerx:3.7/centery:2.4/zoom:5";

type ElectronWebview = HTMLElement & {
  reload?: () => void;
  goBack?: () => void;
  goForward?: () => void;
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  loadURL?: (url: string) => Promise<void> | void;
  getURL?: () => string;
};

export default function MarineTrafficPage() {
  const webviewRef = useRef<ElectronWebview | null>(null);
  const [desktopWebView, setDesktopWebView] = useState(false);
  const [ready, setReady] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [status, setStatus] = useState("Carregando MarineTraffic...");

  const updateNavigation = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    try {
      setCanBack(Boolean(webview.canGoBack?.()));
      setCanForward(Boolean(webview.canGoForward?.()));
    } catch {
      setCanBack(false);
      setCanForward(false);
    }
  }, []);

  useEffect(() => {
    const enabled = Boolean((window as any).panelDesktop?.isElectron);
    setDesktopWebView(enabled);
    if (!enabled) setStatus("Abra esta aba pelo aplicativo Painel de Bordo WebView.");
  }, []);

  useEffect(() => {
    if (!desktopWebView) return;

    const webview = webviewRef.current;
    if (!webview) return;

    const onReady = () => {
      setReady(true);
      setStatus("");
      updateNavigation();
    };
    const onStart = () => {
      setStatus("Carregando MarineTraffic...");
      updateNavigation();
    };
    const onStop = () => {
      setStatus("");
      updateNavigation();
    };
    const onFail = (event: Event) => {
      const detail = event as Event & { errorCode?: number; errorDescription?: string };
      // -3 = navegação interrompida por outra navegação; não é erro real.
      if (detail.errorCode === -3) return;
      setStatus(
        detail.errorDescription
          ? `Não foi possível carregar: ${detail.errorDescription}`
          : "Não foi possível carregar o MarineTraffic."
      );
    };
    const onNavigate = () => updateNavigation();

    webview.addEventListener("dom-ready", onReady);
    webview.addEventListener("did-start-loading", onStart);
    webview.addEventListener("did-stop-loading", onStop);
    webview.addEventListener("did-fail-load", onFail);
    webview.addEventListener("did-navigate", onNavigate);
    webview.addEventListener("did-navigate-in-page", onNavigate);

    return () => {
      webview.removeEventListener("dom-ready", onReady);
      webview.removeEventListener("did-start-loading", onStart);
      webview.removeEventListener("did-stop-loading", onStop);
      webview.removeEventListener("did-fail-load", onFail);
      webview.removeEventListener("did-navigate", onNavigate);
      webview.removeEventListener("did-navigate-in-page", onNavigate);
    };
  }, [desktopWebView, updateNavigation]);

  const openOutside = () => {
    const bridge = (window as any).panelDesktop;
    if (bridge?.openExternal) {
      bridge.openExternal(MARINE_TRAFFIC_URL);
      return;
    }
    window.open(MARINE_TRAFFIC_URL, "_blank", "noopener,noreferrer");
  };

  const WebviewTag = "webview" as any;

  return (
    <section className="marine-traffic-page marine-webview-page">
      <div className="marine-traffic-toolbar marine-webview-toolbar">
        <div className="marine-traffic-title">
          <span><Ship /></span>
          <div>
            <small>NAVEGADOR MARÍTIMO</small>
            <b>MarineTraffic</b>
          </div>
        </div>

        <div className="marine-webview-nav" aria-label="Controles do navegador marítimo">
          <button
            type="button"
            onClick={() => webviewRef.current?.goBack?.()}
            disabled={!desktopWebView || !canBack}
            title="Voltar"
            aria-label="Voltar"
          >
            <ArrowLeft />
          </button>
          <button
            type="button"
            onClick={() => webviewRef.current?.goForward?.()}
            disabled={!desktopWebView || !canForward}
            title="Avançar"
            aria-label="Avançar"
          >
            <ArrowRight />
          </button>
          <button
            type="button"
            onClick={() => webviewRef.current?.reload?.()}
            disabled={!desktopWebView}
            title="Recarregar"
            aria-label="Recarregar"
          >
            <RefreshCw />
          </button>
          <button
            type="button"
            onClick={() => webviewRef.current?.loadURL?.(MARINE_TRAFFIC_URL)}
            disabled={!desktopWebView}
            title="Página inicial MarineTraffic"
            aria-label="Página inicial MarineTraffic"
          >
            <Home />
          </button>
          <button
            type="button"
            onClick={openOutside}
            title="Abrir no navegador padrão"
            aria-label="Abrir no navegador padrão"
          >
            <ExternalLink />
          </button>
        </div>
      </div>

      <div className="marine-traffic-frame-wrap marine-webview-wrap">
        {desktopWebView ? (
          <>
            <WebviewTag
              ref={webviewRef}
              className="marine-traffic-frame marine-electron-webview"
              src={MARINE_TRAFFIC_URL}
              partition="persist:marinetraffic"
              allowpopups="true"
            />
            {status ? (
              <div className={`marine-webview-status ${ready ? "is-overlay" : ""}`}>
                <RefreshCw className="spin" />
                <span>{status}</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="marine-webview-browser-fallback">
            <Ship />
            <strong>MarineTraffic em WebView</strong>
            <p>
              O WebView real funciona no aplicativo desktop do Painel de Bordo. No navegador comum,
              o MarineTraffic bloqueia a incorporação por iframe.
            </p>
            <button type="button" onClick={openOutside}>
              <ExternalLink /> Abrir MarineTraffic
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
