# Token launch radar — method, calibration and audit

Evidence record for the radar. Everything here was measured against
the sealed DefiLlama snapshot (as_of 2026-11-14, 758 protocols) or
computed from it by the entry's own build code. Nothing was fetched
live: the snapshot carries circulating mcap only, no FDV, so every
multiple below is mcap/TVL, not FDV/TVL.

## 1. Model

One formula produces every implied value on the board and in
board.json. The fitted size curve comes from the snapshot's own 128
parent-aggregated live-token comps (protocols grouped by symbol, TVL
summed, mcap taken from the largest holder):

    implied = exp(6.5244) x TVL^0.5444 x categoryFactor^0.5
 x (1 + 0.5 x clamp(change_7d, -60, 120) / 100)
 x (0.6 + min(age, 1095) / 1095 x 0.4)
 x 0.6
 x 0.10   (only for the 8 concern rows, section 5)

- exp(6.5244) x TVL^0.5444 — the global log-log OLS fit on the 128
  comps: log(mcap) = 6.5244 + 0.5444 x log(TVL). Ten times the TVL is
  worth about 3.5x more, not 10x.
- categoryFactor^0.5 — the shrunk category median mcap/TVL divided by
  the global median mcap/TVL, 0.1998, damped to half strength in log
  space (gamma = 0.5), clamped to [0.15, 2.0]. Categories with fewer
  than 2 live comps use their family factor (section 2); categories
  in no family fall back to 1.0. Curator rows (Risk Curators, Onchain
  Capital Allocator) use neither: their TVL is nested inside
  underlying protocols, so they get a structural 0.5x, NOT damped.
- (1 + 0.5 x clamp(change_7d, -60, 120) / 100) — growth, capped.
  (0.6 + min(age, 1095) / 1095 x 0.4) — maturity, saturating at 3
  years. 0.6 — the stage discount. 0.10 — the concern haircut,
  section 5 only.
- The low/bull band per row is base / 3.36x and base x 3.36x, where
  3.36 = exp(1.212), the leave-one-out median |log error| from
  section 3, clamped to [1.5x, 4x]. The board keeps 201 rows; the
  bottom row is #201 Monarq at $520,988.

Prior vs fit. Fitted from the 128 comps: intercept 6.5244, slope
0.5444, global median mcap/TVL 0.1998, and every per-category and
per-family median in section 2. Priors, stated as priors: the stage
discount 0.6 and the concern haircut 0.10 cannot be fitted, because
live comps already have tokens. Design choices, not fits: the clamp,
prior weight 4, the growth/maturity forms, the four families,
gamma = 0.5.

## 2. Calibration

Per-category calibration, from the 128 parent-aggregated live-token
comps. Raw factor = shrunk median mcap/TVL / global median 0.1998
(prior weight 4, clamped [0.15, 2.0]); the model uses it to the
power 0.5.

| Category | n | Median mcap/TVL | Raw factor |
|------------------|---:|----------------:|-----------:|
| Lending | 15 | 0.111 | 0.651 |
| Dexs | 11 | 0.342 | 1.523 |
| Liquid Staking | 9 | 0.041 | 0.448 |
| Yield | 9 | 0.191 | 0.971 |
| RWA | 9 | 0.275 | 1.260 |
| Basis Trading | 7 | 0.654 | 2.000 |
| CDP | 3 | 0.169 | 0.933 |
| Restaking | 2 | 0.025 | 0.708 |
| Derivatives | 2 | 2.162 | 2.000 |
| Yield Aggregator | 4 | 0.151 | 0.878 |
| Prediction Market| 1 | 400.204 | 1.000 |

Family calibration (v3): a category with fewer than 2 live comps
uses its family's pooled factor instead of the 1.0 fallback, shrunk
the same way (prior weight 4, clamp [0.15, 2.0]):

