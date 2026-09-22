import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { adminFreeVessels } from "../../../db/schema";
import { getPanelUserFromRequest } from "../../../lib/panelAuth";
import { isSuperAdmin } from "../../../lib/credits";
import {
  ensureAdminFreeVesselsTable,
  listAdminFreeVessels,
  refreshAdminFreeVessel,
  rowToAdminFreeVessel,
  searchFreeForAdmin,
  vesselKey,
} from "../../../lib/adminFreeVessels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cleanText(value: unknown, max = 160) {
  return value == null ? "" : String(value).trim().slice(0, max);
}

function cleanDigits(value: unknown) {
  return cleanText(value).replace(/\D/g, "");
}

async function requireAdmin(request: NextRequest) {
  const user = await getPanelUserFromRequest(request);
  if (!user) return { user: null, response: NextResponse.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 }) };
  if (!isSuperAdmin(user)) return { user: null, response: NextResponse.json({ error: "Acesso administrativo negado." }, { status: 403 }) };
  return { user, response: null };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Sessão encerrada. Entre novamente no painel." }, { status: 401 });
    const db = getDb();
    const rows = await listAdminFreeVessels(db);
    const canManage = isSuperAdmin(user);
    return NextResponse.json({
      vessels: rows.map(rowToAdminFreeVessel),
      canManage,
      automaticSchedule: "daily",
      creditCost: 0,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("admin free vessels GET failed", error);
    return NextResponse.json({ error: "Não foi possível carregar os barcos FREE do administrador." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;

  try {
    const db = getDb();
    await ensureAdminFreeVesselsTable(db);
    const body = await request.json().catch(() => ({}));
    const action = cleanText(body?.action, 40).toLowerCase();

    if (action === "search") {
      const result = await searchFreeForAdmin(body?.query);
      return NextResponse.json({ vessels: result.vessels, total: result.total, creditCost: 0 });
    }

    if (action === "add") {
      const source = body?.vessel || {};
      const identity = {
        name: cleanText(source?.name, 120) || "Embarcação FREE",
        mmsi: cleanDigits(source?.mmsi),
        imo: cleanDigits(source?.imo),
        callsign: cleanText(source?.callsign, 80),
        flag: cleanText(source?.flag, 24),
      };
      const key = vesselKey(identity);
      if (!key) return NextResponse.json({ error: "Barco inválido: informe nome, MMSI ou IMO." }, { status: 400 });
      const now = new Date().toISOString();
      const [saved] = await db.insert(adminFreeVessels).values({
        vesselKey: key,
        name: identity.name,
        mmsi: identity.mmsi || null,
        imo: identity.imo || null,
        callsign: identity.callsign || null,
        flag: identity.flag || null,
        automatic: true,
        createdBy: auth.user.id,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: adminFreeVessels.vesselKey,
        set: {
          name: identity.name,
          mmsi: identity.mmsi || null,
          imo: identity.imo || null,
          callsign: identity.callsign || null,
          flag: identity.flag || null,
          automatic: true,
          updatedAt: now,
        },
      }).returning();
      const refreshed = await refreshAdminFreeVessel(db, saved);
      return NextResponse.json({ vessel: rowToAdminFreeVessel(refreshed), added: true });
    }

    if (action === "refresh-all") {
      const rows = await db.select().from(adminFreeVessels).where(eq(adminFreeVessels.automatic, true)).limit(60);
      const updated = [];
      for (let i = 0; i < rows.length; i += 4) {
        const batch = rows.slice(i, i + 4);
        const refreshed = await Promise.all(batch.map((item) => refreshAdminFreeVessel(db, item)));
        updated.push(...refreshed);
      }
      return NextResponse.json({ vessels: updated.map(rowToAdminFreeVessel), updated: updated.length });
    }

    const id = Number(body?.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Barco inválido." }, { status: 400 });
    const [row] = await db.select().from(adminFreeVessels).where(eq(adminFreeVessels.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "Barco não encontrado." }, { status: 404 });

    if (action === "refresh") {
      const refreshed = await refreshAdminFreeVessel(db, row);
      return NextResponse.json({ vessel: rowToAdminFreeVessel(refreshed) });
    }

    if (action === "automatic") {
      const automatic = body?.automatic !== false;
      const now = new Date().toISOString();
      const [updated] = await db.update(adminFreeVessels).set({ automatic, updatedAt: now }).where(eq(adminFreeVessels.id, id)).returning();
      return NextResponse.json({ vessel: rowToAdminFreeVessel(updated) });
    }

    return NextResponse.json({ error: "Ação administrativa inválida." }, { status: 400 });
  } catch (error: any) {
    console.error("admin free vessels POST failed", error);
    const status = Number(error?.status) || 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao processar barcos FREE administrativos." }, { status: status >= 400 && status < 600 ? status : 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;
  try {
    const db = getDb();
    await ensureAdminFreeVesselsTable(db);
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Barco inválido." }, { status: 400 });
    const [deleted] = await db.delete(adminFreeVessels).where(eq(adminFreeVessels.id, id)).returning({ id: adminFreeVessels.id });
    if (!deleted) return NextResponse.json({ error: "Barco não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin free vessels DELETE failed", error);
    return NextResponse.json({ error: "Não foi possível excluir o barco FREE." }, { status: 503 });
  }
}
