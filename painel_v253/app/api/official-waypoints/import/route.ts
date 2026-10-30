import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { officialWaypoints } from "../../../../db/schema";
import { getPanelUserFromRequest } from "../../../../lib/panelAuth";
import { isSuperAdmin } from "../../../../lib/credits";
import { WAYPOINT_TYPES } from "../../../../lib/officialWaypointIcons";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const user = await getPanelUserFromRequest(req);
    if (!user) return NextResponse.json({error:"Sessão expirada."},{status:401});
    if (!isSuperAdmin(user)) return NextResponse.json({error:"Somente o administrador pode importar marcas."},{status:403});
    const body = await req.json();
    const raw = body?.waypoints;
    if (!Array.isArray(raw) || !raw.length || raw.length > 500) return NextResponse.json({error:"Envie entre 1 e 500 marcas."},{status:400});
    const allowed = new Set<string>(WAYPOINT_TYPES.map(x => x.value));
    const now = new Date().toISOString();
    const rows = raw.map((x: any) => ({
      name:String(x.name || "Marca").trim().slice(0,80) || "Marca",
      waypointType:allowed.has(x.waypointType) ? x.waypointType : "rock",
      latitude:Number(x.latitude), longitude:Number(x.longitude),
      description:String(x.description || "").slice(0,500),
      visible:x.visible !== false, scope:x.scope === "private" ? "private" : "public",
      createdBy:user.id, createdAt:now, updatedAt:now,
    }));
    if (rows.some(x => !Number.isFinite(x.latitude) || !Number.isFinite(x.longitude) || Math.abs(x.latitude)>90 || Math.abs(x.longitude)>180)) return NextResponse.json({error:"Coordenadas inválidas."},{status:400});
    const db = getDb();
    await db.execute(sql`alter table public.official_waypoints add column if not exists scope text not null default 'public'`);
    await db.insert(officialWaypoints).values(rows);
    return NextResponse.json({imported:rows.length});
  } catch (e) {console.error("GPX import failed",e); return NextResponse.json({error:"Não foi possível importar GPX. Verifique a tabela oficial_waypoints."},{status:503});}
}
