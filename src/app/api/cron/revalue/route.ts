import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeAppraisal } from "@/lib/valuation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily re-valuation of every property with online appraisal enabled.
 * Triggered by Vercel Cron (see vercel.json). Protected by CRON_SECRET:
 * Vercel attaches `Authorization: Bearer <CRON_SECRET>` to cron requests.
 */
export async function GET(req: Request) {
  // Fail-closed: sin CRON_SECRET configurado el endpoint queda DENEGADO —
  // nunca público por un despiste de configuración.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const properties = await prisma.property.findMany({
    where: { autoValuation: true, cadastralRef: { not: null } },
    select: { id: true, cadastralRef: true },
  });

  let updated = 0;
  for (const p of properties) {
    if (!p.cadastralRef) continue;
    const appraisal = await computeAppraisal(p.cadastralRef);
    if (!appraisal) continue;
    await prisma.property.update({
      where: { id: p.id },
      data: {
        surfaceM2: appraisal.surfaceM2,
        province: appraisal.province,
        appraisedValue: appraisal.value,
        appraisedAt: new Date(),
      },
    });
    // Histórico: sólo un punto nuevo si el valor ha cambiado — la tabla no
    // debe crecer con duplicados diarios.
    const last = await prisma.propertyValuation.findFirst({
      where: { propertyId: p.id },
      orderBy: { date: "desc" },
      select: { value: true },
    });
    if (last?.value !== appraisal.value) {
      await prisma.propertyValuation.create({
        data: { propertyId: p.id, value: appraisal.value },
      });
    }
    updated += 1;
  }

  return NextResponse.json({ ok: true, scanned: properties.length, updated });
}
