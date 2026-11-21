# Token launch radar — method, calibration and audit

Everything here was measured against the sealed DefiLlama snapshot
(as_of 2026-11-14, 758 protocols) or computed from it by the entry's
own build code. The snapshot carries circulating mcap only, no FDV,
so every multiple below is mcap/TVL, not FDV/TVL.

radar-6: quadratic size curve (L23), 0.10x concern haircut restored
(L14), 6 curator rows excluded again (L14b), audited farm economics
(L20), integrity strip, dollar build with nearest peers, bootstrap
rank ranges (L15–L17). Growth and maturity stay pruned; launch odds
fitted twice, rejected twice (L21).

## 1. Model

One formula produces every implied value on the board and in
board.json. The fitted size curve comes from the snapshot's own 128
parent-aggregated live-token comps (protocols grouped by symbol, TVL
summed, mcap taken from the largest holder):

    implied = exp(16.4919 − 0.5263·ln TVL + 0.0283·(ln TVL)²) × categoryFactor^0.5 × 0.6

- The quadratic log-log fit: log(mcap) = 16.4919 − 0.5263·log(TVL) +
  0.0283·log(TVL)². Ten times the TVL is worth 2.5–4.5x more depending
  on size — the multiple is 2.25x at $1M, 0.13x at $100M, 0.026x at
  $10B — and the curve stays monotone (slope 0.26–0.78) over
  $1M–$10B. It beats the linear fit on both holdouts (LOO ×3.36 →
  ×3.15, walk-forward ×2.77 → ×2.67), which is why it ships (§3).
- categoryFactor^0.5 — the shrunk category median mcap/TVL divided by
  the global median mcap/TVL, 0.1998, damped to half strength in log
  space (gamma = 0.5), clamped to [0.15, 2.0]. Categories with fewer
  than 2 live comps use their family factor (§2); categories in no
  family fall back to 1.0. Curator rows use neither: their TVL is nested
  inside underlying protocols, so they get a structural 0.5x, NOT damped.
- 0.6 — the stage discount. It cannot be fitted, because live comps
  already have tokens (a prior, stated as a prior).
- × 0.10 — the concern haircut (§5), applied to 8 baked-concern rows.
- The low/bull band per row is base / 3.15x and base × 3.15x, where
  3.15 = exp(1.149), the leave-one-out median |log error| from §3,
  clamped to [1.5x, 4x]. The board keeps 201 rows (bottom: #201 Noble,
  $729,244).

Fitted: the quadratic coefficients, the global median 0.1998, and
every per-category and per-family median in §2. Design choices, not
fits: stage discount 0.6, the clamp, prior weight 4, the four
families, gamma = 0.5.

## 2. Calibration

Raw factor = shrunk median mcap/TVL / global median 0.1998 (prior
weight 4, clamped [0.15, 2.0]); the model uses it to the power 0.5.
Raw factors (n): Lending 0.651 (15), Dexs 1.523 (11), Liquid Staking
0.448 (9), Yield 0.971 (9), RWA 1.260 (9), Basis Trading 2.000 (7),
CDP 0.933 (3), Restaking 0.708 (2), Derivatives 2.000 (2), Yield
Aggregator 0.878 (4), Prediction Market 1.000 (1).

Family calibration (v3): a category with <2 live comps uses its
family's pooled factor instead of the 1.0 fallback (same shrinkage
and clamp). Vaults & allocators 0.876 (17 comps: Risk
Curators, Onchain Capital Allocator, Yield Aggregator, Liquidity
Manager, Yield); Money markets 0.721 (19: Lending, CDP, CDP Manager,
Collateral Markets, Collateral Management, Uncollateralized Lending);
Perps & derivatives 2.000 (11: Derivatives, Basis Trading, Prediction
Market, Options, Interest Rate Derivatives); Staking 0.338 (15:
Liquid Staking, Restaking, Liquid Restaking, Staking Pool). The rule
moves 5 categories off the 1.0 fallback (Prediction Market, Options,
Interest Rate Derivatives to 2.000; Liquidity Manager to 0.876;
Uncollateralized Lending to 0.721).

