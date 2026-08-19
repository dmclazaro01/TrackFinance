import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadPortfolio } from "@/lib/portfolio";
import { getPortfolioHistory } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snapshot = await loadPortfolio(session.user.id);
  const series = await getPortfolioHistory(
    snapshot.holdings.map((h) => ({
      symbol: h.symbol,
      marketValueBase: h.marketValueBase,
    })),
    snapshot.summary.base,
  );
  return NextResponse.json(
    { series, base: snapshot.summary.base },
    { headers: { "Cache-Control": "no-store" } },
  );
}
