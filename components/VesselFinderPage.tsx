"use client";

import { ExternalLink, RefreshCw, Ship } from "lucide-react";
import { useMemo, useState } from "react";

type VesselFinderPageProps = {
  defaultLat?: number;
  defaultLon?: number;
};

const VESSELFINDER_URL = "https://www.vesselfinder.com/";

function safeCoordinate(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export default function VesselFinderPage({
  defaultLat,
  defaultLon,
}: VesselFinderPageProps) {
  const [reloadKey, setReloadKey] = useState(0);

  const latitude = safeCoordinate(defaultLat, -27.15);
  const longitude = safeCoordinate(defaultLon, -48.55);

  const frameSrc = useMemo(() => {
    const params = new URLSearchParams({
      lat: latitude.toFixed(6),
      lon: longitude.toFixed(6),
      zoom: "8",
      r: String(reloadKey),
    });
    return `/vesselfinder-map.html?${params.toString()}`;
  }, [latitude, longitude, reloadKey]);

  return (
    <section className="content">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-500">
              <Ship className="h-5 w-5" />
            </div>
            <div>
              <small className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Tráfego marítimo
              </small>
              <strong className="text-base">VesselFinder AIS</strong>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Centro: {latitude.toFixed(4)}°, {longitude.toFixed(4)}°
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold transition hover:bg-muted"
              title="Recarregar mapa VesselFinder"
            >
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </button>

            <button
              type="button"
              onClick={() => window.open(VESSELFINDER_URL, "_blank", "noopener,noreferrer")}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold transition hover:bg-muted"
              title="Abrir VesselFinder em nova aba"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir VesselFinder
            </button>
          </div>
        </div>

        <div className="relative min-h-[560px] bg-slate-950 md:min-h-[680px]">
          <iframe
            key={reloadKey}
            src={frameSrc}
            title="Mapa AIS VesselFinder"
            className="absolute inset-0 h-full w-full border-0"
            loading="eager"
            allowFullScreen
          />
        </div>

        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Mapa AIS incorporado pelo recurso oficial de embed do VesselFinder.
        </div>
      </div>
    </section>
  );
}
