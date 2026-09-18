import { NextRequest, NextResponse } from "next/server";
import { getPanelUser } from "../../../lib/panelAuth";
import {
  ensureWallet,
  getBillingSettings,
  isSuperAdmin,
  listCreditTransactions,
  priceForCredits,
} from "../../../lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [wallet, settings, transactions] = await Promise.all([
    ensureWallet(user),
    getBillingSettings(),
    listCreditTransactions(user.id, Number(new URL(request.url).searchParams.get("limit")) || 50),
  ]);
  const packages = [10, 20, 50, 100].map((credits) => ({
    credits,
    amountBrl: priceForCredits(settings, credits),
  }));
  return NextResponse.json({
    wallet,
    settings: {
      creditUnitPrice: settings.CREDIT_UNIT_PRICE,
      aisSingleCredits: settings.AIS_SINGLE_QUERY_CREDITS,
      aisUpdateCredits: settings.AIS_UPDATE_CREDITS,
      aiBasicCredits: settings.AI_BASIC_QUERY_CREDITS,
      aiFullCredits: settings.AI_FULL_ANALYSIS_CREDITS,
      aiAdvancedCredits: settings.AI_ADVANCED_ANALYSIS_CREDITS,
    },
    packages,
    transactions,
    isSuperAdmin: isSuperAdmin(user),
  });
}
