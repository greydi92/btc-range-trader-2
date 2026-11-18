// Range Runner 2h: a trailing-range mean-reversion bot for cbBTC/USDC.
//
// Idea: on 1-minute bars Bitcoin mostly chops inside a slowly drifting
// band, and a full-size round trip costs roughly 30 bps in fees, slippage
// and pool impact, so scalping 1-minute noise loses money. This bot trades
// the 2-hour swing instead: it watches the trailing 2-hour range of closes
// and buys only when the price sits in the bottom twentieth of a range at
// least 1.2% wide, then sells when the price reaches the top twentieth of
// the range. A 1% take-profit and a 1% stop-loss bound every trade, and a
// position held 4 hours without reaching either exit is closed so capital
// is never parked in a dead trade. One position at a time, full cash, long
// only.
//
// Why 2 hours, not 3: on this race's frozen dev window (a -2.8% drift day)
// the 3-hour range is too slow — it keeps buying dips that keep falling.
// The 2-hour range adapts faster to the drift while still catching the
// multi-hour swings, and it was the only window whose whole parameter
// neighbourhood stayed profitable on the dev data.
//
// Everything is a pure function of the bars the harness sends: no clock, no
// network, no randomness, so two runs on the same data give the same orders.
// Floats are IEEE 754 (deterministic in Node); the entry/exit comparisons
// that decide money use the harness's own bigint values (position cost and
// marked value), never floats.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Trailing range length, in 1-minute bars (2 hours). */
const WINDOW_BARS = 120;
/** Buy in the bottom BAND of the range, sell in the top BAND. */
const BAND = 0.05;
/** Only trade when the range is at least this wide (fraction of the low). */
const MIN_RANGE = 0.012;
/** Take profit / stop loss, as a fraction of the position's cost. */
const TAKE_PROFIT = 101n;
const STOP_LOSS = 99n;
/** Close a position held this many bars (4 hours) without an exit. */
const MAX_HOLD_BARS = 240;
/** Reject a fill that moved more than 1% past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 100;
/** Closes needed before the first entry (a full window plus one bar). */
const MIN_HISTORY = WINDOW_BARS + 1;

/** Closes seen so far, in raw price units (price_scale 5), oldest first. */
const closes: number[] = [];
/** Seq of the batch the current position was decided on, null when flat. */
let entrySeq: number | null = null;

function rangeEnds(): { hi: number; lo: number } | null {
  if (closes.length < WINDOW_BARS) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = closes.length - WINDOW_BARS; i < closes.length; i++) {
    const c = closes[i]!;
    if (c > hi) hi = c;
    if (c < lo) lo = c;
  }
  return { hi, lo };
}

await runBars({
  onBatch(state: BarsState, batch) {
    // Fold only the bars this batch actually carries: a minute the recorder
    // missed has no bar, and re-pushing the previous close would corrupt
    // the trailing range.
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(Number(bar.c));
    }
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held === undefined) {
      entrySeq = null;
    }
    const ends = rangeEnds();
    if (ends === null) return [];
    const { hi, lo } = ends;
    const close = closes[closes.length - 1]!;

    if (held !== undefined) {
      // Exits are always evaluated, even when the range has narrowed below
      // the entry minimum: a trade already open must be able to get out.
      const value = state.value(SYMBOL, held.qty);
      const sellLine = hi - BAND * (hi - lo);
      const tookProfit = value * 100n >= held.cost * TAKE_PROFIT;
      const stoppedOut = value * 100n <= held.cost * STOP_LOSS;
      const stale = entrySeq !== null && state.seq - entrySeq >= MAX_HOLD_BARS;
      if (close >= sellLine || tookProfit || stoppedOut || stale) {
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        entrySeq = null;
        return [sell];
      }
      return [];
    }

    // Flat: only enter with a full window of history behind the decision,
    // and only when the range is wide enough to pay the round-trip cost.
    if (closes.length < MIN_HISTORY) return [];
    if ((hi - lo) / lo < MIN_RANGE) return [];
    const buyLine = lo + BAND * (hi - lo);
    if (close > buyLine) return [];
    const cash = state.cash;
    if (cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entrySeq = state.seq;
    const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
    return [buy];
  },
});
