import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { tripCalendarDays, trips } from "../../../db/schema";
import { requirePanelUserResponse } from "../../../lib/panelAuth";
export const dynamic = "force-dynamic";
const validDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z")) && new Date(v + "T12:00:00Z").toISOString().slice(0,10) === v;
async function ownedTrip(id:number, userId:string) { return (await getDb().select({id:trips.id}).from(trips).where(and(eq(trips.id,id),eq(trips.ownerId,userId)))).length>0; }
export async function GET(r:NextRequest) {
 const auth=await requirePanelUserResponse(); if(auth.response)return auth.response;
 const tripId=Number(r.nextUrl.searchParams.get("tripId"));
 if(!Number.isSafeInteger(tripId)||tripId<=0)return Response.json({error:"Viagem inválida."},{status:400});
 if(!(await ownedTrip(tripId,auth.user!.id)))return Response.json({error:"Viagem não encontrada."},{status:404});
 try {const records=await getDb().select({date:tripCalendarDays.day,note:tripCalendarDays.note,lostReason:tripCalendarDays.lostReason}).from(tripCalendarDays).where(and(eq(tripCalendarDays.tripId,tripId),eq(tripCalendarDays.ownerId,auth.user!.id)));return Response.json({records},{headers:{"Cache-Control":"no-store"}});} catch(e){console.error("calendar GET",e);return Response.json({error:"Falha ao ler calendário. A migração V277 foi executada?"},{status:500});}
}
export async function PUT(r:NextRequest) {
 const auth=await requirePanelUserResponse(); if(auth.response)return auth.response;
 const b=await r.json().catch(()=>null); const tripId=Number(b?.tripId);
 if(!Number.isSafeInteger(tripId)||tripId<=0||!validDate(b?.date)||typeof b?.note!=="string"||b.note.length>3000||typeof b?.lostReason!=="string"||b.lostReason.length>120)return Response.json({error:"Registro inválido."},{status:400});
 if(!(await ownedTrip(tripId,auth.user!.id)))return Response.json({error:"Viagem não encontrada."},{status:404});
 const note=b.note.trim(),lostReason=b.lostReason.trim();
 try {const db=getDb();if(!note&&!lostReason)await db.delete(tripCalendarDays).where(and(eq(tripCalendarDays.tripId,tripId),eq(tripCalendarDays.ownerId,auth.user!.id),eq(tripCalendarDays.day,b.date)));else await db.insert(tripCalendarDays).values({ownerId:auth.user!.id,tripId,day:b.date,note,lostReason}).onConflictDoUpdate({target:[tripCalendarDays.ownerId,tripCalendarDays.tripId,tripCalendarDays.day],set:{note,lostReason,updatedAt:new Date().toISOString()}});return Response.json({ok:true,date:b.date,note,lostReason});}catch(e){console.error("calendar PUT",e);return Response.json({error:"Falha ao salvar no banco; alterações não confirmadas."},{status:500});}
}
