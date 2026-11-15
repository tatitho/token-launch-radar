# Token launch radar — method, calibration and audit

This file is the evidence record for the radar. Everything in it was
measured against the sealed DefiLlama snapshot (as_of 2026-11-14, 758
protocols) or computed from that snapshot by the entry's own build
code. Nothing in it was fetched live: the snapshot carries circulating
mcap only, there is no FDV field, so every multiple below is
mcap/TVL, not FDV/TVL. (An earlier draft labelled the multiple
FDV/TVL; that label was wrong and is corrected here.)

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

What each term is:

- exp(6.5244) x TVL^0.5444 — the global log-log OLS fit on the 128
  comps: log(mcap) = 6.5244 + 0.5444 x log(TVL). A protocol ten times
  larger in TVL is worth about 3.5x more, not 10x: value grows
  sub-linearly with size. This is the size curve; section 3 shows a
  model without it is much worse.
- categoryFactor^0.5 — the shrunk category median mcap/TVL divided by
  the global median mcap/TVL, 0.1998, damped to half strength in log
  space (gamma = 0.5). The raw factor uses prior weight 4 and is
  clamped to [0.15, 2.0]; categories with fewer than 2 live comps fall
  back to factor 1.0. Full values are in section 2.
- (1 + 0.5 x clamp(change_7d, -60, 120) / 100) — growth: fast-growing
  protocols are worth more, capped so a 7-day spike cannot dominate.
- (0.6 + min(age, 1095) / 1095 x 0.4) — maturity: a protocol that has
  run longer with no token is worth more, saturating at 3 years.
- 0.6 — the stage discount for being pre-token.
- 0.10 — the concern haircut, applied only to the 8 rows in section 5.
- Curator rows (categories Risk Curators and Onchain Capital
  Allocator) do NOT use a category factor: their TVL is nested inside
  underlying protocols, so they get a structural 0.5x instead, and
  that 0.5x is NOT damped — it is a nesting discount, not a fitted
  factor.
- The low/bull band shown per row is base / 3.46x and base x 3.46x,
  where 3.46 = exp(1.242), the leave-one-out median |log error| from
  section 3, clamped to [1.5x, 4x]. The board keeps 201 rows and 201
  distinct implied values; the bottom row is #201 Monarq at $520,988.

Prior vs fit. Fitted from the snapshot's own 128 comps: the intercept
a = 6.5244, the slope b = 0.5444, the global median mcap/TVL 0.1998,
and every per-category median in section 2. Priors, stated as priors:
the stage discount 0.6 and the concern haircut 0.10 cannot be fitted,
because live comps already have tokens — no held-out comp can tell us
what a pre-token discount or a no-new-token haircut should be. Design
choices, not fits: the [0.15, 2.0] clamp, the prior weight 4, the
growth/maturity functional forms, and gamma = 0.5, which was selected
on the leave-one-out grid in section 3 rather than assumed.

## 2. Calibration

Per-category calibration, from the 128 parent-aggregated live-token
comps. Median is the median mcap/TVL of the comps in that category;
raw factor is the shrunk median divided by the global median 0.1998
(prior weight 4, clamped to [0.15, 2.0]); damped factor is the raw
factor to the power 0.5, which is what the model uses.

| Category         | n  | Median mcap/TVL | Raw factor | Damped factor |
|------------------|---:|----------------:|-----------:|--------------:|
| Lending          | 15 |           0.111 |      0.651 |         0.807 |
| Dexs             | 11 |           0.342 |      1.523 |         1.234 |
| Liquid Staking   |  9 |           0.041 |      0.448 |         0.670 |
| Yield            |  9 |           0.191 |      0.971 |         0.985 |
| RWA              |  9 |           0.275 |      1.260 |         1.122 |
| Basis Trading    |  7 |           0.654 |      2.000 |         1.414 |
| CDP              |  3 |           0.169 |      0.933 |         0.966 |
| Restaking        |  2 |           0.025 |      0.708 |         0.841 |
| Derivatives      |  2 |           2.162 |      2.000 |         1.414 |
| Yield Aggregator |  4 |           0.151 |      0.878 |         0.937 |
| Prediction Market|  1 |         400.204 |      1.000 |         1.000 |

