import "server-only";
import YahooFinance from "yahoo-finance2";

// v4 requires instantiating the client class. Suppress the one-time survey notice.
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
} as unknown as ConstructorParameters<typeof YahooFinance>[0]);

// v4's exported union types resolve awkwardly through the module proxy, so we
// describe just the fields we consume with light local shapes and cast.
type RawQuote = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  regularMarketPrice?: number;
  postMarketPrice?: number;
  preMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  marketState?: string;
};

type RawSearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  typeDisp?: string;
};

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  marketState: string | null;
};

export type SearchResult = {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
  isin: string | null;
};

/**
 * Fetch live quotes for a list of Yahoo Finance symbols.
 * Returns a map keyed by the *requested* symbol (upper-cased).
 */
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const unique = Array.from(
    new Set(symbols.map((s) => s.trim()).filter(Boolean)),
  );
  const out: Record<string, Quote> = {};
  if (unique.length === 0) return out;

  await Promise.all(
    unique.map(async (symbol) => {
      try {
        const q = (await yahooFinance.quote(symbol)) as unknown as RawQuote | null;
        if (!q) return;
        const price =
          q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? null;
        if (price == null) return;
        out[symbol.toUpperCase()] = {
          symbol: q.symbol ?? symbol,
          name: q.shortName ?? q.longName ?? symbol,
          price,
          currency: q.currency ?? "USD",
          previousClose: q.regularMarketPreviousClose ?? null,
          change: q.regularMarketChange ?? null,
          changePercent: q.regularMarketChangePercent ?? null,
          marketState: q.marketState ?? null,
        };
      } catch (err) {
        // El símbolo se valorará a precio de coste y aparecerá en stalePrices.
        console.warn(`[finance] quote failed for ${symbol}:`, err);
      }
    }),
  );

  return out;
}

/**
 * Search Yahoo Finance for a symbol by name, ticker or ISIN.
 * Works for stocks, ETFs and many funds via their ISIN.
 */
export async function searchSymbol(query: string): Promise<SearchResult[]> {
  const query2 = query.trim();
  if (!query2) return [];
  try {
    const res = (await yahooFinance.search(query2, {
      quotesCount: 10,
      newsCount: 0,
    })) as unknown as { quotes?: RawSearchQuote[] };
    const quotes = res?.quotes ?? [];
    const isIsin = /^[A-Z]{2}[A-Z0-9]{9}\d$/i.test(query2);
    return quotes
      .filter((item) => typeof item.symbol === "string")
      .map((item) => ({
        symbol: String(item.symbol),
        name: String(item.shortname ?? item.longname ?? item.symbol ?? ""),
        exchange: item.exchDisp ? String(item.exchDisp) : null,
        type: item.typeDisp ? String(item.typeDisp) : null,
        isin: isIsin ? query2.toUpperCase() : null,
      }));
  } catch {
    return [];
  }
}

export type DcaResult = {
  units: number; // extra units accrued via monthly contributions
  cost: number; // total invested via DCA (in the holding's currency)
  contributions: number; // number of monthly contributions so far
  nextDate: string | null; // next scheduled contribution (ISO date)
};

const EMPTY_DCA: DcaResult = {
  units: 0,
  cost: 0,
  contributions: 0,
  nextDate: null,
};

/** Move a date that lands on a weekend to the next business day. */
function toBusinessDay(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  if (day === 6) d.setDate(d.getDate() + 2);
  else if (day === 0) d.setDate(d.getDate() + 1);
  return d;
}

export type DailyRow = { t: number; close: number };
const dailyCache = new Map<string, { rows: DailyRow[]; at: number }>();
const DAILY_TTL_MS = 6 * 60 * 60 * 1000;
const DAILY_CACHE_MAX = 100;

/** Insert con desalojo del más antiguo: los caches en memoria no deben crecer
 *  sin límite (en `next dev` el proceso vive para siempre). */
function boundedSet<K, V>(map: Map<K, V>, key: K, value: V, max: number) {
  if (!map.has(key) && map.size >= max) {
    map.delete(map.keys().next().value as K);
  }
  map.set(key, value);
}

