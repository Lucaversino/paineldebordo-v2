import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getPanelUser } from "../../../lib/panelAuth";
import { ensureWallet, getBillingSettings, priceForCredits } from "../../../lib/credits";

export async function GET() {
  const user = await getPanelUser();
  if (!user) return Response.json({ authenticated: false, active: false, user: null });
  try {
    const wallet = await ensureWallet(user);
    const settings = await getBillingSettings();
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
  } catch (error) {
    console.error("session billing unavailable", error);
    return Response.json({ authenticated: true, active: true, user: { displayName: user.displayName, email: user.email }, billing: null, billingUnavailable: true });
  }
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
