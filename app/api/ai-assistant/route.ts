import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { catches, fishingSets, species, trips } from "../../../db/schema";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MODEL = "gpt-5.6-sol";
const ALLOWED_EFFORTS = new Set(["none", "low", "medium", "high", "xhigh", "max"]);

type ClientMessage = { role?: string; content?: string };
type AiMode = "basic" | "full" | "advanced";
type CatchRow = {
  tripId: number;
  fishingSetId: number;
  speciesId: number;
  catchType: string;
  weightKg: number;
  caughtAt: string;
  notes: string | null;
};

function safeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeConversation(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-8)
    .map((item: ClientMessage) => ({
      role: item?.role === "assistant" ? "ASSISTENTE" : "USUÁRIO",
      content: String(item?.content || "").slice(0, 2500),
    }))
    .filter((item) => item.content.trim());
}

function compactExternalContext(value: unknown) {
  if (!value || typeof value !== "object") return null;
  try {
    const json = JSON.stringify(value);
    if (json.length > 20_000) return JSON.parse(json.slice(0, 20_000));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function extractOutputText(response: any) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  for (const item of response?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

async function testOpenAiConnection(apiKey: string, model: string) {
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, status: response.status };
    return {
      ok: false,
      status: response.status,
      error: response.status === 401
        ? "OPENAI_API_KEY recusada"
        : response.status === 404
          ? `Modelo ${model} não encontrado ou sem acesso`
          : body?.error?.message || `OpenAI respondeu HTTP ${response.status}`,
    };
  } catch (error: any) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return { ok: false, error: timedOut ? "Tempo esgotado ao testar a OpenAI" : "Não foi possível alcançar a OpenAI" };
  }
}

