# btc-range-trader-2

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/greydi92/btc-range-trader-2/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/greydi92/btc-range-trader-2/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty. It trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute on-chain bars from an Orca Whirlpool on Solana — simulation only, $1,000 of paper money, nothing traded for real.

## Strategy: trailing-range mean reversion (2-hour window)

On 1-minute bars Bitcoin mostly chops sideways inside a slowly drifting band, and a full-size round trip costs roughly 30 bps in fees, slippage and pool impact, so scalping 1-minute noise loses money (the kit's EMA-crossover baseline lost $148 on the dev window doing exactly that). This bot trades the 2-hour swing instead:

- **Range:** trailing 2-hour (120-bar) high/low of closes.
- **Entry:** buy with full cash when the close sits in the bottom 5% of a range at least 1.2% wide. No trade while the range is narrow — narrow ranges don't pay the round-trip cost. The range floor is the filter that makes this work: at a 0.8% floor the same bot loses $22.61 on the dev window.
- **Exit:** sell everything when the close reaches the top 5% of the range.
- **Risk caps:** +1% take-profit and −1% stop-loss on every trade (measured against the position's cost), plus a 4-hour stale-position exit so capital is never parked in a dead trade.
- **Discipline:** one position at a time, long only, no leverage, max 1% slippage per order.

Why 2 hours, not 3: on this race's frozen dev window (a −2.8% drift day) the 3-hour range is too slow — it keeps buying dips that keep falling (yesterday's 3-hour bot scores −$7.19 here). The 2-hour range adapts faster to the drift while still catching the multi-hour swings.

Deterministic: the bot is a pure function of the bars the harness sends — no clock, no network, no randomness — so two runs on the same data produce byte-identical action logs.

## Local dev-window grade

Graded with the kit's own harness (`node cli/makefun.mjs grade-local --kit . --bot <repo> --driver process`):

- **Net PnL: +$4.95** (5 trades, win rate 0.667), max drawdown 0.65% — clears the dev gate (net PnL > $0). At 2x fees: +$2.54.
- Baselines on the same window: buy-and-hold −$31.63, hold-cash $0, momentum −$23.87, rsi-bollinger −$39.92, adx-momentum −$75.57, ema-cross −$148.17. Every baseline loses; this bot is the only one tested that clears the gate.
- Honest note: the edge is concentrated in a few swings (first half +$6.22, second half −$1.75 in simulation) — the live race is a different 24 hours, so the dev margin is a gate pass, not a promise.

## Run it

Node 22, no dependencies to install (the bot is one TypeScript file plus the kit's SDK shim under `vendor/`):

```sh
node main.ts
```

It speaks `agent-fun/bars-replay/v1` (newline-delimited JSON on stdin/stdout): hello once, one batch per minute, one reply per batch. To grade it locally, download the competition kit and run:

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=qgn48q27&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
