"use client";

import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

type VesselFinderPageProps = {
  defaultLat?: number;
  defaultLon?: number;
};

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
    <section className="relative m-0 h-[calc(100dvh-76px)] w-full max-w-none overflow-hidden bg-slate-950 p-0">
      <iframe
        key={reloadKey}
        src={frameSrc}
        title="Mapa AIS VesselFinder"
        className="absolute inset-0 h-full w-full border-0"
        loading="eager"
        allowFullScreen
      />

      <button
        type="button"
        onClick={() => setReloadKey((value) => value + 1)}
        className="absolute right-3 top-3 z-10 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/25 bg-slate-950/85 px-3 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-slate-900"
        title="Recarregar mapa VesselFinder"
        aria-label="Recarregar mapa VesselFinder"
      >
        <RefreshCw className="h-4 w-4" />
        <span className="hidden sm:inline">Recarregar</span>
      </button>
    </section>
  );
}