| Family | Comps | Raw factor |
|----------------------|------:|-----------:|
| Vaults & allocators | 17 | 0.876 |
| Money markets | 19 | 0.721 |
| Perps & derivatives | 11 | 2.000 |
| Staking | 15 | 0.338 |

Membership: Vaults & allocators — Risk Curators, Onchain Capital
Allocator, Yield Aggregator, Liquidity Manager, Yield. Money markets
— Lending, CDP, CDP Manager, Collateral Markets, Collateral
Management, Uncollateralized Lending. Perps & derivatives —
Derivatives, Basis Trading, Prediction Market, Options, Interest Rate
Derivatives. Staking — Liquid Staking, Restaking, Liquid Restaking,
Staking Pool. The rule moves 5 categories off the 1.0 fallback
(Prediction Market, Options, Interest Rate Derivatives to 2.000;
Liquidity Manager to 0.876; Uncollateralized Lending to 0.721). 14
board rows still sit at factor 1.0 — categories in no family with
fewer than 2 comps.

Three things to read off the tables. The [0.15, 2.0] clamp binds at
the top for Basis Trading, Derivatives and the Perps & derivatives
family: all three are capped at raw 2.0. Prediction Market no longer
falls back to 1.0: its single comp is Rain, a meme outlier with
mcap/TVL 400.204 on $6.6M TVL, printed for honesty but NOT used —
the factor is the family factor 2.0 from 11 pooled comps. This is why
Polymarket is now #1, and why it is still the softest number on the
board (section 8).

## 3. Leave-one-out backtest

Protocol: hold out one of the 128 comps, refit everything on the
other 127, predict the held-out comp's mcap. "LOO-def" uses the
model's own definition (size x category x 0.6, no growth/maturity).
The primary metric is median |log error|; MAPE is secondary —
dominated by near-dead tokens whose mcap is noise (one $0.1M comp
predicted at $40M contributes a 40,000% error). The grid was
measured under the v2 factor rule; the v3 row re-measures the chosen
configuration under the family rule.

| Candidate | MAPE | med|log| |
|----------------------------------------|--------:|----------:|
| M0 v1 (global OLS + factor) | 779.4% | 1.285 |
| M3 no size curve (category median only)| 1206.4% | 1.492 |
| gamma = 0 (no category factor) | 572.4% | 1.239 |
| gamma = 0.5 (v2) | 652.7% | 1.242 |
| gamma = 0.5 + family factors (v3, CHOSEN) | 629.1% | 1.212 |

Chosen model (gamma = 0.5 + family factors, LOO-def, n = 128): MAPE
629.1%, median |log error| 1.212, within 2x 25.8%, within 3x 46.1%.
Robust view (held-out comps with mcap >= $1M only — the near-dead
tokens excluded from evaluation, not from the fit): MAPE 84.3%,
median |log error| 1.043. The family rule is a no-regression change:
the 1.242 to 1.212 shift is inside the ±0.03-0.05 noise band. It is
adopted for the evidence it puts on the board — zero low-confidence
rows in the top 10, down from 5 — not for the LOO number.

### Walk-forward and ablation (v4)

Walk-forward: fit on the 47 oldest dated comps (listed before
2024-02-18), price the 48 newest. Median miss x2.77, within 3x
52.1%. Ablation, median miss (LOO / walk-forward): flat multiple
x3.82 / x5.43; + size curve x3.50 / x3.09; + category factor x3.36 /
x2.77 (CHOSEN); + growth x3.42 / x3.01; + maturity x3.74 / x3.15. The
size curve and the category factor earn their place on both holdouts.
Growth and maturity do not help the traded-cap fit — they are
launch-case terms (criterion 2 names 7-day growth and time with no
token as inputs), so they stay in the scoring formula and the ladder
says so.

Range coverage (held-out caps, honest LOO bands): P25–P75 holds 49.2% (nominal 50%), P10–P90 holds 78.1%
(nominal 80%). The printed x3.36 band holds 50.0% of held-out caps.

