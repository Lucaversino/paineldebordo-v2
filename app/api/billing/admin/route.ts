import { NextRequest, NextResponse } from "next/server";
import { getPanelUserFromRequest } from "../../../../lib/panelAuth";
import {
  getAdminBillingStats,
  getBillingSettings,
  isSuperAdmin,
  listAdminCreditUsers,
  updateBillingSettings,
} from "../../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} demorou mais que ${Math.round(ms / 1000)}s.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await withTimeout(getPanelUserFromRequest(request), 8_000, "Autenticação");
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(request.url);
    const section = url.searchParams.get("section") || "overview";
    const search = url.searchParams.get("search") || "";

    if (section === "users") {
      const users = await withTimeout(listAdminCreditUsers(user, search), 10_000, "Lista de usuários");
      return NextResponse.json({ users });
    }

    const [settings, stats] = await withTimeout(
      Promise.all([getBillingSettings(), getAdminBillingStats(user)]),
      12_000,
      "Resumo administrativo",
    );
    return NextResponse.json({ settings, stats });
  } catch (error) {
    console.error("billing admin GET failed", error);
    return NextResponse.json(
      { error: messageOf(error, "Não foi possível carregar o painel administrativo.") },
      { status: 503 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await withTimeout(getPanelUserFromRequest(request), 8_000, "Autenticação");
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const settings = await withTimeout(updateBillingSettings(user, body?.settings || {}), 12_000, "Salvamento das configurações");

    let stats = null;
    try {
      stats = await withTimeout(getAdminBillingStats(user), 8_000, "Atualização dos indicadores");
    } catch (error) {
      console.warn("billing admin stats refresh skipped", error);
    }

    return NextResponse.json({ ok: true, settings, stats });
  } catch (error: any) {
    console.error("billing admin PUT failed", error);
    return NextResponse.json(
      { error: error?.message || "Não foi possível salvar as configurações." },
      { status: Number(error?.status) || 503 },
    );
  }
}
