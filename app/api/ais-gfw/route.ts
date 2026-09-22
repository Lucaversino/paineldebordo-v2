import { NextRequest, NextResponse } from "next/server";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";
import { normalizeGfwEntry } from "../../../lib/gfw";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: NextRequest) {
  try {
    if (!await getPanelUserFromRequest(request)) return reply({ error: "Sessão encerrada. Entre novamente no painel." }, 401);
    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    const since = request.nextUrl.searchParams.get("since") || "";
    if (q.length < 3 || q.length > 100 || since.length > 2000) return reply({ error: "Digite de 3 a 100 caracteres." }, 400);
    const token = process.env.GFW_API_TOKEN?.trim();
    if (!token) return reply({ error: "Global Fishing Watch ainda não configurado. Cadastre GFW_API_TOKEN no servidor e publique novamente. As outras fontes FREE continuam disponíveis." }, 503);
    const params = new URLSearchParams({ query: q, "datasets[0]": "public-global-vessel-identity:latest", limit: "20" });
    if (since) params.set("since", since);
    const response = await fetch(`https://gateway.api.globalfishingwatch.org/v3/vessels/search?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok) return reply({ error: response.status === 429 ? "Limite do Global Fishing Watch atingido. Aguarde antes de tentar novamente." : response.status === 401 || response.status === 403 ? "Token Global Fishing Watch inválido, expirado ou sem permissão. Verifique a configuração no servidor." : "Global Fishing Watch indisponível no momento. Tente novamente ou use Outras fontes." }, response.status === 429 ? 429 : 502);
    const data = await response.json();
    if (!Array.isArray(data?.entries)) return reply({ error: "Resposta inesperada do Global Fishing Watch." }, 502);
    return reply({ vessels: data.entries.map(normalizeGfwEntry), since: typeof data.since === "string" ? data.since : null, total: typeof data.total === "number" ? data.total : null, creditCost: 0 });
  } catch (error) {
    return reply({ error: error instanceof Error && /Timeout|Abort/.test(error.name) ? "A pesquisa demorou para responder. Tente novamente." : "Não foi possível consultar o Global Fishing Watch." }, 502);
  }
}
