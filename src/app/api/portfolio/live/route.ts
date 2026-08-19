import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadPortfolio } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snapshot = await loadPortfolio(session.user.id);
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
