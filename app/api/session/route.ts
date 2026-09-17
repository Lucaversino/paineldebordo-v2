import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getPanelUser } from "../../../lib/panelAuth";

export async function GET() {
  const user = await getPanelUser();
  return Response.json({
    authenticated: Boolean(user),
    active: Boolean(user),
    user: user ? { displayName: user.displayName, email: user.email } : null,
  });
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
