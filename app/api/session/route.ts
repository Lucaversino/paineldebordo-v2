import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getPanelUser } from "../../../lib/panelAuth";
import { ensureWallet, getBillingSettings, isSuperAdmin } from "../../../lib/credits";

export async function GET() {
  const user = await getPanelUser();
  if (!user) return Response.json({ authenticated: false, active: false, user: null });
  const admin = isSuperAdmin(user);

  try {
    const settings = await getBillingSettings();
    const wallet = await ensureWallet(user, settings);
    return Response.json({
      authenticated: true,
      active: true,
      user: { displayName: user.displayName, email: user.email },
      billing: {
        isSuperAdmin: admin,
        freeAisAccess: false,
        freeAiAccess: true,
        balance: wallet.balance,
      },
    });
  } catch (error) {
    console.error("session billing load failed", error);
    return Response.json({
      authenticated: true,
      active: true,
      user: { displayName: user.displayName, email: user.email },
      billing: {
        isSuperAdmin: admin,
        freeAisAccess: false,
        freeAiAccess: true,
        balance: null,
      },
    });
  }
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