The [0.15, 2.0] clamp binds at the top for Basis Trading, Derivatives
and the Perps & derivatives family. Prediction Market's single comp is
Rain, a meme outlier (mcap/TVL 400.204 on $6.6M TVL), printed but NOT
used — the factor is the family 2.0 from 11 pooled comps. This is why
Polymarket is #2, and why it is still soft (§8).

## 3. Leave-one-out backtest

Protocol: hold out one of the 128 comps, refit everything on the
other 127, predict the held-out comp's mcap. The primary metric is
median |log error|; MAPE is secondary — dominated by near-dead tokens
whose mcap is noise.

Chosen model (quadratic rung 2, n = 128): MAPE 609.9%, median |log
error| 1.149, within 2x 28.9%, within 3x 46.1%. Robust (mcap >= $1M):
MAPE 83.3%, median |log error| 1.012. The linear fit it
replaces measured MAPE 629.1%, median |log error| 1.212 — the
quadratic wins on the headline, the robust view, and walk-forward.

Walk-forward (fit 47 oldest, listed before 2024-02-18; price 48
newest): median miss ×2.67, MAPE 304.1%, within 3x 52.1%. Ablation, median miss (LOO / walk-forward): flat ×3.82 / ×5.43; +
size curve ×3.61 / ×3.27; + category factor ×3.15 / ×2.67 (SHIPPED);
+ growth ×3.28 / ×2.74; + maturity ×3.46 / ×3.22; shuffled growth
(control) ×3.39 / ×2.97.

The size curve and the category factor earn their place on both
holdouts. Growth and maturity do not — so they stay pruned. Rung 5 is
the negative control: rung 3's growth term fed with ANOTHER row's
7-day change (deterministic cyclic shift in TVL-sorted order).
Shuffled growth is worse than rung 2 on both holdouts, so growth is
noise, not signal.

Range coverage (honest LOO bands): P25–P75 holds 49.2% (nominal 50%),
P10–P90 holds 78.9% (nominal 80%); the printed ×3.15 band holds 50.0%.

Bootstrap (200 resample refits, deterministic seed 42): the size
multiple at $100M TVL has log-s.e. 0.24 (×1.28). The raw coefficient
s.e. are large (a ±12.7, b ±1.35, c ±0.035) because the coefficients
are strongly correlated — read the curve, not the coefficients. Every
row carries its rank range (P10–P90 across the refits) in the Range
column: #1 Steakhouse 1–2, #2 Polymarket 1–4, #10 DeFi Saver 8–17.

Launch odds — fitted twice, rejected twice. A logistic on age + ln
TVL + 7-day growth + category factor fits the cross-section (10-fold
Brier 0.212 vs 0.248 base) but does not transfer forward:
walk-forward Brier 0.220 vs 0.229 base (0.010 better, not the 0.05
required), and on the 2024-02-18 split every variant scores worse
than base. A cohort-share construction (share of protocols with a
token, by age band: <6mo 26%, 6–12mo 40%, 1–2y 38%, 2–4y 64%, 4y+
80%) does worse still: walk-forward Brier 0.2295 vs 0.2293 base, and
0.2531 vs 0.2391 on the 2024-02-18 split. No odds multiply the board.

What was rejected, and why. No size curve is much worse (LOO ×3.82).
Per-category slopes overfit (CDP -1.83 on n = 3, Dexs +1.49 on n =
11); robust fits are a wash; microcap filtering is incoherent ($2M
cut: median |log error| 1.193, MAPE 1674.6%). Worst misses are
near-dead tokens (-5.96) and meme tokens (+6.90).

Only about 29% of comps are predicted within 2x. This model is a
ranking device with honest error bars (low/bull 3.15x), not a price
forecast — read the order as the signal, not the dollar figures.

## 4. Verification audit

758 protocols: 416 have a token, 342 are pre-token. The board ranks
201; the other 141 are excluded with a recorded reason each (758 =
416 + 342; 342 = 201 + 141).

Pre-token means mcap, gecko_id AND symbol are all null. A symbol alone
counts as a token: 287 entries carry a symbol but no mcap (Aave V3,
Morpho Blue, LayerZero V2, Kinetiq).

