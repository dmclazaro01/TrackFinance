import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchSymbol } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const results = await searchSymbol(q);
  return NextResponse.json({ results });
}