async function buildFishingContext(ownerId: string, mode: AiMode) {
  const db = getDb();
  const tripLimit = mode === "basic" ? 8 : mode === "full" ? 16 : 24;
  const setLimit = mode === "basic" ? 36 : mode === "full" ? 96 : 160;
  const catchLimit = mode === "basic" ? 360 : mode === "full" ? 1000 : 1800;

  const tripRows = await db
    .select({
      id: trips.id,
      name: trips.name,
      departureDate: trips.departureDate,
      expectedReturnDate: trips.expectedReturnDate,
      returnDate: trips.returnDate,
      departurePort: trips.departurePort,
      returnPort: trips.returnPort,
      captain: trips.captain,
      crewCount: trips.crewCount,
      targetKg: trips.targetKg,
      primarySpeciesId: trips.primarySpeciesId,
      fishingType: trips.fishingType,
      status: trips.status,
      notes: trips.notes,
    })
    .from(trips)
    .where(eq(trips.ownerId, ownerId))
    .orderBy(desc(trips.id))
    .limit(tripLimit);

  const [setRows, catchRows, speciesRows] = await Promise.all([
    db
      .select({
        id: fishingSets.id,
        tripId: fishingSets.tripId,
        setNumber: fishingSets.setNumber,
        startedAt: fishingSets.startedAt,
        finishedAt: fishingSets.finishedAt,
        depthMeters: fishingSets.depthMeters,
        startLatitude: fishingSets.startLatitude,
        startLongitude: fishingSets.startLongitude,
        endLatitude: fishingSets.endLatitude,
        endLongitude: fishingSets.endLongitude,
        waterTemperature: fishingSets.waterTemperature,
        notes: fishingSets.notes,
      })
      .from(fishingSets)
      .innerJoin(trips, eq(fishingSets.tripId, trips.id))
      .where(eq(trips.ownerId, ownerId))
      .orderBy(desc(fishingSets.startedAt))
      .limit(setLimit),
    db
      .select({
        tripId: catches.tripId,
        fishingSetId: catches.fishingSetId,
        speciesId: catches.speciesId,
        catchType: catches.catchType,
        weightKg: catches.weightKg,
        caughtAt: catches.caughtAt,
        notes: catches.notes,
      })
      .from(catches)
      .innerJoin(trips, eq(catches.tripId, trips.id))
      .where(eq(trips.ownerId, ownerId))
      .orderBy(desc(catches.caughtAt))
      .limit(catchLimit),
    db.select({ id: species.id, commonName: species.commonName, code: species.code }).from(species).where(eq(species.ownerId, ownerId)),
  ]);

  const speciesName = new Map(speciesRows.map((item) => [item.id, item.commonName]));
  const catchesBySet = new Map<number, CatchRow[]>();
  for (const row of catchRows as CatchRow[]) {
    const list = catchesBySet.get(row.fishingSetId) || [];
    list.push(row);
    catchesBySet.set(row.fishingSetId, list);
  }

  const setDetails = setRows.map((set) => {
    const related = catchesBySet.get(set.id) || [];
    const primaryKg = related.filter((item) => item.catchType === "PRIMARY").reduce((sum, item) => sum + safeNumber(item.weightKg), 0);
    const mixtureKg = related.filter((item) => item.catchType === "MIXTURE").reduce((sum, item) => sum + safeNumber(item.weightKg), 0);
    const discardKg = related.filter((item) => item.catchType === "DISCARD").reduce((sum, item) => sum + safeNumber(item.weightKg), 0);
    const retainedKg = primaryKg + mixtureKg;
    return {
      id: set.id,
      tripId: set.tripId,
      setNumber: set.setNumber,
      startedAt: set.startedAt,
      finishedAt: set.finishedAt,
      depthMeters: set.depthMeters,
      start: set.startLatitude == null || set.startLongitude == null ? null : [Number(set.startLatitude), Number(set.startLongitude)],
      end: set.endLatitude == null || set.endLongitude == null ? null : [Number(set.endLatitude), Number(set.endLongitude)],
      waterTemperature: set.waterTemperature,
      primaryKg: Math.round(primaryKg * 1000) / 1000,
      mixtureKg: Math.round(mixtureKg * 1000) / 1000,
      discardKg: Math.round(discardKg * 1000) / 1000,
      retainedKg: Math.round(retainedKg * 1000) / 1000,
      catches: related.map((item) => ({
        species: speciesName.get(item.speciesId) || `Espécie ${item.speciesId}`,
        type: item.catchType,
        kg: safeNumber(item.weightKg),
        caughtAt: item.caughtAt,
      })),
      notes: set.notes,
    };
  });

  const tripSummaries = tripRows.map((trip) => {
    const tripSets = setDetails.filter((set) => set.tripId === trip.id);
    const tripCatches = (catchRows as CatchRow[]).filter((item) => item.tripId === trip.id);
    const primaryKg = tripCatches.filter((item) => item.catchType === "PRIMARY").reduce((sum, item) => sum + safeNumber(item.weightKg), 0);
    const mixtureKg = tripCatches.filter((item) => item.catchType === "MIXTURE").reduce((sum, item) => sum + safeNumber(item.weightKg), 0);
    const discardKg = tripCatches.filter((item) => item.catchType === "DISCARD").reduce((sum, item) => sum + safeNumber(item.weightKg), 0);
    const retainedKg = primaryKg + mixtureKg;
    const bestSet = [...tripSets].sort((a, b) => b.retainedKg - a.retainedKg)[0] || null;
    return {
      id: trip.id,
      name: trip.name,
      status: trip.status,
      departureDate: trip.departureDate,
      expectedReturnDate: trip.expectedReturnDate,
      returnDate: trip.returnDate,
      departurePort: trip.departurePort,
      returnPort: trip.returnPort,
      captain: trip.captain,
      crewCount: trip.crewCount,
      fishingType: trip.fishingType,
      targetKg: safeNumber(trip.targetKg),
      primarySpecies: trip.primarySpeciesId ? speciesName.get(trip.primarySpeciesId) || null : null,
      setCount: tripSets.length,
      primaryKg: Math.round(primaryKg * 1000) / 1000,
      mixtureKg: Math.round(mixtureKg * 1000) / 1000,
      discardKg: Math.round(discardKg * 1000) / 1000,
      retainedKg: Math.round(retainedKg * 1000) / 1000,
      targetProgressPct: safeNumber(trip.targetKg) > 0 ? Math.round((retainedKg / safeNumber(trip.targetKg)) * 1000) / 10 : null,
      avgRetainedKgPerSet: tripSets.length ? Math.round((retainedKg / tripSets.length) * 10) / 10 : 0,
      bestSet: bestSet ? { setNumber: bestSet.setNumber, retainedKg: bestSet.retainedKg, depthMeters: bestSet.depthMeters, startedAt: bestSet.startedAt } : null,
      notes: trip.notes,
    };
  });

  const currentTrip = tripSummaries.find((trip) => trip.status === "IN_PROGRESS") || tripSummaries[0] || null;
  const topSets = [...setDetails].filter((set) => set.retainedKg > 0).sort((a, b) => b.retainedKg - a.retainedKg).slice(0, 12).map(({ catches: _catches, ...set }) => set);

  return {
    generatedAt: new Date().toISOString(),
    currentTrip,
    tripHistory: mode === "basic" ? tripSummaries.slice(0, 4) : tripSummaries,
    finishedTripCount: tripSummaries.filter((trip) => trip.status === "FINISHED").length,
    totalSets: setDetails.length,
    topSets: mode === "basic" ? topSets.slice(0, 6) : topSets,
    recentSetDetails: setDetails.slice(0, mode === "basic" ? 20 : mode === "full" ? 60 : 120),
  };
}

