import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeTransfer } from "./calc";

describe("computeTransfer", () => {
  const origin = { quantity: 100, avgBuyPrice: 10 };

  it("modo participaciones: unitsOut = amount, valueMoved = units * priceFrom", () => {
    const r = computeTransfer({
      mode: "units",
      amount: 20,
      priceFrom: 12,
      priceTo: 24,
      originQuantity: origin.quantity,
      originAvgBuyPrice: origin.avgBuyPrice,
      dest: { kind: "existing", quantity: 50, avgBuyPrice: 20 },
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.unitsOut, 20);
    assert.equal(r.valueMoved, 240);
    assert.equal(r.origin.quantity, 80);
    assert.equal(r.origin.avgBuyPrice, 10);
    // unitsIn = 240/24 = 10; dest qty = 60; avg = (50*20 + 240)/60 = 20.666...
    assert.ok(Math.abs(r.dest.quantity - 60) < 1e-9);
    assert.ok(Math.abs(r.dest.avgBuyPrice - 20.6666666667) < 1e-6);
  });

  it("modo €: unitsOut = amountEur / priceFrom", () => {
    const r = computeTransfer({
      mode: "eur",
      amount: 240,
      priceFrom: 12,
      priceTo: 24,
      originQuantity: 100,
      originAvgBuyPrice: 10,
      dest: { kind: "new" },
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.unitsOut, 20);
    assert.equal(r.valueMoved, 240);
    assert.equal(r.dest.quantity, 10); // 240/24
    assert.equal(r.dest.avgBuyPrice, 24);
    assert.equal(r.origin.quantity, 80);
  });

  it("destino nuevo: qty = valueMoved/priceTo, avg = priceTo", () => {
    const r = computeTransfer({
      mode: "units",
      amount: 10,
      priceFrom: 100,
      priceTo: 50,
      originQuantity: 10,
      originAvgBuyPrice: 80,
      dest: { kind: "new" },
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dest.kind, "new");
    assert.equal(r.dest.quantity, 20);
    assert.equal(r.dest.avgBuyPrice, 50);
  });

  it("fluctuación: precio venta ≠ precio compra cambia unitsIn", () => {
    // Vende 10 u a 100 → 1000 €; compra a 80 → 12.5 u
    const r = computeTransfer({
      mode: "units",
      amount: 10,
      priceFrom: 100,
      priceTo: 80,
      originQuantity: 10,
      originAvgBuyPrice: 90,
      dest: { kind: "new" },
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.valueMoved, 1000);
    assert.equal(r.unitsIn, 12.5);
    assert.equal(r.dest.quantity, 12.5);
    assert.equal(r.dest.avgBuyPrice, 80);
  });

  it("error si unitsOut > originQuantity", () => {
    const r = computeTransfer({
      mode: "units",
      amount: 150,
      priceFrom: 10,
      priceTo: 10,
      originQuantity: 100,
      originAvgBuyPrice: 10,
      dest: { kind: "new" },
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /suficientes|cantidad|participaciones/i);
  });

  it("error si priceFrom o priceTo ≤ 0", () => {
    const r = computeTransfer({
      mode: "units",
      amount: 1,
      priceFrom: 0,
      priceTo: 10,
      originQuantity: 10,
      originAvgBuyPrice: 1,
      dest: { kind: "new" },
    });
    assert.equal(r.ok, false);
  });

  it("error si amount ≤ 0", () => {
    const r = computeTransfer({
      mode: "eur",
      amount: 0,
      priceFrom: 10,
      priceTo: 10,
      originQuantity: 10,
      originAvgBuyPrice: 1,
      dest: { kind: "new" },
    });
    assert.equal(r.ok, false);
  });

  it("permite vaciar el origen a quantity 0 (no error)", () => {
    const r = computeTransfer({
      mode: "units",
      amount: 100,
      priceFrom: 10,
      priceTo: 10,
      originQuantity: 100,
      originAvgBuyPrice: 8,
      dest: { kind: "existing", quantity: 0, avgBuyPrice: 10 },
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.origin.quantity, 0);
    assert.equal(r.origin.avgBuyPrice, 8);
  });
});
