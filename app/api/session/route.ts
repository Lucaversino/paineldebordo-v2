import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getPanelUser } from "../../../lib/panelAuth";
import { ensureWallet, getBillingSettings, priceForCredits } from "../../../lib/credits";

export async function GET() {
  const user = await getPanelUser();
  if (!user) return Response.json({ authenticated: false, active: false, user: null });
  const [wallet, settings] = await Promise.all([ensureWallet(user), getBillingSettings()]);
  return Response.json({
    authenticated: true,
    active: true,
    user: { displayName: user.displayName, email: user.email },
    billing: {
      balance: wallet.balance,
      role: wallet.role,
      isSuperAdmin: wallet.isSuperAdmin,
      freeAisAccess: wallet.freeAisAccess,
      freeAiAccess: wallet.freeAiAccess,
      unitPrice: settings.CREDIT_UNIT_PRICE,
      equivalentBrl: priceForCredits(settings, wallet.balance),
    },
  });
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