async function logUsage(args: { userId: string; requestType: AiMode; model: string; result?: any; status: string; errorText?: string }) {
  try {
    const usage = args.result?.usage || {};
    await getDb().execute(sql`
      insert into public.ai_usage
        (user_id, request_type, model, input_tokens, output_tokens, total_tokens, credits_charged, estimated_api_cost_brl, status, error_text)
      values
        (${args.userId}, ${args.requestType}, ${args.model}, ${Number(usage.input_tokens || 0)}, ${Number(usage.output_tokens || 0)}, ${Number(usage.total_tokens || 0)}, 0, 0, ${args.status}, ${args.errorText || null})
    `);
  } catch {
    // O log é opcional e nunca pode derrubar o assistente.
  }
}

export async function GET(request: Request) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return Response.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const connection = apiKey ? await testOpenAiConnection(apiKey, model) : { ok: false, error: "OPENAI_API_KEY ausente" };

  return Response.json({
    configured: Boolean(apiKey),
    model,
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "high",
    connection,
    free: true,
    creditsRequired: 0,
  });
}

export async function POST(request: Request) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return Response.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY não configurada na Vercel. Adicione a chave como variável Secret e faça um novo deploy." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const question = String(body?.question || "").trim().slice(0, 2000);
  if (!question) return Response.json({ error: "Escreva uma pergunta para o assistente." }, { status: 400 });
  const mode: AiMode = body?.mode === "advanced" ? "advanced" : body?.mode === "full" ? "full" : "basic";

  let fishingContext: any;
  try {
    fishingContext = await buildFishingContext(user.id, mode);
  } catch (error) {
    console.error("Painel IA V85 context error", error);
    fishingContext = { generatedAt: new Date().toISOString(), currentTrip: null, tripHistory: [], finishedTripCount: 0, totalSets: 0, topSets: [], recentSetDetails: [] };
  }

  const environment = compactExternalContext(body?.environment);
  const statisticalAnalysis = compactExternalContext(body?.statisticalAnalysis);
  const conversation = normalizeConversation(body?.conversation);
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const configuredEffort = process.env.OPENAI_REASONING_EFFORT || "high";
  const reasoningEffort = ALLOWED_EFFORTS.has(configuredEffort) ? configuredEffort : "high";

  const instructions = `Você é o PAINEL IA, assistente especialista em análise operacional de pesca industrial embarcada.
Seu trabalho é transformar os dados reais do Painel de Bordo em análises úteis para o mestre da embarcação, com foco especial em produtividade de largadas e pesca de corvina quando ela for a espécie principal.

REGRAS DE QUALIDADE:
1. Use prioritariamente os dados fornecidos pelo sistema. Nunca invente captura, posição, vento, maré, temperatura, clorofila, lua ou resultado que não esteja no contexto.
2. Diferencie claramente: FATO OBSERVADO, PADRÃO ESTATÍSTICO e HIPÓTESE OPERACIONAL.
3. Correlação não é causalidade. Se a amostra for pequena, diga isso de forma objetiva.
4. Compare viagem atual com viagens anteriores quando houver histórico suficiente.
5. Ao analisar largadas, considere horário, profundidade, posição, produção por largada, espécie/categoria, lua, vento/direção, rajadas, onda/swell, corrente, nível do mar/maré modelada, temperatura da superfície e clorofila quando esses dados estiverem disponíveis.
6. Não trate previsão de pesca como garantia. Expresse janelas e condições como hipóteses operacionais baseadas no histórico.
7. Dados de maré/modelos oceânicos não substituem carta náutica, avisos oficiais, decisão do comandante nem procedimentos de segurança.
8. Seja direto, técnico e compreensível para uso a bordo. Evite texto genérico.
9. Quando a pergunta pedir uma decisão, entregue uma recomendação operacional condicionada às evidências, acompanhada do grau de confiança.
10. Responda em português do Brasil.

FORMATO PREFERIDO:
- RESUMO: 2 a 4 linhas.
- EVIDÊNCIAS: números e comparações concretas do painel.
- LEITURA OPERACIONAL: o que os padrões podem indicar.
- O QUE OBSERVAR NA PRÓXIMA LARGADA: checklist curto.
- CONFIANÇA: alta, média, baixa ou insuficiente, com motivo.
Use texto simples e listas curtas; não use tabelas extensas.`;

  const payload = {
    pergunta: question,
    conversaRecente: conversation,
    dadosDoPainel: fishingContext,
    ambienteAtualExibidoNoDashboard: environment,
    analiseEstatisticaLocal: statisticalAnalysis,
  };

  let openAIResponse: Response;
  try {
    openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        instructions,
        input: `Analise o contexto operacional abaixo e responda à pergunta do usuário.\n\n${JSON.stringify(payload)}`,
        reasoning: { effort: reasoningEffort },
        max_output_tokens: mode === "basic" ? 1200 : 1800,
        store: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
  } catch (error: any) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    void logUsage({ userId: user.id, requestType: mode, model, status: "error", errorText: timedOut ? "timeout" : "network" });
    return Response.json({ error: timedOut ? "A OpenAI demorou para responder. Tente novamente. A IA é grátis e nenhum crédito foi consumido." : "Não foi possível conectar à OpenAI agora. A IA é grátis e nenhum crédito foi consumido." }, { status: timedOut ? 504 : 502 });
  }

  const result = await openAIResponse.json().catch(() => ({}));
  if (!openAIResponse.ok) {
    const detail = result?.error?.message || "A OpenAI não conseguiu processar esta análise.";
    void logUsage({ userId: user.id, requestType: mode, model, status: "error", errorText: detail });
    const friendly = openAIResponse.status === 401
      ? "A OPENAI_API_KEY foi recusada. Confira a chave na Vercel."
      : openAIResponse.status === 429
        ? "A OpenAI atingiu um limite de uso/rate limit. Confira Billing e Limits da conta da API."
        : detail;
    return Response.json({ error: friendly, code: result?.error?.code || result?.error?.type || "openai_error" }, { status: openAIResponse.status });
  }

  const answer = extractOutputText(result);
  if (!answer) {
    void logUsage({ userId: user.id, requestType: mode, model, result, status: "empty", errorText: "sem texto" });
    return Response.json({ error: "A IA concluiu a solicitação sem retornar texto. Tente novamente." }, { status: 502 });
  }

  void logUsage({ userId: user.id, requestType: mode, model: result?.model || model, result, status: "success" });

  return Response.json({
    answer,
    model: result?.model || model,
    responseId: result?.id || null,
    usage: result?.usage ? {
      inputTokens: result.usage.input_tokens ?? null,
      outputTokens: result.usage.output_tokens ?? null,
      totalTokens: result.usage.total_tokens ?? null,
    } : null,
    billing: { chargedCredits: 0, free: true },
    free: true,
    generatedAt: new Date().toISOString(),
  });
}
