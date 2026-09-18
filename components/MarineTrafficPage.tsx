"use client";

import { ExternalLink, RefreshCw, Ship } from "lucide-react";
import { useState } from "react";

const MARINE_TRAFFIC_URL =
  "https://www.marinetraffic.com/en/ais/home/centerx:3.7/centery:2.4/zoom:5";

export default function MarineTrafficPage() {
  const [frameKey, setFrameKey] = useState(0);

  return (
    <section className="marine-traffic-page">
      <div className="marine-traffic-toolbar">
        <div className="marine-traffic-title">
          <span><Ship /></span>
          <div>
            <small>TRÁFEGO MARÍTIMO</small>
            <b>MarineTraffic</b>
          </div>
        </div>
        <div className="marine-traffic-actions">
          <button type="button" onClick={() => setFrameKey((value) => value + 1)} title="Recarregar MarineTraffic">
            <RefreshCw /> <span>Recarregar</span>
          </button>
          <a href={MARINE_TRAFFIC_URL} target="_blank" rel="noreferrer" title="Abrir MarineTraffic em nova aba">
            <ExternalLink /> <span>Abrir fora</span>
          </a>
        </div>
      </div>

      <div className="marine-traffic-frame-wrap">
        <iframe
          key={frameKey}
          className="marine-traffic-frame"
          src={MARINE_TRAFFIC_URL}
          title="MarineTraffic AIS"
          loading="eager"
          allow="geolocation; fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
  );
}
