import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accountTxDelta, type CashInput, type InsuranceInput, type TransactionInput } from "./calc";

const account = (over: Partial<CashInput> = {}): CashInput => ({
  id: "acc1",
  name: "Sabadell",
  balance: 257,
  currency: "EUR",
  apr: 0,
  cashbackPercent: 0,
  updatedAt: "2026-08-05T12:00:00.000Z",
  ...over,
});

const monthlyInsurance = (over: Partial<InsuranceInput> = {}): InsuranceInput => ({
  id: "ins1",
  name: "Seguro privado",
  type: "HEALTH",
  provider: null,
  premium: 63,
  frequency: "MONTHLY",
  coverage: 0,
  currency: "EUR",
  renewalDate: null,
  startDate: null,
  accountId: "acc1",
  ...over,
});

describe("accountTxDelta — recurrentes día 1", () => {
  it("no descuenta el recurrente del mes del ancla si el saldo se fijó después del día 1", () => {
    // Saldo real a día 5 ya refleja el seguro cobrado el día 1.
    const delta = accountTxDelta(account({ updatedAt: "2026-08-05T12:00:00.000Z" }), [], [
      monthlyInsurance(),
    ]);
    assert.equal(delta, 0);
  });

  it("tampoco descuenta el del mes del ancla si el saldo se fijó el día 1 (ya cobrado en el banco)", () => {
    const delta = accountTxDelta(account({ updatedAt: "2026-08-01T08:00:00.000Z" }), [], [
      monthlyInsurance(),
    ]);
    assert.equal(delta, 0);
  });

  it("descuenta recurrentes de meses posteriores al del ancla", () => {
    // Ancla en julio día 5 → julio no se cobra de nuevo; agosto (hoy) sí.
    // Asume la fecha del sistema ~ ago 2026 (env del proyecto).
    const delta = accountTxDelta(
      account({ updatedAt: "2026-07-05T12:00:00.000Z" }),
      [],
      [monthlyInsurance()],
    );
    // julio (ancla mid-month) skip + agosto due = -63
    assert.equal(delta, -63);
  });

  it("sigue aplicando movimientos posteriores al ancla", () => {
    const txs: TransactionInput[] = [
      {
        id: "t1",
        type: "EXPENSE",
        kind: "Gastos variables",
        amount: 45,
        currency: "EUR",
        date: "2026-08-10T00:00:00.000Z",
        category: "Otros",
        description: "Vinilo",
        accountId: "acc1",
        cashback: 0,
      },
    ];
    const delta = accountTxDelta(
      account({ updatedAt: "2026-08-05T12:00:00.000Z" }),
      txs,
      [monthlyInsurance()],
    );
    assert.equal(delta, -45);
  });
});
