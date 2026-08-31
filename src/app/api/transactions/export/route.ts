import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { localDateKey } from "@/lib/calc";

/** Export the user's ledger as an .xlsx with the same columns the importer
 *  reads (DATE · TYPE · CATEGORY · AMOUNT · DETAILS) so a file exported here can
 *  be re-imported without loss. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("No autenticado", { status: 401 });
  }
  const userId = session.user.id;

  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Transactions Log");
  ws.columns = [
    { header: "DATE", key: "date", width: 14 },
    { header: "TYPE", key: "type", width: 18 },
    { header: "CATEGORY", key: "category", width: 22 },
    { header: "AMOUNT", key: "amount", width: 12 },
    { header: "DETAILS", key: "details", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const t of rows) {
    ws.addRow({
      date: localDateKey(t.date),
      type: t.kind ?? (t.type === "INCOME" ? "Ingresos" : "Gastos variables"),
      category: t.category ?? "",
      amount: t.amount,
      details: t.description ?? "",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `trackfinance-movimientos-${localDateKey(new Date())}.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
