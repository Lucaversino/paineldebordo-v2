import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { officialWaypoints } from "../../../../db/schema";
import { getPanelUserFromRequest } from "../../../../lib/panelAuth";
import { isSuperAdmin } from "../../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "Somente o administrador principal pode excluir waypoints." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const ids: unknown = body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 ||
        ids.some(id => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "Seleção inválida. Escolha de 1 a 200 IDs únicos por operação." }, { status: 400 });
    }
    const db = getDb();
    // Protege tanto as referências privadas quanto as públicas de outros proprietários.
    const deleted = await db.delete(officialWaypoints)
      .where(and(inArray(officialWaypoints.id, ids as number[]), eq(officialWaypoints.createdBy, user.id)))
      .returning({ id: officialWaypoints.id });
    return NextResponse.json({ deleted: deleted.length, deletedIds: deleted.map(row => row.id) });
  } catch (error) {
    console.error("waypoint bulk delete failed", error);
    return NextResponse.json({ error: "Não foi possível excluir os waypoints selecionados." }, { status: 503 });
  }
}
