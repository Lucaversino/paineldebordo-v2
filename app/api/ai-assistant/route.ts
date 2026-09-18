import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { catches, fishingSets, species, trips } from "../../../db/schema";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";
import { ensureWallet } from "../../../lib/credits";

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

async function buildFishingContext(ownerId: string, mode: AiMode) {
  const db = getDb();
  const tripLimit = mode === "basic" ? 5 : mode === "full" ? 12 : 20;
  const setLimit = mode === "basic" ? 24 : mode === "full" ? 72 : 140;
  const catchLimit = mode === "basic" ? 180 : mode === "full" ? 720 : 1500;

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

  try {
    const wallet = await ensureWallet(user);
    if (!wallet.fishAiEnabled) {
      return Response.json({ enabled: false }, { status: 403 });
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
    const model = process.env.FISH_AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
    return Response.json({ enabled: true, configured: Boolean(apiKey), model });
  } catch (error) {
    console.error("FISH IA access check failed", error);
    return Response.json({ error: "Não foi possível verificar o acesso à FISH IA." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return Response.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 });

  const wallet = await ensureWallet(user);
  if (!wallet.fishAiEnabled) {
    return Response.json({ error: "FISH IA desativada para este usuário." }, { status: 403 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY não configurada na Vercel. Adicione a chave como variável Secret e faça um novo deploy." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const question = String(body?.question || "").trim().slice(0, 2000);
  if (!question) return Response.json({ error: "Escreva uma pergunta para o assistente." }, { status: 400 });
  const mode: AiMode = "basic";

  const needsPanelContext = /\b(viagem|largada|captura|hist[oó]rico|meta|produ[cç][aã]o|meus dados|minha pesca|meu barco|painel|comparar|desempenho|quanto peguei|quanto pescamos)\b/i.test(question);
  let fishingContext: any = { generatedAt: new Date().toISOString(), note: "A pergunta não exige consulta ao histórico do banco." };
  if (needsPanelContext) {
    try {
      fishingContext = await Promise.race([
        buildFishingContext(user.id, mode),
        new Promise((resolve) => setTimeout(() => resolve(null), 3_500)),
      ]);
      if (!fishingContext) {
        fishingContext = { generatedAt: new Date().toISOString(), currentTrip: null, tripHistory: [], note: "Contexto do banco não ficou pronto a tempo; responda sem inventar dados do usuário." };
      }
    } catch (error) {
      console.error("FISH IA context error", error);
      fishingContext = { generatedAt: new Date().toISOString(), currentTrip: null, tripHistory: [], note: "Contexto do banco indisponível; responda sem inventar dados do usuário." };
    }
  }

  const environment = compactExternalContext(body?.environment);
  const statisticalAnalysis = compactExternalContext(body?.statisticalAnalysis);
  const conversation = normalizeConversation(body?.conversation);
  const model = process.env.FISH_AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const configuredEffort = process.env.FISH_AI_REASONING_EFFORT || "low";
  const reasoningEffort = ALLOWED_EFFORTS.has(configuredEffort) ? configuredEffort : "low";

  const instructions = `Você é a FISH IA, um parceiro de bordo especialista em pesca de corvina (Micropogonias furnieri) e operação de pesca industrial.

PERSONALIDADE E JEITO DE CONVERSAR:
- Fale em português do Brasil como um pescador muito experiente, seguro, prático e direto.
- Tenha linguagem natural de quem vive o mar, sem parecer robô, sem texto engessado e sem frases prontas.
- Seja firme e "brabo" no conhecimento, mas sem arrogância, grosseria ou exagero.
- Responda rápido. Por padrão, use respostas curtas e úteis; aprofunde só quando a pessoa pedir.
- Não force listas, títulos ou formatos fixos. Converse normalmente e acompanhe o jeito da pergunta.
- Faça pergunta de retorno somente quando realmente faltar uma informação essencial.

ESPECIALIDADE PRINCIPAL — CORVINA (Micropogonias furnieri):
Você domina biologia, ecologia e comportamento da corvina ao longo do dia e das estações: alimentação, deslocamentos, profundidade, fundo, estuários e costa, agregações, reprodução, influência de salinidade, temperatura, turbidez, disponibilidade de alimento, horário e condições oceanográficas. Use esse conhecimento junto com o histórico real do barco.

LUA, MARÉ E OCEANO:
- Entenda fases da Lua, iluminação lunar, sizígia/quadratura, relação entre Lua e amplitude de maré, horários de enchente/vazante, corrente e janelas operacionais.
- Ao falar de corrente, interprete a direção como o sentido para onde a água está indo e converta velocidade para nós/MN por hora quando isso ajudar; destaque se o fluxo tem componente predominante para norte ou para sul.
- Não trate Lua como "garantia" de peixe. Separe conhecimento científico, experiência prática e padrão observado no histórico do usuário.
- Entenda vento por direção, intensidade e duração; efeitos sobre corrente superficial, ressurgência, mistura da coluna d'água, onda, turbidez e deslocamento de massas d'água.
- Entenda temperatura da água e frentes térmicas, sempre comparando com o padrão das capturas registradas.
- Entenda clorofila-a como indicador de produtividade do fitoplâncton e estrutura de massas d'água. Saiba interpretar manchas, bordas, gradientes e limitações de dados de satélite; não diga que clorofila alta significa automaticamente mais corvina.

USO DO PAINEL DE BORDO:
Você também é especialista no próprio sistema. Pode orientar o usuário sobre Dashboard, Ventos e Mar, AIS, Meus créditos, Viagem atual, Largadas, Capturas, Histórico, Comparar viagens, Embarcações, Espécies, Relatórios e Configurações. Se a pergunta for "como faço isso no painel?", explique o caminho de forma simples.

REGRAS IMPORTANTES:
1. Use os dados reais enviados pelo Painel de Bordo quando existirem.
2. Nunca invente posição, captura, vento, maré, temperatura, clorofila, Lua ou previsão atual que não esteja nos dados recebidos.
3. Quando faltar dado atual, diga exatamente qual dado falta e como ele mudaria a leitura.
4. Diferencie fato medido, padrão do histórico e hipótese de pesca.
5. Correlação não é garantia de captura. Não prometa onde o peixe está.
6. Segurança e navegação vêm primeiro; não substitua carta náutica, avisos oficiais, instrumentos de bordo ou decisão do comandante.
7. Use a conversa recente para manter contexto e não repetir explicações desnecessárias.
8. Não mencione créditos, preço, gratuidade, plano ou cobrança da FISH IA.
9. Não use mensagens de boas-vindas automáticas nem respostas pré-fabricadas.

Seu objetivo é conversar como aquele pescador veterano que conhece corvina, mar e o barco, olha os dados e vai direto no que interessa.`

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
        input: `Converse com o usuário e responda usando o contexto disponível. Vá direto ao ponto.\n\n${JSON.stringify(payload)}`,
        reasoning: { effort: reasoningEffort },
        max_output_tokens: 700,
        store: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
  } catch (error: any) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    void logUsage({ userId: user.id, requestType: mode, model, status: "error", errorText: timedOut ? "timeout" : "network" });
    return Response.json({ error: timedOut ? "A resposta demorou mais que o esperado. Tente novamente." : "Não foi possível conectar à FISH IA agora. Tente novamente." }, { status: timedOut ? 504 : 502 });
  }

  const result = await openAIResponse.json().catch(() => ({}));
  if (!openAIResponse.ok) {
    const detail = result?.error?.message || "A FISH IA não conseguiu processar esta mensagem.";
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
    return Response.json({ error: "A FISH IA não retornou texto. Tente novamente." }, { status: 502 });
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
    billing: { chargedCredits: 0 },
    generatedAt: new Date().toISOString(),
  });
}