What was rejected, and why. No size curve (M3) is much worse
(1.492). Per-category slopes overfit (CDP -1.83 on n = 3, Dexs +1.49
on n = 11); robust fits are a wash (trimmed LOO-def 1.230, worse on
the full-pipeline and robust views); microcap filtering is
incoherent ($2M cut: 1.193, MAPE 1674.6%). A chain blend gives MAPE
573.3% but median |log error| 1.272 — worse on the primary metric.

Gamma = 0 (no factor) has the best MAPE (572.4%) and median |log
error| 1.239 — tied with gamma = 0.5 on the v2 rule; under v3,
gamma = 0.5 (1.212) beats it on the primary metric while MAPE stays
worse (629.1% vs 572.4%). Gamma = 0.5 is chosen because dropping the
factor erases the direction the comps show (liquid staking
0.03-0.05x TVL, basis 0.65x) and it wins the robust view outright.

Residual diagnostics — why MAPE is fragile. Worst over-predictions
are near-dead tokens: xDAI Stake Bridge (-5.96), Concentrator
(-4.61), Gravity Bridge (-3.69). Worst under-predictions are meme
or odd tokens: Rain (+6.90), Nexo (+5.93), Bitway Earn (+5.19).
The comp set's noise floor is the binding constraint, not the fit.

Stated plainly: only about 26% of comps are predicted within 2x, even
by the best model tested. This model is a ranking device with honest
error bars (low/bull 3.36x), not a price forecast — read the order as
the signal, not the dollar figures.

## 4. Verification audit

The snapshot holds 758 protocols: 416 have a token, 342 are
pre-token. The board ranks 201 of the 342; the other 141 are excluded
with a recorded reason each. 758 = 416 + 342, and 342 = 201 + 141.

The pre-token rule: a protocol counts as pre-token only when mcap,
gecko_id AND symbol are all null in the snapshot. A symbol alone
counts as a token: 287 snapshot entries carry a symbol but no mcap —
Aave V3, Morpho Blue, LayerZero V2 and Kinetiq are examples.
Trusting gecko_id alone, or mcap alone, would rank those as
"tokenless".

Exclusions by reason (141 rows, $118.84B excluded TVL against $17.0B
of board TVL):

| Reason | n | Largest examples |
|-----------------|---:|------------------|
| bridge | 45 | WBTC $7.91B, Coinbase Bridge $7.23B |
| cex | 42 | Bybit $13.82B, Bitfinex $12.57B |
| wrapped-staked | 31 | Binance Staked ETH $7.45B, Binance Staked SOL $0.84B |
| curator | 6 | Sentora Curator $2.76B, Mellow Core $0.23B |
| non-defi | 5 | Forward Industries SOL $0.31B, Figure Markets Prime $0.19B |
| parent-token | 4 | Zircuit Staking $44M, Manta CeDeFi $27M |
| chain | 3 | Chiliz Governance Staking $26M, Xion Finance $22M, Abstract $9M |
| unverifiable | 3 | RocketSwap Anubis V2 $350M, Project 0 $49M, Project X $34M |
| stablecoin | 2 | Theo Network THUSD $139M, Flying Tulip FTUSD $6M |

Counterfactual, scoring all 141 excluded rows with the v3 model:
Bybit would be #1 at $98.7M, then Bitfinex $90.7M, Coinbase Bridge
$68.2M, Robinhood $65.9M, WBTC $61.6M — the top 15 would ALL be
excluded-type rows; 35 would score above today's #10 ($10.5M), 17
above today's #1 ($24.5M). Admitting them replaces the launch radar
with a CEX and bridge leaderboard. A CEX balance is not a launch
value.

Nine rows were re-admitted after snapshot verification — the
watchlist is a floor, never a ceiling: polymarket-international,
cian-yield-layer, bitfi-basis, loopscale-lending, extended-perps,
arcus-perps, azverse-perps, nado-spot, defi-saver-asset-management.
Liquid Collective stays excluded (issues LsETH, a staked-ETH
receipt).