export async function getDailyCloses(symbol: string, start: Date): Promise<DailyRow[]> {
  const key = `${symbol.toUpperCase()}|${start.getFullYear()}-${start.getMonth()}`;
  const cached = dailyCache.get(key);
  if (cached && Date.now() - cached.at < DAILY_TTL_MS) return cached.rows;
  try {
    const chart = (await yahooFinance.chart(symbol, {
      period1: start,
      interval: "1d",
    })) as unknown as { quotes?: Array<{ date?: Date | string; close?: number | null }> };
    const rows: DailyRow[] = [];
    for (const q of chart?.quotes ?? []) {
      if (q.close == null || !q.date) continue;
      const d = q.date instanceof Date ? q.date : new Date(q.date);
      rows.push({ t: d.getTime(), close: q.close });
    }
    rows.sort((a, b) => a.t - b.t);
    boundedSet(dailyCache, key, { rows, at: Date.now() }, DAILY_CACHE_MAX);
    return rows;
  } catch (err) {
    console.warn(`[finance] getDailyCloses failed for ${symbol}:`, err);
    return [];
  }
}

/**
 * Accrue a monthly Dollar-Cost-Averaging plan: from `start`, invest
 * `monthlyAmount` on the same day each month. Contribution dates that fall on a
 * weekend roll forward to the next business day; the buy price is the close of
 * that trading day (or the next available one, which also covers holidays).
 * Falls back to `fallbackPrice` when history is unavailable.
 */
export async function computeDca(
  symbol: string,
  start: Date,
  monthlyAmount: number,
  fallbackPrice: number | null,
): Promise<DcaResult> {
  if (!monthlyAmount || monthlyAmount <= 0 || !start || Number.isNaN(start.getTime())) {
    return { ...EMPTY_DCA };
  }
  const now = new Date();
  if (start > now) {
    return { ...EMPTY_DCA, nextDate: toBusinessDay(start).toISOString() };
  }

  // Monthly contribution dates up to today, each rolled to a business day.
  const dates: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= now) {
    dates.push(toBusinessDay(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const nextDate = toBusinessDay(new Date(cursor)).toISOString();

  const rows = await getDailyCloses(symbol, start);

  // Price on a date = close of the first trading day >= that date.
  const priceOn = (d: Date): number | null => {
    const t = d.getTime();
    for (const row of rows) {
      if (row.t >= t) return row.close;
    }
    return rows.length ? rows[rows.length - 1].close : null;
  };

  let units = 0;
  let cost = 0;
  let lastClose = fallbackPrice ?? null;
  for (const d of dates) {
    const close = priceOn(d) ?? lastClose ?? fallbackPrice;
    if (close && close > 0) {
      units += monthlyAmount / close;
      lastClose = close;
    }
    cost += monthlyAmount;
  }

  return { units, cost, contributions: dates.length, nextDate };
}

const fxCache = new Map<string, { rate: number; at: number }>();
const FX_TTL_MS = 5 * 60 * 1000;
const FX_CACHE_MAX = 100;

/**
 * Exchange rate to convert an amount in `from` currency into `to` currency.
 * 1 unit of `from` = <rate> units of `to`.
 */
export async function getFxRate(from: string, to: string): Promise<number> {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b) return 1;

  const key = `${a}${b}`;
  const cached = fxCache.get(key);
  if (cached && Date.now() - cached.at < FX_TTL_MS) return cached.rate;

  try {
    const q = (await yahooFinance.quote(`${a}${b}=X`)) as unknown as RawQuote | null;
    const rate = q?.regularMarketPrice;
    if (rate && rate > 0) {
      boundedSet(fxCache, key, { rate, at: Date.now() }, FX_CACHE_MAX);
      return rate;
    }
  } catch (err) {
    console.warn(`[finance] FX rate ${a}${b} failed:`, err);
  }
  // Fallback: no conversion rather than crashing. Señalado en logs: 1 unidad
  // de `a` ≠ 1 unidad de `b`, los totales multi-moneda serán aproximados.
  console.warn(`[finance] FX rate ${a}→${b} unavailable, using 1:1 fallback`);
  return 1;
}

/** Convert a batch of amounts to a single base currency. */
export async function buildFxTable(
  currencies: string[],
  base: string,
): Promise<Record<string, number>> {
  const table: Record<string, number> = { [base.toUpperCase()]: 1 };
  const unique = Array.from(
    new Set(currencies.map((c) => c.toUpperCase()).filter(Boolean)),
  );
  await Promise.all(
    unique.map(async (cur) => {
      if (cur === base.toUpperCase()) return;
      table[cur] = await getFxRate(cur, base);
    }),
  );
  return table;
}
