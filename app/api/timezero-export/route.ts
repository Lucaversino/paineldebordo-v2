import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bucket = "timezero-forecasts";
const paths = [30,60,100,150,200];
const periods = [24,48,72,96,120,168];

type Config = { supabase: string; key: string; secret: string; worker: string };
function config(): Config {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const secret = process.env.TIMEZERO_WORKER_SECRET;
  const worker = process.env.TIMEZERO_WORKER_URL?.replace(/\/$/, "").replace(/\/api\/timezero-grib$/, "/api/timezero-jobs");
  if (!supabase || !key || !secret || !worker) throw new Error("Configure Supabase e as variáveis TIMEZERO_WORKER_URL/SECRET na Vercel.");
  return { supabase, key, secret, worker };
}

async function storage(path: string, cfg: Config, method = "GET", body?: Uint8Array) {
  return fetch(`${cfg.supabase}/storage/v1/object/${bucket}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      apikey: cfg.key,
      ...(body ? { "Content-Type": "application/octet-stream", "x-upsert": "true" } : {}),
    },
    body: body ? Buffer.from(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(18000),
  });
}
function fileResult(bytes: Uint8Array, format: string, hours: number, fromCache: boolean) {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": format === "grbzip" ? "application/zip" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="noaa-gfs-timezero-${hours}h.${format}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Cache": fromCache ? "HIT" : "MISS",
    },
  });
}
async function workerCall(cfg: Config, params: URLSearchParams) {
  const r = await fetch(`${cfg.worker}?${params}`, { headers: { "X-Worker-Secret": cfg.secret }, cache:"no-store",signal:AbortSignal.timeout(45000) });
  if (!r.ok && r.status !== 202) {
    const detail = await r.json().catch(() => ({}));
    throw new Error(typeof detail.error === "string" ? detail.error : `NOAA Worker HTTP ${r.status}`);
  }
  return r;
}
export async function GET(req: NextRequest) {
  const user = await getPanelUserFromRequest(req);
  if (!user) return NextResponse.json({error:"Entre na sua conta para baixar a previsão NOAA."},{status:401});
  const q = req.nextUrl.searchParams;
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  const radius = Number(q.get("radius")), hours = Number(q.get("hours"));
  const format = q.get("format") === "grbzip" ? "grbzip" : "grb";
  const action = q.get("action") || "start";
  if (!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -65||lat>15||lon < -85||lon>-25||!paths.includes(radius)||!periods.includes(hours)) {
    return NextResponse.json({error:"Coordenadas, área ou período inválidos."},{status:422});
  }
  try {
    const cfg = config();
    // Daily cache key, private to authenticated owner. NOAA model cycle is returned in job status.
    const key = createHash("sha256").update(`${lat.toFixed(4)}:${lon.toFixed(4)}:${radius}:${hours}:${new Date().toISOString().slice(0,10)}`).digest("hex").slice(0,30);
    const path = `${user.id}/${key}.${format}`;
    const saved = await storage(path,cfg);
    if (saved.ok) return fileResult(new Uint8Array(await saved.arrayBuffer()),format,hours,true);
    if (saved.status !== 400 && saved.status !== 404) throw new Error(`Erro ao consultar Supabase Storage (HTTP ${saved.status})`);
    const wp = new URLSearchParams({ owner:user.id });
    if (action === "start") {
      wp.set("lat", String(lat));wp.set("lon",String(lon));wp.set("radius",String(radius));wp.set("hours",String(hours));
    } else if (action === "status" || action === "download") {
      const id = q.get("job");
      if (!id || !/^[a-f0-9]{36}$/.test(id))return NextResponse.json({error:"Identificador de trabalho inválido"},{status:422});
      wp.set("id",id);
      if (action === "download") {wp.set("download","1");wp.set("format",format);}
    } else return NextResponse.json({error:"Ação não permitida"},{status:422});
    const response = await workerCall(cfg,wp);
    if (action !== "download") {
      const info = await response.json();
      return NextResponse.json({source:"NOAA GFS 0.25",...info},{status:info.status === "failed" ? 502 : 202});
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || (format==="grb" && (bytes.length < 100 || String.fromCharCode(...bytes.slice(0,4))!=="GRIB" || bytes[7]!==1)) || (format==="grbzip" && String.fromCharCode(...bytes.slice(0,2))!=="PK")) {
      throw new Error("Arquivo NOAA GRIB1 inválido; download bloqueado.");
    }
    const stored = await storage(path,cfg,"POST",bytes);
    if (!stored.ok) throw new Error(`O GRIB1 foi gerado, mas o armazenamento privado falhou (HTTP ${stored.status}).`);
    return fileResult(bytes,format,hours,false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    console.error("[timezero-noaa]",{action,message});
    return NextResponse.json({error:message},{status:502});
  }
}