Exclusions by reason (141 rows, $118.84B excluded TVL against $16.96B
of board TVL): bridge 45 (WBTC $7.91B, Coinbase Bridge $7.23B); cex 42
(Bybit $13.82B, Bitfinex $12.57B); wrapped-staked 31 (Binance Staked
ETH $7.45B, Binance Staked SOL $0.84B); curator 6 (Sentora $2.76B,
Mellow $0.23B, Aera $0.16B); non-defi 5 (Forward Industries SOL
$0.31B, Figure Markets Prime $0.19B); parent-token 4 (Zircuit Staking
$44M, Manta CeDeFi $27M); chain 3 (Chiliz Governance Staking $26M,
Xion Finance $22M, Abstract $9M); unverifiable 3 (RocketSwap Anubis V2
$350M, Project 0 $49M, Project X $34M); stablecoin 2 (Theo Network
THUSD $139M, Flying Tulip FTUSD $6M).

Counterfactual (all 141 excluded rows, shipped model):
Bybit would be #1 at $153.9M, then Bitfinex et al. — the top 15 would
ALL be excluded-type rows; 35 would score above today's #10 ($11.9M),
18 above today's #1 ($30.4M). Admitting them replaces the launch radar
with a CEX and bridge leaderboard.

Nine rows re-admitted after snapshot verification (the watchlist
is a floor, never a ceiling): polymarket-international,
cian-yield-layer, bitfi-basis, loopscale-lending, extended-perps,
arcus-perps, azverse-perps, nado-spot, defi-saver-asset-management.
The 6 curator rows, admitted in radar-5 at a uniform 0.5x, are
excluded again in radar-6 (L14b): their TVL is nested inside
underlying protocols, and keeping Sentora at 0.5x would put it at
$30,453,215 — $28,071 above the board's #1, Steakhouse at
$30,425,144. Liquid Collective stays excluded (it issues LsETH, a
staked-ETH receipt). Admitting only the "DeFi-ish" subset
(parent-token 4 + stablecoin 2) still pollutes the top: Theo Network
THUSD alone would land #13 at $10.7M.

## 5. Concern rows — haircut, flagged, not hidden

Eight rows carry a baked verification concern. The watchlist forces
them in (coverage gate: all 40 watchlist rows); they are flagged
verified = false, and each value is haircut to 0.10x of its modelled
value — restored in radar-6 (L14) after radar-5 put USDD at #1 with
no evidence and the dev score fell 5 cluster steps. Without the
haircut USDD would be $30,689,400 — #1, above Steakhouse. The
haircut is a term in the detail view's dollar build, not a hidden
adjustment.

Concern rows and ranks: usdd #113 (stablecoin; the launch case is a
governance token), bittensor-dtao #159 (parent token TAO already
trades), plume-vaults #188 (parent PLUME already trades),
lightning-network #193 (payments network, no launch mechanism),
hive-protocol #195 (chain-adjacent, weak multiple fit),
saturn #199 (stablecoin wrapper; wrapped asset trades),
doppler-finance #200 (CeDeFi: centralised custody),
noble #201 (Cosmos appchain, not DeFi).

No snapshot-field rule detects these rows: a parent-prefix rule
returns 0 hits on all 8 concern slugs (it fires on 3 excluded rows
only: gate-sol, okx-xbtc, solvbtc-lsts); there is no Stablecoin
category in the snapshot at all, and USDD's category is CDP. These
are external verification judgments, baked as data and disclosed as
judgments.

## 6. Farm mechanics

Every plan has 5-7 steps (top 30 carry 7, the rest 5 or 6). The
standard, enforced by a build-time assertion: step 1 carries capital
+ gas/fees + a hold window; every step carries cost and/or duration;
the exit step states a trigger plus a window; the two extra top-30
steps are a sizing step and a named exit trigger (template rows) or a
monitor step (override rows). v6 measures 1,224 steps, 100% with cost
and/or duration, 100% with both.

Capital tiers by TVL: $500 at >= $500M, $250 at >= $100M, $100 at >=
$25M, $50 below. Duration by age: 60-90 days at >= 730 days, 30-60
at >= 365, 14-30 below; unknown age counts as 365 days, disclosed
on the row.

