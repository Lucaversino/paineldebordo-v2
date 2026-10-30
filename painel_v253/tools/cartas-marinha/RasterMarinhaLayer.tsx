// Exemplo simples para React + Leaflet.
// Após converter a carta para XYZ e colocar em public/cartas/<NUMERO>/,
// use uma camada raster.
// IMPORTANTE: cada carta tem escala/área próprias. Em produção, leia bounds
// geográficos via GDAL e ative a carta conforme posição/zoom.

import { TileLayer } from "react-leaflet";

export function CartaRasterMarinha({ numero }: { numero: string }) {
  return (
    <TileLayer
      url={`/cartas/${numero}/{z}/{x}/{y}.png`}
      opacity={1}
      attribution="Carta Náutica Raster — DHN/CHM"
    />
  );
}

// Exemplo:
// <CartaRasterMarinha numero="1841" />
