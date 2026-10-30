import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAPABILITIES = "https://idem.dhn.mar.mil.br/geoserver/wms?service=WMS&request=GetCapabilities&version=1.3.0";

const WANTED = [
  "1405","1406","1501","1503","1504","1505","1506","1507","1508","1511","1512","1513","1515","1550",
  "1620","1623","1624","1625","1631","1632","1633","1634","1635","1636","1637","1640","1643","1644","1703",
  "1711","1712","1713","1803","1820","1821","1822","1830","1831","1841","1901","1902","1910","1921","2010",
  "2011","2101","2110","23000","23100","23200","23300","23400","23500","23600","21070","21080"
];

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}

function numericTag(block: string, name: string) {
  const value = Number(tag(block, name));
  return Number.isFinite(value) ? value : null;
}

function layerBlocks(xml: string) {
  const token = /<Layer\b[^>]*>|<\/Layer>/gi;
  const stack: number[] = [];
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = token.exec(xml))) {
    if (/^<Layer\b/i.test(m[0])) {
      stack.push(m.index);
    } else {
      const start = stack.pop();
      if (start != null) blocks.push(xml.slice(start, token.lastIndex));
    }
  }
  return blocks;
}

function numberFromLayer(name: string, title: string) {
  const text = `${title} ${name}`.toUpperCase();
  // Maior número primeiro para impedir 2101 casar com 21010.
  const sorted = [...WANTED].sort((a, b) => b.length - a.length);
  return sorted.find((number) => new RegExp(`(^|[^0-9])${number}(?![0-9])`, "i").test(text)) || "";
}

function getBounds(block: string): [number, number, number, number] | null {
  const ex = block.match(/<EX_GeographicBoundingBox>([\s\S]*?)<\/EX_GeographicBoundingBox>/i)?.[1] || "";
  if (ex) {
    const west = numericTag(ex, "westBoundLongitude");
    const east = numericTag(ex, "eastBoundLongitude");
    const south = numericTag(ex, "southBoundLatitude");
    const north = numericTag(ex, "northBoundLatitude");
    if ([west, south, east, north].every((v) => v != null)) return [west!, south!, east!, north!];
  }
  const bb = block.match(/<BoundingBox\b[^>]*(?:CRS|SRS)=["'](?:CRS:84|EPSG:4326)["'][^>]*>/i)?.[0];
  if (bb) {
    const attr = (key: string) => Number(bb.match(new RegExp(`${key}=["']([^"']+)["']`, "i"))?.[1]);
    const minx = attr("minx"), miny = attr("miny"), maxx = attr("maxx"), maxy = attr("maxy");
    if ([minx,miny,maxx,maxy].every(Number.isFinite)) return [minx,miny,maxx,maxy];
  }
  return null;
}

function scaleFromTitle(title: string) {
  const m = title.match(/1\s*:\s*([\d.]+)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const response = await fetch(CAPABILITIES, {
      headers: { "User-Agent": "Painel-de-Bordo/65.0 (Carta Nautica DHN)" },
      next: { revalidate: 21600 },
    });
    if (!response.ok) throw new Error(`IDEM-DHN respondeu HTTP ${response.status}`);
    const xml = await response.text();
    const found = new Map<string, any>();
    for (const block of layerBlocks(xml)) {
      // Só usamos folhas: blocos com camada filha podem misturar metadados do grupo.
      const inner = block.replace(/^<Layer\b[^>]*>/i, "").replace(/<\/Layer>$/i, "");
      if (/<Layer\b/i.test(inner)) continue;
      const layerName = tag(block, "Name");
      const title = tag(block, "Title");
      if (!layerName || !title) continue;
      const number = numberFromLayer(layerName, title);
      if (!number) continue;
      const candidate = {
        number,
        title: title.replace(/^Carta\s+Nautica\s+Raster\s+/i, "").trim(),
        layerName,
        bounds: getBounds(block),
        scale: scaleFromTitle(title),
        source: "wms",
      };
      const previous = found.get(number);
      if (!previous) {
        found.set(number, candidate);
      } else {
        const names = new Set(String(previous.layerName || "").split(",").filter(Boolean));
        names.add(layerName);
        const a = previous.bounds as [number, number, number, number] | null;
        const b = candidate.bounds as [number, number, number, number] | null;
        const bounds = a && b
          ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
          : (a || b);
        found.set(number, {
          ...previous,
          layerName: [...names].join(","),
          bounds,
          scale: previous.scale || candidate.scale,
        });
      }
    }
    const charts = [...found.values()].sort((a, b) => Number(a.number) - Number(b.number));
    return NextResponse.json({ source: "IDEM-DHN GeoServer WMS", charts, count: charts.length, fetchedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ charts: [], error: error instanceof Error ? error.message : "Falha ao consultar IDEM-DHN" }, { status: 502 });
  }
}
