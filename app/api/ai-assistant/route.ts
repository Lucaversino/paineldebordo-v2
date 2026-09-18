import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { catches, fishingSets, species, trips } from "../../../db/schema";
import { requirePanelUserResponse } from "../../../lib/panelAuth";
import { getEnvironmentalSnapshots } from "../../../lib/environmentalSnapshots";
import { assertCanUse, debitCreditsAfterSuccess, ensureWallet, getBillingSettings, logAiUsage, priceForCredits, quoteService } from "../../../lib/credits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MODEL = "gpt-5.6-sol";
const ALLOWED_EFFORTS = new Set(["none", "low", "medium", "high", "xhigh", "max"]);

type ClientMessage = { role?: string; content?: string };

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
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  for (const item of response?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return "";
}

async function buildFishingContext(ownerId: string) {
  const db = getDb();
  const [tripRows, setRows, catchRows, speciesRows, environmentRows] = await Promise.all([
    db
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
      .where(eq(trips.ownerId, ownerId)),
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
      .orderBy(asc(fishingSets.startedAt)),
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
      .where(eq(trips.ownerId, ownerId)),
    db
      .select({ id: species.id, commonName: species.commonName, code: species.code })
      .from(species)
      .where(eq(species.ownerId, ownerId)),
    getEnvironmentalSnapshots(db, ownerId),
  ]);

  const speciesName = new Map(speciesRows.map((item) => [item.id, item.commonName]));
  const environmentBySet = new Map(environmentRows.map((item) => [Number(item.fishingSetId), item]));
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
      environment: (() => {
        const snapshot = environmentBySet.get(Number(set.id));
        if (!snapshot) return null;
        return {
          status: snapshot.status,
          sourceMode: snapshot.sourceMode,
          referenceTime: snapshot.referenceTime,
          wind: { speedKmh: snapshot.windSpeedKmh, direction: snapshot.windDirection, directionDeg: snapshot.windDirectionDeg, gustKmh: snapshot.gustKmh },
          sea: {
            waveHeightM: snapshot.waveHeightM, waveDirection: snapshot.waveDirection, waveDirectionDeg: snapshot.waveDirectionDeg, wavePeriodS: snapshot.wavePeriodS,
            swellHeightM: snapshot.swellHeightM, swellDirection: snapshot.swellDirection, swellPeriodS: snapshot.swellPeriodS,
            temperatureC: snapshot.seaTemperatureC, currentKmh: snapshot.currentKmh, currentDirection: snapshot.currentDirection,
            seaLevelMslM: snapshot.seaLevelMslM,
          },
          chlorophyllMgM3: snapshot.chlorophyllMgM3,
          chlorophyllTime: snapshot.chlorophyllTime,
          lunar: { phase: snapshot.lunarPhase, illumination: snapshot.lunarIllumination },
          sunrise: snapshot.sunrise,
          sunset: snapshot.sunset,
          dayForecast: snapshot.payload?.dayForecast || null,
        };
      })(),
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

  const currentTrip = tripSummaries.find((trip) => trip.status === "IN_PROGRESS") || null;
  const finishedTrips = tripSummaries.filter((trip) => trip.status === "FINISHED");
  const topSets = [...setDetails]
    .filter((set) => set.retainedKg > 0)
    .sort((a, b) => b.retainedKg - a.retainedKg)
    .slice(0, 12)
    .map(({ catches: _catches, ...set }) => set);

  return {
    generatedAt: new Date().toISOString(),
    currentTrip,
    tripHistory: tripSummaries,
    finishedTripCount: finishedTrips.length,
    totalSets: setDetails.length,
    topSets,
    recentSetDetails: setDetails.slice(-120),
  };
}