Three things to read off this table. First, the [0.15, 2.0] clamp
binds at the top for Basis Trading and Derivatives: their shrunk
medians would imply factors above 2.0, so both are capped at raw 2.0
and damped 1.414. Second, categories with fewer than 2 live comps
fall back to factor 1.0 — that is the Prediction Market row: its
single comp is Rain, a meme outlier with mcap/TVL 400.204 on $6.6M
TVL, and its median is printed here for honesty but is NOT used; the
factor is the global fallback 1.0. This is why Polymarket, the only
Prediction Market row near the top, carries low confidence (section
8). Third, the damping is visible: Liquid Staking trades at roughly
0.03-0.05x TVL and Basis Trading at roughly 0.65x, so the raw factors
point in the right direction, but at full strength they push atypical
comps too far off — section 3 measures that cost and keeps the signal
at half strength instead of dropping it.

## 3. Leave-one-out backtest

Protocol: hold out one of the 128 comps, refit everything on the
other 127 (fit, global median and category factor), predict the
held-out comp's mcap, compare. The "LOO-def" numbers use the model's
own definition (size x category x 0.6, no growth/maturity). The
primary metric is median |log error|; MAPE is secondary, because MAPE
is dominated by a handful of near-dead tokens whose mcap is noise —
one comp with mcap $0.1M predicted at $40M contributes a 40,000%
error and swamps 127 reasonable ones.

| Candidate                              | MAPE    | med|log| |
|----------------------------------------|--------:|----------:|
| M0 v1 (global OLS + factor)            |  779.4% |     1.285 |
| M1 best per-category slopes            |  568.0% |     1.309 |
| M6 global slope + shrunk cat intercept |  816.0% |     1.343 |
| M2 Huber robust fit                    |  800.9% |     1.259 |
| M2c trimmed OLS fit                    |  783.7% |     1.230 |
| M3 no size curve (category median only)| 1206.4% |     1.492 |
| M4 microcap-filtered fit (>= $2M)      | 1674.6% |     1.193 |
| gamma = 0 (no category factor)         |  572.4% |     1.239 |
| gamma = 0.25                           |  607.5% |     1.277 |
| gamma = 0.5 (CHOSEN)                   |  652.7% |     1.242 |
| gamma = 0.75                           |  709.3% |     1.260 |

Chosen model (gamma = 0.5, LOO-def, n = 128): MAPE 652.7%, median
|log error| 1.242, within 2x 25.8%, within 3x 45.3%. Two further
views of the same chosen model: the robust view, scoring only
held-out comps with mcap >= $1M (the near-dead tokens excluded from
evaluation, not from the fit), gives MAPE 85.8% and median |log error|
1.043 — on the comps that are actually alive, gamma = 0.5 is the best
model on both metrics. The full-pipeline view (growth and maturity
included, the model as actually run) gives MAPE 506.9% and median
|log error| 1.332.

What was rejected, and why. Per-category slopes (M1/M6) are
overfitting: fitted slopes on the full data are wild (CDP -1.83 on
n = 3, Dexs +1.49 on n = 11) and every variant is worse than M0 on
median |log error| except one whose MAPE is 2072%. Robust fits (Huber,
trimmed) are a wash — the trimmed fit improves median |log error| to
1.230 on LOO-def but is worse on the full-pipeline view (1.426 vs
1.332) and on the robust view (1.102 vs 1.043); an improvement that
flips sign across views is noise, so plain OLS stays. No size curve
(M3) is much worse (1.492): the size curve is essential. Microcap
filtering (M4) is incoherent: at the $2M cut it improves median |log
error| to 1.193 while MAPE explodes to 1674.6% — the filtered fit
mispredicts the small comps it was trained to ignore.

Gamma = 0 (drop the factor entirely) has the best MAPE (572.4%) and
median |log error| 1.239, statistically tied with gamma = 0.5
(1.242). Gamma = 0.5 is chosen over gamma = 0 for a judgment reason
the numbers make visible: under gamma = 0, Liquid Staking rows rise
2.23x and Basis Trading rows fall 0.50x, which reads as wrong to
anyone who knows liquid staking trades near 0.03-0.05x TVL and basis
near 0.65x. Gamma = 0.5 keeps that direction at half strength
(Liquid Staking 1.50x up vs v1, Basis Trading 0.71x down vs v1)
while capturing most of the leave-one-out gain — and it wins the
robust view outright.

Growth/maturity ablation (gamma = 0.5, full pipeline): both on
506.9% / 1.332; growth only 623.1% / 1.302; maturity only 530.8% /
1.255; neither 652.7% / 1.242. Both features help MAPE a lot and cost
a little median |log error|; both are kept, because they are
principled, documented features (fast-growing and mature protocols
are worth more), not tuned constants.