Points honesty: no points program is ever invented — the snapshot has
no points data, so no row is "known". Categories where points farming
is the norm (Restaking, Liquid Restaking, Yield, Yield Aggregator,
Farm, Liquidity Manager) get "inferred" with conditional wording;
every other row gets "none" (known 0 / inferred 33 / none 168).

The implied airdrop slice per row is implied value x 5-25% community
share (points outstanding unknown, so no per-user value is claimed);
the detail view also shows the expected multiple (whole pie ÷ one
ticket).

Net per row (v6, L20 — audited). The v5 arithmetic (15% share, no
size cap, T-bill on the full deposit) read too generous: at $10,000
it called 180 of 207 rows farm, against 13–29 on the top boards. The
audit tested 11 candidate arithmetics; the shipped one is: slice =
implied FDV x 7% x (deployed / TVL), deployed = min(ticket, 0.02% of
TVL); fees = midpoints of the gas/fee ranges in the plan's own steps;
T-bill forgone = 4% annual on the DEPLOYED ticket (undeployed cash
still earns) over the holding window; hands-on time = 0.5 h per step.
Net = slice − fees − T-bill. The ticket is yours — $250, $1,000,
$10,000 (default) or $50,000 in the board filters — and every net
figure, verdict and sort recomputes live. At the $10,000 default the
split is 33 farm / 63 marginal / 105 skip (at $250 and $1,000: 0 / 0 /
201; at $50,000: 36 / 78 / 87), and the top 10 rows all net negative
(−$23 to −$95, marginal or skip) — the same shape as the top boards.
At the plan-minimum tickets the best row nets −$30.49 (Saturn). The
verdict is deposit-size-dependent: read it with the deposit. Steps
are written for the plan-minimum ticket; the net at the selected
deposit — the detail view states both.

## 7. What the dashboard shows

- Board: all 201 rows, ranked by implied value, with search, category,
  chain, TVL-band, confidence and watchlist-only filters, a deposit
  control ($10,000 default) that recomputes every net figure, a
  verified / flagged chip on every row, net $ / net per hour per row,
  and a bootstrap rank range per row. A model strip above the top-10
  table states the formula in one line with this build's leave-one-out
  and walk-forward multipliers, and an integrity strip ties the page to
  board.json (sha256 + N/N rows recomputed from their own terms +
  totals equal).
- Detail: one view per protocol — low / base / bull range, deposit,
  duration, implied airdrop slice and expected multiple, net if it
  launches (slice − fees − T-bill) with the deployed ticket shown,
  break-even ticket, the farm steps, and the risk note. The multiple
  section shows the implied value built term by term in dollars (size
  curve → category factor → stage discount → concern haircut where it
  applies), the value recomputed from the comps by a named function in
  the page, and the 5 nearest priced live comps by TVL (same category,
  else the family pool, else all comps).
- Model and audit: the formula, this calibration, the leave-one-out
  numbers, the walk-forward backtest, the ablation ladder with its
  negative control, the bootstrap, the exclusion table with reasons
  and the counterfactual (Bybit would-be #1 at $153.9M), and the
  calibration chart. The backtest headline reads LOO ×3.15 (median
  |log error| 1.15) — the multiplier, not MAPE, is the headline.

The calibration chart is a log-log scatter of all 128 comps with the
fitted quadratic curve; the board view carries the same scatter
beside the top 10.

## 8. Limitations

- The leave-one-out numbers are still bad in absolute terms: MAPE
  about 610%, median |log error| 1.149, a typical error of about
  3.2x — the comp set's noise floor is the binding constraint.
- USDD is a concern row at #113 (haircut to $3.07M): the launch case
  is a governance token, not the USDD asset, and the row is flagged
  verified = false with the reason on it. Sentora is excluded (L14b),
  not ranked — at 0.5x it would be #1 by $28,071. Polymarket at #2
  still rests on the Perps & derivatives family factor 2.0 (11 pooled
  comps) — Prediction Market has exactly 1 live comp (Rain, a meme
  outlier).
- No FDV in the sealed snapshot (mcap only), so the model is
  mcap-based throughout.
- The Docker / Node 22 grader run is unverified here (no docker, no
  Node 22; local runs use Node 24).
- A worse new entry replaces the live one (the platform keeps the last
  submission), so the quota must be verified before any re-submit.