export async function GET() {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const settings = await getBillingSettings();
  const wallet = await ensureWallet(auth.user!, settings);
  const basic = quoteService(wallet, settings, "ai_basic");
  const full = quoteService(wallet, settings, "ai_full");
  const advanced = quoteService(wallet, settings, "ai_advanced");
  const model = settings.AI_BASIC_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  return Response.json({
    configured: Boolean(process.env.OPENAI_API_KEY),
    model,
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "high",
    wallet,
    pricing: {
      basicCredits: basic.credits,
      fullCredits: full.credits,
      advancedCredits: advanced.credits,
      basicBrl: basic.fullPriceBrl,
      fullBrl: full.fullPriceBrl,
      advancedBrl: advanced.fullPriceBrl,
      basicBonusBrl: basic.bonusAppliedBrl,
      fullBonusBrl: full.bonusAppliedBrl,
      advancedBonusBrl: advanced.bonusAppliedBrl,
      welcomeBonusBrl: settings.AI_WELCOME_BONUS_BRL,
      adminFree: wallet.freeAiAccess,
    },
  });
}

function compactContextByMode(context: any, mode: "basic" | "full" | "advanced") {
  if (mode === "advanced") return context;
  if (mode === "full") {
    return {
      generatedAt: context.generatedAt,
      currentTrip: context.currentTrip,
      tripHistory: context.tripHistory,
      finishedTripCount: context.finishedTripCount,
      totalSets: context.totalSets,
      topSets: context.topSets?.slice(0, 10) || [],
      recentSetDetails: context.recentSetDetails?.slice(-50) || [],
    };
  }
  return {
    generatedAt: context.generatedAt,
    currentTrip: context.currentTrip,
    totalSets: context.totalSets,
    topSets: context.topSets?.slice(0, 6) || [],
    recentSetDetails: context.recentSetDetails?.slice(-16).map((set: any) => ({
      id: set.id,
      tripId: set.tripId,
      setNumber: set.setNumber,
      startedAt: set.startedAt,
      finishedAt: set.finishedAt,
      depthMeters: set.depthMeters,
      primaryKg: set.primaryKg,
      mixtureKg: set.mixtureKg,
      discardKg: set.discardKg,
      retainedKg: set.retainedKg,
      catches: set.catches,
    })) || [],
  };
}