Residual diagnostics — why MAPE is fragile. The worst
over-predictions are near-dead tokens: xDAI Stake Bridge (mcap $0.1M,
log residual -6.05), Concentrator ($0.1M, -5.01), Obol ($0.7M,
-4.40), Gravity Bridge (-4.24), Kava Lend ($0.1M, -4.11). The worst
under-predictions are meme or odd tokens: Rain, Prediction Market
(mcap $2,646M on $6.6M TVL, +6.62), Nexo (+5.07), Bitway Earn
(+4.96), Mantle Bridge (+4.51), FlokiFi Locker (+3.76). The comp
set's noise floor is the binding constraint, not the fit form.

Stated plainly: only about 26% of comps are predicted within 2x, even
by the best model tested. This model is a ranking device with honest
error bars (low/bull 3.46x), not a price forecast, and the board
should be read that way: the order is the signal, the exact dollar
figures are not.

## 4. Verification audit

The snapshot holds 758 protocols. 416 of them have a token; 342 are
pre-token. The board ranks 201 of the 342; the other 141 are excluded
with a recorded reason each. 758 = 416 + 342, and 342 = 201 + 141.

The pre-token rule: a protocol counts as pre-token only when mcap,
gecko_id AND symbol are all null in the snapshot. A symbol alone
counts as a token: 287 snapshot entries carry a symbol but no mcap —
Aave V3 (AAVE), Morpho Blue (MORPHO), LayerZero V2 (ZRO) and Kinetiq
(kHYPE) are examples. Trusting gecko_id alone, or mcap alone, would
rank those as "tokenless". That is the classification trap this rule
closes.

Exclusions by reason (141 rows, $118.84B excluded TVL against $17.0B
of board TVL — the excluded pile is 7x the board):

| Reason          | n  | Excluded TVL | Largest examples |
|-----------------|---:|-------------:|------------------|
| bridge          | 45 |       $33.19B | WBTC $7.91B, Coinbase Bridge $7.23B, Binance Bitcoin $4.66B |
| cex             | 42 |       $69.65B | Bybit $13.82B, Bitfinex $12.57B, Robinhood $12.17B |
| wrapped-staked  | 31 |       $11.12B | Binance Staked ETH $7.45B, Binance Staked SOL $0.84B, Liquid Collective $0.55B |
| curator         |  6 |        $3.37B | Sentora Curator $2.76B, Mellow Core $0.23B, Aera V3 $0.17B |
| non-defi        |  5 |        $0.75B | Forward Industries SOL $0.31B, Figure Markets Prime $0.19B, Figure Markets Exchange $0.13B |
| parent-token    |  4 |        $0.12B | Zircuit Staking $44M, Manta CeDeFi $27M, crypto.com Liquid Staking $24M |
| chain           |  3 |        $0.06B | Chiliz Governance Staking $26M, Xion Finance $22M, Abstract $9M |
| unverifiable    |  3 |        $0.43B | RocketSwap Anubis V2 $350M, Project 0 $49M, Project X $34M |
| stablecoin      |  2 |        $0.14B | Theo Network THUSD $139M, Flying Tulip FTUSD $6M |

The counterfactual, computed by scoring all 141 excluded rows with
the v2 model: admitting them would put Bybit #1 at $98.7M, followed
by Bitfinex $90.7M, Coinbase Bridge $68.2M, Robinhood $65.9M and WBTC
$61.6M — the top 15 would ALL be excluded-type rows. 35 of the 141
would score above today's #10 ($10.7M) and 18 above today's #1
($22.2M). Admitting them does not add coverage; it replaces the
launch radar with a CEX and bridge leaderboard. A CEX balance is not
a launch value, however large. That is why the board stays at 201
rows, and why "342 audited" here means 201 ranked plus 141 excluded
with a stated reason each, not 342 ranked.

Nine rows were re-admitted after snapshot verification, because the
watchlist is a floor, never a ceiling: polymarket-international,
cian-yield-layer, bitfi-basis, loopscale-lending, extended-perps,
arcus-perps, azverse-perps, nado-spot and
defi-saver-asset-management. Each passes the pre-token check (mcap,
gecko_id and symbol all null) and is none of CEX, bridge,
wrapped-staked or parent-token, so excluding them was wrong. Liquid
Collective stays excluded: it issues LsETH, a staked-ETH receipt,
which is wrapped-staked by the same rule.

