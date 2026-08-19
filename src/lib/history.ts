import "server-only";
import { getDailyCloses } from "@/lib/finance";

export type HistoryPoint = { date: string; value: number };

type Hold = { symbol: string; marketValueBase: number };

/**
 * Reconstruct the portfolio value over the last year.
 *
 * Each holding is anchored to its *current* market value (already in the base
 * currency) and scaled by the relative move of its price: value(t) =
 * currentValue × close(t) / latestClose. Using the price ratio (dimensionless)
 * means currency, pence/GBp quirks and quote-vs-declared currency all cancel
 * out, and the most recent point equals today's live total. Holdings without
 * daily history stay flat at their current value instead of being dropped.
 */
export async function getPortfolioHistory(
  holdings: Hold[],
  _base: string,
): Promise<HistoryPoint[]> {
  const active = holdings.filter((h) => h.symbol && h.marketValueBase);
  if (active.length === 0) return [];

  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);

  const series = await Promise.all(
    active.map(async (h) => {
      const rows = await getDailyCloses(h.symbol, from);
      const latest = rows.length ? rows[rows.length - 1].close : 0;
      // Convert each close into a ratio vs the latest close (≈ current price).
      const ratios =
        rows.length && latest > 0
          ? rows.map((r) => ({ t: r.t, ratio: r.close / latest }))
          : [];
      return { value: h.marketValueBase, ratios };
    }),
  );

  const withHistory = series.filter((s) => s.ratios.length > 0);
  // No holding has usable history → a flat line at the current total.
  if (withHistory.length === 0) {
    const total = active.reduce((s, h) => s + h.marketValueBase, 0);
    const today = new Date().toISOString().slice(0, 10);
    return [{ date: today, value: Math.round(total) }];
  }

  const dateSet = new Set<number>();
  for (const s of withHistory) for (const r of s.ratios) dateSet.add(r.t);
  const dates = Array.from(dateSet).sort((a, b) => a - b);

  // Forward-fill each holding's ratio; flat-extend backward with its earliest
  // ratio so a late-starting series doesn't spike when it first appears.
  const pointers = series.map(() => 0);
  const lastRatio = series.map((s) => (s.ratios.length ? s.ratios[0].ratio : 1));

  const byDay = new Map<string, number>();
  for (const t of dates) {
    let value = 0;
    for (let i = 0; i < series.length; i++) {
      const s = series[i];
      if (s.ratios.length === 0) {
        value += s.value; // no history → flat at current value
        continue;
      }
      while (pointers[i] < s.ratios.length && s.ratios[pointers[i]].t <= t) {
        lastRatio[i] = s.ratios[pointers[i]].ratio;
        pointers[i]++;
      }
      value += s.value * lastRatio[i];
    }
    byDay.set(new Date(t).toISOString().slice(0, 10), Math.round(value));
  }

  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, value]) => ({ date, value }));
}
