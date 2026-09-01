import { NextResponse } from "next/server";
import { ensureMonthlySalaryForAll } from "@/lib/salary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Mensual: asegura la nómina del mes en curso para todos los usuarios.
 * Disparado por Vercel Cron el día 1 a las 06:00 (ver vercel.json).
 * Protegido con CRON_SECRET igual que /api/cron/revalue.
 * Idempotente: si ya existe categoría Nómina en el mes, no duplica.
 * No toca monthlyIncome/accountFlow (teóricos) -> no hay doble conteo: solo crea Transaction INCOME.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await ensureMonthlySalaryForAll();
  return NextResponse.json({ ok: true, ...result });
}
