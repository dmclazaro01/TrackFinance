import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  monthlyPayment,
  amortizedBalance,
  loanStatus,
  recurringDueForMonth,
  cashEffective,
  completedMonths,
  type CashInput,
  type InsuranceInput,
  type DebtInput,
  type PropertyInput,
  type TransactionInput,
} from "./calc";

// ── Helpers ────────────────────────────────────────────────
const insurance = (over: Partial<InsuranceInput> = {}): InsuranceInput => ({
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

const debt = (over: Partial<DebtInput> = {}): DebtInput => ({
  id: "d1",
  name: "Préstamo coche",
  balance: 12000,
  tin: 0,
  months: 12,
  startDate: null,
  accountId: "acc1",
  ...over,
});

const expense = (over: Partial<TransactionInput> = {}): TransactionInput => ({
  id: "t1",
  type: "EXPENSE",
  kind: "Gastos fijos",
  amount: 63,
  currency: "EUR",
  date: "2026-08-10T00:00:00.000Z",
  category: "Seguros",
  description: null,
  accountId: "acc1",
  cashback: 0,
  ...over,
});

// ── monthlyPayment ─────────────────────────────────────────
describe("monthlyPayment (amortización francesa)", () => {
  it("sin interés reparte el capital a partes iguales", () => {
    assert.equal(monthlyPayment(1200, 0, 12), 100);
  });

  it("con balance 0 la cuota es 0", () => {
    assert.equal(monthlyPayment(0, 3, 240), 0);
  });

  it("calcula la cuota conocida de una hipoteca 100k a 3%/360m (~421,60)", () => {
    const p = monthlyPayment(100000, 3, 360);
    assert.ok(p > 421 && p < 422, `esperado ~421.6, obtenido ${p}`);
  });
});

// ── amortizedBalance ───────────────────────────────────────
describe("amortizedBalance (capital pendiente)", () => {
  it("con 0 cuotas pagadas devuelve el capital íntegro", () => {
    assert.equal(amortizedBalance(12000, 5, 12, 0), 12000);
  });

  it("sin interés, a mitad de plazo queda la mitad del capital", () => {
    assert.equal(amortizedBalance(1200, 0, 12, 6), 600);
  });

  it("al pagar todas las cuotas el capital pendiente es ~0", () => {
    const left = amortizedBalance(12000, 5, 12, 12);
    assert.ok(Math.abs(left) < 1e-6, `esperado ~0, obtenido ${left}`);
  });

  it("balance 0 → 0", () => {
    assert.equal(amortizedBalance(0, 5, 12, 3), 0);
  });
});

// ── loanStatus ─────────────────────────────────────────────
describe("loanStatus", () => {
  it("sin startDate no amortiza: devuelve balance y meses de origen", () => {
    const s = loanStatus({ balance: 10000, tin: 5, months: 60, startDate: null });
    assert.equal(s.balance, 10000);
    assert.equal(s.months, 60);
    assert.equal(s.payment, monthlyPayment(10000, 5, 60));
  });

  it("préstamo saldado → todo a 0", () => {
    assert.deepEqual(loanStatus({ balance: 0, tin: 5, months: 60, startDate: null }), {
      balance: 0,
      months: 0,
      payment: 0,
    });
  });

  it("préstamo iniciado hace mucho está totalmente amortizado hoy", () => {
    const s = loanStatus({ balance: 6000, tin: 0, months: 12, startDate: "2015-01-01" });
    assert.equal(s.balance, 0);
    assert.equal(s.months, 0);
    assert.equal(s.payment, 0);
  });
});

// ── recurringDueForMonth ───────────────────────────────────
describe("recurringDueForMonth — dedupe y filtros", () => {
  it("seguro mensual activo sin movimiento que lo tape → se cobra", () => {
    const total = recurringDueForMonth({
      month: "2026-08",
      transactions: [],
      insurances: [insurance()],
      properties: [],
    });
    assert.equal(total, 63);
  });

  it("un GASTO del mismo importe tapa el recurrente (evita doble conteo)", () => {
    const total = recurringDueForMonth({
      month: "2026-08",
      transactions: [expense({ amount: 63 })],
      insurances: [insurance()],
      properties: [],
    });
    assert.equal(total, 0);
  });

  it("un INGRESO del mismo importe NO tapa el recurrente (fix punto 2)", () => {
    const total = recurringDueForMonth({
      month: "2026-08",
      transactions: [expense({ type: "INCOME", kind: "Ingresos", amount: 63 })],
      insurances: [insurance()],
      properties: [],
    });
    assert.equal(total, 63);
  });

  it("filtra por cuenta de pago cuando se indica accountId", () => {
    const total = recurringDueForMonth({
      month: "2026-08",
      transactions: [],
      insurances: [insurance({ accountId: "otra-cuenta" })],
      properties: [],
      accountId: "acc1",
    });
    assert.equal(total, 0);
  });

  it("una deuda que aún no ha arrancado no se cobra", () => {
    const total = recurringDueForMonth({
      month: "2026-08",
      transactions: [],
      insurances: [],
      properties: [],
      debts: [debt({ startDate: "2030-01-01" })],
    });
    assert.equal(total, 0);
  });

  it("una deuda ya amortizada (plazo agotado) no se cobra", () => {
    const total = recurringDueForMonth({
      month: "2026-08",
      transactions: [],
      insurances: [],
      properties: [],
      debts: [debt({ startDate: "2020-01-01", months: 12 })],
    });
    assert.equal(total, 0);
  });

  it("una deuda vigente sin interés cobra su cuota (capital/meses)", () => {
    const total = recurringDueForMonth({
      month: "2026-08",
      transactions: [],
      insurances: [],
      properties: [],
      debts: [debt({ startDate: "2026-08-01", balance: 12000, tin: 0, months: 12 })],
    });
    assert.equal(total, 1000);
  });
});

// ── completedMonths ────────────────────────────────────────
describe("completedMonths", () => {
  it("una fecha inválida devuelve 0", () => {
    assert.equal(completedMonths("no-es-fecha"), 0);
  });

  it("una fecha futura devuelve 0 (nunca negativo)", () => {
    const now = new Date();
    const future = new Date(now.getFullYear() + 2, now.getMonth(), 1, 12).toISOString();
    assert.equal(completedMonths(future), 0);
  });

  it("cuenta los meses naturales completos transcurridos", () => {
    const now = new Date();
    // Día 1 de hace 6 meses: como hoy es día ≥ 1, no se resta el mes en curso.
    const sixAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1, 12).toISOString();
    assert.equal(completedMonths(sixAgo), 6);
  });

  it("no cuenta el mes en curso si aún no se ha cumplido el día ancla", () => {
    const now = new Date();
    // Mismo mes, pero mañana → 0 meses completos (el día ancla no ha llegado).
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
    // Solo comprobable de forma estable si mañana sigue en este mes.
    if (tomorrow.getMonth() === now.getMonth()) {
      assert.equal(completedMonths(tomorrow.toISOString()), 0);
    }
  });
});

// ── cashEffective ──────────────────────────────────────────
describe("cashEffective", () => {
  const acct = (over: Partial<CashInput> = {}): CashInput => ({
    id: "acc1",
    name: "Cuenta",
    balance: 1000,
    currency: "EUR",
    apr: 0,
    cashbackPercent: 0,
    updatedAt: new Date().toISOString(), // ancla = hoy → 0 meses de interés
    ...over,
  });

  it("sin interés ni movimientos, el saldo efectivo es el introducido", () => {
    const eff = cashEffective(acct());
    assert.equal(eff.effectiveBalance, 1000);
    assert.equal(eff.accrued, 0);
    assert.equal(eff.monthlyGeneration, 0);
  });

  it("aplica el delta de movimientos al saldo efectivo", () => {
    const eff = cashEffective(acct(), -150);
    assert.equal(eff.effectiveBalance, 850);
    assert.equal(eff.txDelta, -150);
  });

  it("con APR>0 genera interés el mes siguiente sobre el saldo efectivo", () => {
    const eff = cashEffective(acct({ apr: 12 }), 0); // 12% anual = 1% mensual
    // 0 meses completos → sin interés acumulado aún, pero sí generación futura
    assert.equal(eff.accrued, 0);
    assert.ok(Math.abs(eff.monthlyGeneration - 10) < 1e-9, `esperado 10, obtenido ${eff.monthlyGeneration}`);
  });
});
