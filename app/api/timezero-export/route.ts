import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getPanelUser } from "../../../lib/panelAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const pending = new Map<string, Promise<Uint8Array>>();
const lastRequest = new Map<string, number>();
const bucket = "timezero-forecasts";

function settings() {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.TIMEZERO_WORKER_SECRET;
  if (!supabase || !key || !secret) throw new Error("Configure SUPABASE_SERVICE_ROLE_KEY e TIMEZERO_WORKER_SECRET no servidor.");
  return { supabase: supabase.replace(/\/$/, ""), key, secret };
}

async function storage(path: string, config: ReturnType<typeof settings>, method = "GET", body?: Uint8Array) {
  return fetch(`${config.supabase}/storage/v1/object/${bucket}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.key}`,
      apikey: config.key,
      ...(body ? { "Content-Type": "application/octet-stream", "x-upsert": "true" } : {}),
    },
    body: body ? Buffer.from(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
}

export async function GET(req: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Acesse sua conta para gerar previsão." }, { status: 401 });
  const query = req.nextUrl.searchParams;
  const lat = Number(query.get("lat")); const lon = Number(query.get("lon"));
  const radius = Number(query.get("radius")); const hours = Number(query.get("hours"));
  const format = query.get("format") === "grbzip" ? "grbzip" : "grb";
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -65 || lat > 15 || lon < -85 || lon > -25 ||
      ![30, 60, 100, 150, 200].includes(radius) || ![24, 48, 72, 96, 120, 168].includes(hours)) {
    return NextResponse.json({ error: "Coordenada, área ou período inválidos." }, { status: 422 });
  }
  try {
    const cfg = settings();
    const rounded = [lat.toFixed(4), lon.toFixed(4), radius, hours].join(":");
    const key = createHash("sha256").update(rounded + ":" + new Date().toISOString().slice(0, 10)).digest("hex").slice(0, 30);
    const owner = encodeURIComponent(user.id);
    const path = `${owner}/${key}.${format}`;
    const cached = await storage(path, cfg);
    let bytes: Uint8Array;
    let cacheHit = false;
    if (cached.ok) {
      bytes = new Uint8Array(await cached.arrayBuffer());
      cacheHit = true;
    } else {
      if (cached.status !== 404 && cached.status !== 400) throw new Error("Falha ao consultar armazenamento persistente.");
      const unique = `${owner}/${key}.${format}`;
      if (!pending.has(unique)) {
        const now = Date.now();
        if (now - (lastRequest.get(owner) || 0) < 15000) {
          return NextResponse.json({ error: "Aguarde 15 segundos antes de uma nova geração." }, { status: 429 });
        }
        lastRequest.set(owner, now);
        const task = (async () => {
          const workerParams = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radius), hours: String(hours), format });
          const base = process.env.TIMEZERO_WORKER_URL || `${req.nextUrl.origin}/api/timezero-grib`;
          const resp = await fetch(`${base}?${workerParams}`, {
            headers: { "X-Worker-Secret": cfg.secret },
            signal: AbortSignal.timeout(50000), cache: "no-store",
          });
          if (!resp.ok) {
            const error = await resp.json().catch(() => ({}));
            throw new Error(error.error || `O gerador retornou HTTP ${resp.status}.`);
          }
          const output = new Uint8Array(await resp.arrayBuffer());
          if (!output.length || (format === "grb" && (String.fromCharCode(...output.slice(0, 4)) !== "GRIB" || output[7] !== 1))) {
            throw new Error("Arquivo GRIB1 inválido, download bloqueado.");
          }
          const saved = await storage(path, cfg, "POST", output);
          if (!saved.ok) throw new Error("Arquivo criado, mas não foi possível salvá-lo no armazenamento privado.");
          return output;
        })();
        pending.set(unique, task);
        void task.finally(() => pending.delete(unique)).catch(() => {});
      }
      bytes = await pending.get(unique)!;
    }
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": format === "grbzip" ? "application/zip" : "application/octet-stream",
        "Content-Disposition": `attachment; filename="previsao-timezero-${hours}h.${format}"`,
        "Content-Length": String(bytes.length),
        "X-Cache": cacheHit ? "HIT" : "MISS",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao gerar GRIB." }, { status: 502 });
  }
}