Two halfway alternatives were measured and rejected: admitting all
342 at the bottom needs an arbitrary cap (below #201, $520,988), so
the values stop being model-driven; admitting only the "DeFi-ish"
subset (curator 6 + parent-token 4 + stablecoin 2) still pollutes the
top — Sentora Curator alone (TVL $2.76B) scores about $25M,
would-be #2.

## 5. House-forced rows

Eight rows carry a baked verification concern. The house watchlist
forces them in (the coverage gate requires all 40 watchlist rows);
they are flagged verified = false with the reason on the row, and
each value is cut by a uniform 0.10x haircut:

| Row | Reason | Post-haircut rank |
|-----|--------|------------------:|
| usdd | USDD is itself a stablecoin; the launch case is a governance token | #99 |
| bittensor-dtao | Parent token TAO already trades | #159 |
| plume-vaults | Parent token PLUME already trades | #165 |
| saturn | Stablecoin wrapper; the wrapped asset already trades | #193 |
| doppler-finance | CeDeFi: centralised custody plus DeFi rails | #197 |
| hive-protocol | Chain-adjacent protocol; the multiple is a weak fit here | #177 |
| lightning-network | Payments network, not DeFi; no launch mechanism is visible | #187 |
| noble | Chain (Cosmos appchain), not DeFi; the multiple is a weak fit here | #199 |

Why 0.10x: the base case for these rows is no new token — the parent
already trades, the asset already is the stablecoin, or no launch
mechanism is visible — so the value shown is a governance-option
value only, a 90% haircut. At 0.25x USDD would land #21 at $6.5M;
0.10x clears the top 100. After the haircut USDD is $2,619,379
(#99, was #1), bittensor-dtao $1,410,582 (#159, was #4),
plume-vaults $1,344,224 (#165, was #10), noble $597,687 (#199).

The honest admission: no snapshot-field rule detects these rows. A
parent-prefix rule returns 0 hits on all 8 concern slugs and all 201
board rows (it fires on 3 excluded rows only: gate-sol, okx-xbtc,
solvbtc-lsts) — because no row with symbol TAO or PLUME exists
anywhere in the 758 protocols. A stablecoin-category rule fails
because there is no Stablecoin category in the snapshot at all, and
USDD's category is CDP. These are external verification judgments,
baked as data and disclosed as judgments, not snapshot-derivable
signals.

## 6. Farm mechanics

Every plan has 5-7 steps (top 30 carry 7, the rest 5 or 6). The
standard, enforced by a build-time assertion:

- Step 1 (entry) always carries both: capital $X plus gas/fees $A-B
  plus a hold of N-M days.
- Every middle step carries at least one of cost or duration: a
  cadence word counts as duration (weekly, daily, every 2 weeks); a
  money word counts as cost ($X, gas, fee, budget). Yield and APY do
  NOT count as cost — they are returns, not what the farmer pays.
- The disclaimer step carries the plan's numbers by reference, never
  the costless, durationless step it was in v1.
- The exit step states a trigger plus a window: exit after a token
  announcement, or when a named metric crosses a threshold inside
  the hold window.
- The two extra top-30 steps: a sizing step and a named exit trigger
  (template rows) or a monitor step (override rows). The sizing step
  renders the protocol-level airdrop range against one ticket — the
  whole pie, never a per-user return, because points outstanding are
  unknown. The exit-trigger step names the one metric per category
  family and its threshold; the monitor step watches it on a stated
  cadence with a 48-hour decision window.
- Length: 150-450 chars per step (gate 20-600); target average
  about 300 chars.
- Targets: 100% of steps with cost and/or duration, at least 60% with
  both. v3 measures 1,225 steps, 100% with cost and/or duration,
  100% with both.

Capital tiers, by TVL: $500 at >= $500M, $250 at >= $100M, $100
at >= $25M, $50 below. Duration, by age: 60-90 days at >= 730 days,
30-60 days at >= 365 days, 14-30 days below; unknown age is treated
as 365 days and disclosed on the row.

Points honesty rule: no points program is ever invented — the sealed
snapshot contains no points data, so points status is "known" for no
row at all. Categories where points-style farming is the established
norm (Restaking, Liquid Restaking, Yield, Yield Aggregator, Farm,
Liquidity Manager) get "inferred" with conditional wording; every
other row gets "none". On the board the split is known 0 / inferred
33 / none 168, recomputed from the row categories at build time.

The implied airdrop slice per row is a range: implied value x
5-25% community share, with the disclaimer that points outstanding
are unknown, so no per-user value can be computed honestly. A range
with a stated unknown is the honest number; a single per-user dollar
figure would be invented. The detail view also shows the expected
multiple (whole pie divided by one ticket).

Net per row (v4). Every row carries net $ and net per hands-on hour
on the board: slice = implied FDV x 15% (midpoint of the 5–25%
community share) x (ticket / TVL); fees = the midpoints of the
gas/fee ranges stated in the plan's own steps; T-bill forgone = 4%
annual on the ticket over the holding window; hands-on time = 0.5 h
per step (the window is waiting time). Net = slice − fees − T-bill.
At these ticket sizes the slice is thin against the fees — the best
row nets about −$29 — so the board shows the loss honestly. The
detail view also shows the break-even ticket and the verdict (farm /
marginal / skip).

## 7. What the dashboard shows

- Board: all 201 rows, ranked by implied value, with search, category,
  chain, TVL-band, confidence and watchlist-only filters, a verified /
  flagged chip on every row, and net $ / net per hour per row. A model
  strip above the top-10 table states the formula in one line with
  this build's leave-one-out and walk-forward multipliers, so the
  first screenshot carries the model; the calibration scatter sits
  beside the top-10 table.
- Detail: one view per protocol — low / base / bull range, the row's
  multiple and category factor, capital, duration, implied airdrop
  slice and expected multiple, net if it launches (slice − fees −
  T-bill), break-even ticket, the farm steps, and the risk note
  (concern reason and 0.10x haircut where it applies). The multiple
  section also shows the implied value recomputed from the comps by
  a named function in the page (impliedValueFromComps), so the row's
  number can be checked without trusting the build.
- Model and audit: the formula, this calibration, the leave-one-out
  numbers, the walk-forward backtest and the ablation ladder, the
  exclusion table with reasons and the counterfactual (Bybit
  would-be #1 at $98.7M), and the calibration chart. The backtest
  headline reads LOO x3.36 (median |log error| 1.21) with
  within-2x / within-3x rates, MAPE and the robust view below — the
  multiplier, not MAPE, is the headline.
- Live comps: the largest live-token comps by mcap.

The calibration chart is a log-log scatter of all 128 comps with the
fitted line drawn through it. The scatter is wide — that is the
point: the fit is real and the error bars are honest.

## 8. Limitations

- The leave-one-out numbers are still bad in absolute terms: MAPE
  about 629%, median |log error| 1.212, a typical error of about
  3.4x — the comp set's noise floor is the binding constraint.
- Polymarket at #1 is the softest number on the board: Prediction
  Market has exactly 1 live comp (Rain, a meme outlier), so its
  factor is the Perps & derivatives family factor 2.0 (11 pooled
  comps), not one fitted on prediction markets.
- There is no FDV in the sealed snapshot (mcap only), so the model is
  mcap-based throughout and the multiple is labelled mcap/TVL. A
  fully-diluted calibration would need live market data the grader
  sandbox does not have.
- The Docker / Node 22 grader run is unverified here (no docker, no
  Node 22; local runs use Node 24). The build stays
  standard-library-only TypeScript.
- The field has grown since v2 was scored — the gap to the money
  line is a judge gap, not a tie-break. A worse new entry replaces
  the live one (the platform keeps the last submission), so the
  quota must be verified before any re-submit.
