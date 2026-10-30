import { NextResponse } from "next/server";
import {
  generateBathymetryContours,
  intersectsSouthBrazilShelf,
  tileBoundsLonLat,
} from "../../../../../../lib/bathymetryContours.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const TERRARIUM_BASES = [
  "https://elevation-tiles-prod.s3.amazonaws.com/terrarium",
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium",
  "https://elevation-tiles-prod-eu.s3.eu-central-1.amazonaws.com/terrarium",
];

function levelsForZoom(z) {
  if (z <= 6) return [100, 200];
  if (z === 7) return [50, 100, 150, 200];
  if (z === 8) return [30, 50, 75, 100, 150, 200];
  if (z === 9) return [10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200];
  return [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 175, 200];
}

function emptyResponse(z, x, y, source = "outside-coverage") {
  return NextResponse.json(
    { type: "FeatureCollection", features: [], meta: { z, x, y, source } },
    { headers: { "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000" } },
  );
}

export async function GET(_request, context) {
  const params = await context.params;
  const z = Number(params?.z);
  const x = Number(params?.x);
  const y = Number(params?.y);

  if (![z, x, y].every(Number.isInteger) || z < 5 || z > 14) {
    return NextResponse.json({ error: "Tile batimétrico inválido." }, { status: 400 });
  }
  const n = 2 ** z;
  if (x < 0 || y < 0 || x >= n || y >= n) {
    return NextResponse.json({ error: "Coordenada de tile fora da faixa." }, { status: 400 });
  }

  const bounds = tileBoundsLonLat(z, x, y);
  if (!intersectsSouthBrazilShelf(bounds)) return emptyResponse(z, x, y);

  try {
    let upstream = null;
    let usedBase = "";
    let lastStatus = 0;
    for (const base of TERRARIUM_BASES) {
      try {
        const response = await fetch(`${base}/${z}/${x}/${y}.png`, {
          headers: {
            accept: "image/png,image/*;q=0.9,*/*;q=0.8",
            "user-agent": "Painel-de-Bordo/205 (curvas-batimetricas)",
          },
          cache: "force-cache",
          next: { revalidate: 2592000 },
          signal: AbortSignal.timeout(10000),
        });
        lastStatus = response.status;
        if (response.ok) {
          upstream = response;
          usedBase = base;
          break;
        }
      } catch {
        // tenta o próximo endpoint público do mesmo dataset
      }
    }

    if (!upstream) return emptyResponse(z, x, y, `terrain-unavailable-${lastStatus || "network"}`);
    const png = new Uint8Array(await upstream.arrayBuffer());
    const levels = levelsForZoom(z);
    const features = generateBathymetryContours(png, {
      z, x, y, levels,
      step: z <= 7 ? 2 : 1,
    });

    return NextResponse.json(
      {
        type: "FeatureCollection",
        features,
        meta: {
          z, x, y,
          levels,
          source: "Mapzen Terrain Tiles / AWS Open Data",
          upstream: usedBase,
          unit: "m",
          generated: true,
        },
      },
      {
        headers: {
          "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
          "x-bathymetry-source": "terrain-tiles-etopo1",
        },
      },
    );
  } catch (error) {
    console.error("[bathymetry-contours]", error);
    return emptyResponse(z, x, y, "terrain-unavailable");
  }
}
