import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getPanelUser } from "../../../lib/panelAuth";
import { isSuperAdmin } from "../../../lib/credits";

export async function GET() {
  const user = await getPanelUser();
  if (!user) return Response.json({ authenticated: false, active: false, user: null });
  const admin = isSuperAdmin(user);
  return Response.json({
    authenticated: true,
    active: true,
    user: { displayName: user.displayName, email: user.email },
    billing: {
      isSuperAdmin: admin,
      freeAisAccess: admin,
      freeAiAccess: admin,
    },
  });
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