export async function POST(request: Request) {
  const auth = await requirePanelUserResponse();
  if (auth.response) return auth.response;
  const user = auth.user!;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY não configurada na Vercel. Adicione a chave como variável Secret e faça um novo deploy." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const question = String(body?.question || "").trim().slice(0, 2000);
  if (!question) return Response.json({ error: "Escreva uma pergunta para o assistente." }, { status: 400 });
  const mode = body?.mode === "advanced" ? "advanced" : body?.mode === "full" ? "full" : "basic";
  const creditMode = mode === "advanced" ? "ai_advanced" as const : mode === "full" ? "ai_full" as const : "ai_basic" as const;

  let access;
  try {
    access = await assertCanUse(user, creditMode);
  } catch (error: any) {
    return Response.json({ error: error?.message || "Saldo insuficiente.", code: error?.code || "insufficient_credits", balance: error?.balance, required: error?.required }, { status: Number(error?.status) || 402 });
  }

  const settings = access.settings;
  const allContext = await buildFishingContext(user.id);
  const fishingContext = compactContextByMode(allContext, mode);
  const environment = mode === "basic" ? null : compactExternalContext(body?.environment);
  const statisticalAnalysis = mode === "basic" ? null : compactExternalContext(body?.statisticalAnalysis);
  const conversation = normalizeConversation(body?.conversation);
  const model = mode === "advanced"
    ? (settings.AI_ADVANCED_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL)
    : mode === "full"
      ? (settings.AI_FULL_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL)
      : (settings.AI_BASIC_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL);
  const configuredEffort = process.env.OPENAI_REASONING_EFFORT || "high";
  const reasoningEffort = ALLOWED_EFFORTS.has(configuredEffort) ? configuredEffort : "high";

  const instructions = `Você é o PAINEL IA, assistente especialista em análise operacional de pesca industrial embarcada.
Seu trabalho é transformar os dados reais do Painel de Bordo em análises úteis para o mestre da embarcação, com foco especial em produtividade de largadas e pesca de corvina quando ela for a espécie principal.

REGRAS DE QUALIDADE:
1. Use prioritariamente os dados fornecidos pelo sistema. Nunca invente captura, posição, vento, maré, temperatura, clorofila, lua ou resultado que não esteja no contexto.
2. Diferencie claramente: FATO OBSERVADO, PADRÃO ESTATÍSTICO e HIPÓTESE OPERACIONAL.
3. Correlação não é causalidade. Se a amostra for pequena, diga isso de forma objetiva.
4. Compare viagem atual com viagens anteriores quando houver histórico suficiente.
5. Ao analisar largadas, considere horário, profundidade, posição, produção por largada, espécie/categoria e, quando o modo permitir, lua, vento/direção, rajadas, onda/swell, corrente, nível do mar/maré modelada, temperatura da superfície e clorofila.
6. Não trate previsão de pesca como garantia.
7. Dados de maré/modelos oceânicos não substituem carta náutica, avisos oficiais, decisão do comandante nem procedimentos de segurança.
8. Seja direto, técnico e compreensível para uso a bordo.
9. Responda em português do Brasil.

MODO DA SOLICITAÇÃO: ${mode.toUpperCase()}.
Use apenas o contexto necessário e não peça dados que já estejam disponíveis no painel.`;

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
        max_output_tokens: mode === "basic" ? 900 : mode === "full" ? 1500 : 1900,
        store: false,
      }),
      cache: "no-store",
    });
  } catch (error) {
    await logAiUsage({ userId: user.id, requestType: mode, model, creditsCharged: 0, estimatedApiCostBrl: 0, status: "error", errorText: "network" }).catch(() => null);
    return Response.json({ error: "Não foi possível concluir a análise. Nenhum crédito foi consumido." }, { status: 502 });
  }

  const result = await openAIResponse.json().catch(() => ({}));
  if (!openAIResponse.ok) {
    const detail = result?.error?.message || "A OpenAI não conseguiu processar esta análise.";
    await logAiUsage({ userId: user.id, requestType: mode, model, creditsCharged: 0, estimatedApiCostBrl: 0, status: "error", errorText: detail }).catch(() => null);
    return Response.json({ error: "Não foi possível concluir a análise. Nenhum crédito foi consumido.", detail }, { status: openAIResponse.status });
  }

  const answer = extractOutputText(result);
  if (!answer) {
    await logAiUsage({ userId: user.id, requestType: mode, model, creditsCharged: 0, estimatedApiCostBrl: 0, status: "empty" }).catch(() => null);
    return Response.json({ error: "Não foi possível concluir a análise. Nenhum crédito foi consumido." }, { status: 502 });
  }

  const usage = result?.usage ? {
    inputTokens: Number(result.usage.input_tokens || 0),
    outputTokens: Number(result.usage.output_tokens || 0),
    totalTokens: Number(result.usage.total_tokens || 0),
  } : { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  let debit;
  try {
    debit = await debitCreditsAfterSuccess({
      user,
      mode: creditMode,
      description: mode === "advanced" ? "Análise avançada IA" : mode === "full" ? "Análise completa IA" : "Assistente IA",
      reference: result?.id || null,
      metadata: { model: result?.model || model, mode },
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Saldo insuficiente.", code: error?.code || "insufficient_credits" }, { status: Number(error?.status) || 402 });
  }

  const estimatedApiCostBrl = ((usage.inputTokens / 1_000_000) * settings.OPENAI_INPUT_COST_PER_1M) + ((usage.outputTokens / 1_000_000) * settings.OPENAI_OUTPUT_COST_PER_1M);
  await logAiUsage({
    userId: user.id,
    requestType: mode,
    model: result?.model || model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    creditsCharged: debit.charged,
    estimatedApiCostBrl,
    status: "success",
  }).catch(() => null);

  return Response.json({
    answer,
    model: result?.model || model,
    responseId: result?.id || null,
    usage,
    billing: { chargedCredits: debit.charged, balance: debit.balance, free: debit.free, bonusUsedBrl: debit.bonusUsedBrl, aiBonusBrl: debit.aiBonusBrl },
    generatedAt: new Date().toISOString(),
  });
}