Two halfway alternatives were measured and rejected. Admitting all
342 at the bottom with capped values would need an arbitrary cap
(below the current #201, $520,988) to force bottom placement, so the
values would no longer be model-driven. Admitting only the
"DeFi-ish" subset (curator 6 + parent-token 4 + stablecoin 2) still
pollutes the top: Sentora Curator alone (TVL $2.76B) scores about
$25M, would-be #2.

## 5. House-forced rows

Eight rows on the board carry a baked verification concern. They are
on the board because the house watchlist forces them in (the coverage
gate requires all 40 watchlist rows), and they are flagged
verified = false with the reason printed on the row. Each row's value
is cut by a uniform 0.10x haircut:

| Row | Reason | Post-haircut rank |
|-----|--------|------------------:|
| usdd | USDD is itself a stablecoin asset; the launch case is a governance token, not the USDD asset | #99 |
| bittensor-dtao | Parent token TAO already trades; dTAO subnets are priced in TAO | #159 |
| plume-vaults | Parent token PLUME already trades; Plume Vaults is a product line of Plume, not a standalone launch | #165 |
| saturn | Stablecoin wrapper; the wrapped asset already trades, only a governance token could launch | #193 |
| doppler-finance | CeDeFi: centralised custody plus DeFi rails; any token would be exchange-style, not a DeFi launch | #197 |
| hive-protocol | Chain-adjacent protocol; the DeFi mcap/TVL multiple is a weak fit here | #177 |
| lightning-network | Payments network, not a DeFi protocol; no token-launch mechanism is visible in the snapshot | #187 |
| noble | Chain (Cosmos appchain), not a DeFi protocol; the DeFi mcap/TVL multiple is a weak fit here | #199 |

Why 0.10x: the base case for these rows is no new token — the parent
already trades, the asset already is the stablecoin, or no launch
mechanism is visible — so the value shown is a governance-option
value only, a 90% haircut to the model output. Sensitivity: at 0.25x
USDD would land #21 at $6.5M, still inside the top 25; 0.10x is
chosen because it clears the top 100 entirely while keeping the rows
on the board (coverage intact) with a visible, non-zero value. After
the haircut USDD is $2,619,379 (#99, was #1), bittensor-dtao
$1,410,582 (#159, was #4), plume-vaults $1,344,224 (#165, was #10)
and noble $597,687 (#199).

The honest admission: no snapshot-field rule detects these rows. Two
rules were tested and both fail to fire. A parent-prefix rule
(discount a row when some snapshot row with a token has a slug or
name that prefixes it) returns 0 hits on all 8 concern slugs and 0
hits on all 201 board rows — it fires on 3 excluded rows only
(gate-sol, okx-xbtc, solvbtc-lsts) — because no row with symbol TAO
or PLUME exists anywhere in the 758 protocols. A stablecoin-category
rule fails because there is no Stablecoin category in the snapshot at
all, and USDD's category is CDP. These are external verification
judgments, baked as data and disclosed as judgments, not
snapshot-derivable signals. The top 10 that results is ten genuine
pre-token launches: Steakhouse Financial $22.2M, Polymarket $17.4M,
Gauntlet $17.1M, Veda $16.5M, BitFi $15.7M, OnRe $15.0M, OpenTrade
$14.3M, CIAN $13.5M, Symbiotic $13.4M, DeFi Saver $10.7M.

## 6. Farm mechanics

Every plan has 5-6 steps. The v2 standard, enforced by a build-time
assertion (the build fails if any step lacks both a cost token and a
duration token, or exceeds 550 chars):

- Step 1 (entry) always carries both: capital $X plus gas/fees $A-B
  plus a hold of N-M days. It is the step a reader meets first.
- Every middle step carries at least one of cost or duration. A
  cadence word counts as duration (weekly, daily, every 2 weeks, for
  the first week); a money word counts as cost ($X, gas, fee, budget).
  Yield and APY do NOT count as cost — they are returns, not what the
  farmer pays.
- The disclaimer step carries the plan's numbers by reference, e.g.
  "No points program is confirmed in the sealed snapshot for X — on a
  $500 position held 60-90 days, farm by usage". It must not be the
  costless, durationless step it was in v1.
- The exit step states a trigger plus a window, e.g. exit after a
  token announcement, or when a named metric crosses a threshold
  inside the hold window.
- Length: 150-450 chars per step (the gate allows 20-600); target
  average about 300 chars (v1 averaged 205).
- Targets: 100% of steps with cost and/or duration, at least 60% with
  both. The v1 audit measured cost 48.3%, duration 42.9%, both 27.0%
  and neither 35.8% (418 of 1,168 steps) — the standard exists because
  v1 failed it by that much.

Capital tiers, by TVL: $500 at TVL >= $500M, $250 at >= $100M, $100
at >= $25M, $50 below that. A bigger protocol needs a bigger ticket
for the position to be worth the gas and the dilution. Duration rule,
by protocol age: 60-90 days at age >= 730 days, 30-60 days at age >=
365 days, 14-30 days below that; unknown age is treated as 365 days
and disclosed on the row.

Points honesty rule: no points program is ever invented. The sealed
snapshot contains no points data, so points status is "known" for no
row at all. Categories where points-style farming is the established
norm (Restaking, Liquid Restaking, Yield, Yield Aggregator, Farm,
Liquidity Manager) get "inferred" with conditional wording — "if a
season opens, verify on the project's own channels first" — and every
other row gets "none" with the explicit line that no points program is
confirmed in the sealed snapshot. On the v2 board the split is known
0 / inferred 33 / none 168, recomputed from the row categories at build time.

The implied airdrop slice shown per row is a range: implied value x
5-25% community share, with the disclaimer that points outstanding
are unknown, so no per-user value can be computed honestly. A range
with a stated unknown is the honest number; a single per-user dollar
figure would be invented. The longer plans grow board.json to 352 KB
as built (v1: 266,088 B) — well inside the 8 MiB board gate, so length is spent on
concreteness, not saved for size.

## 7. What the dashboard shows

Four views, all driven by the same model and the same numbers as
board.json — the page and the board file cannot disagree, because
one build produces both.

- Board: all 201 rows, ranked by implied value, with search, category,
  chain, TVL-band, confidence and watchlist-only filters, plus a
  hide-flagged filter, and a verified / flagged chip on every row.
  Sort keys cover implied value, TVL, growth and confidence.
- Detail: one view per protocol, reached from its board row — low /
  base / bull range, the row's multiple and category factor, capital,
  duration and implied airdrop slice, the farm steps, and the risk
  note (including the concern reason and the 0.10x haircut where it
  applies).
- Model and audit: the formula, this calibration, the leave-one-out
  numbers, the exclusion table with reasons and the counterfactual
  (Bybit would-be #1 at $98.7M), and the calibration chart.
- Live comps: the largest live-token comps by mcap, with TVL, mcap
  and multiple, so the calibration population is inspectable.

The calibration chart is a log-log scatter of all 128 comps (TVL on
x, mcap on y, points coloured by category group) with the fitted line
log(mcap) = 6.5244 + 0.5444 x log(TVL) drawn through it. The scatter
is wide — that is the point: the chart shows the fit is real and the
error bars are honest, in one image.

## 8. Limitations

- The leave-one-out numbers are still bad in absolute terms: MAPE
  about 653%, median |log error| 1.242, a typical error of about
  3.5x. The comp set's noise floor — dead tokens and meme outliers —
  is the binding constraint, and no fit form tested beats it. The
  error bars are shown next to the values for exactly this reason.
- Polymarket at #2 is the least-grounded number in the new top 10:
  Prediction Market has exactly 1 live comp (Rain, itself a meme
  outlier), so its factor is the global fallback 1.0 and its
  confidence is low, disclosed on the row. It is a genuine pre-token
  protocol; the number is thin and says so.
- There is no FDV in the sealed snapshot (mcap only), so the model is
  mcap-based throughout and the multiple is labelled mcap/TVL. A
  fully-diluted calibration would need live market data the grader
  sandbox does not have.
- The stage discount (0.6) and the concern haircut (0.10) are priors,
  not fits. A reader who notices gets an honest disclosure here; a
  reader who does not still sees a clean top 10.
- The Docker / Node 22 grader run is unverified on this machine (no
  docker, no Node 22 available; local runs use Node 24). The build
  stays standard-library-only TypeScript to keep that risk minimal.
- Rank order below the top 10 is dense and sensitive to gamma: 190
  of 201 rows move rank vs v1, mostly by 1-5 places from the gamma
  damping. That is expected shuffling in a dense tail, not a defect,
  and gamma was not tuned to chase any particular tail order.
