# Token launch radar — method, calibration and audit

Evidence record for the radar. Everything here was measured against
the sealed DefiLlama snapshot (as_of 2026-11-14, 758 protocols) or
computed from it by the entry's own build code. Nothing was fetched
live: the snapshot carries circulating mcap only, no FDV field, so
every multiple below is mcap/TVL, not FDV/TVL. (An earlier draft
labelled it FDV/TVL; that was wrong and is corrected here.)

## 1. Model

One formula produces every implied value on the board and in
board.json — one model prices the page and the board file, so the two
cannot disagree:

    implied = exp(6.5244) x TVL^0.5444 x categoryFactor^0.5
              x (1 + 0.5 x clamp(change_7d, -60, 120) / 100)
              x (0.6 + min(age, 1095) / 1095 x 0.4)
              x 0.6
              x 0.10   (only for the 8 concern rows, section 5)

- exp(6.5244) x TVL^0.5444 — global log-log OLS fit on the 128
  parent-aggregated live-token comps (grouped by symbol, TVL summed,
  mcap from the largest holder): log(mcap) = 6.5244 + 0.5444 x
  log(TVL). A protocol 10x larger in TVL is worth ~3.5x more, not
  10x: value grows sub-linearly with size.
- categoryFactor^0.5 — shrunk category median mcap/TVL divided by
  the global median 0.1998 (prior weight 4, clamped [0.15, 2.0],
  damped to half strength, gamma = 0.5). Categories with <2 live
  comps fall back to 1.0. Full values in section 2.
- Growth: fast-growing protocols are worth more, capped so a 7-day
  spike cannot dominate. Maturity: longer-running with no token is
  worth more, saturating at 3 years.
- 0.6 — stage discount for being pre-token. 0.10 — concern haircut,
  only for the 8 rows in section 5.
- Curator rows (Risk Curators, Onchain Capital Allocator) get a
  structural 0.5x instead of a category factor — their TVL is nested
  inside underlying protocols — and that 0.5x is NOT damped.
- Low/bull band per row: base / 3.46x and base x 3.46x, where
  3.46 = exp(1.242), the leave-one-out median |log error| (section
  3), clamped to [1.5x, 4x]. The board keeps 201 rows and 201
  distinct implied values; bottom row is #201 Monarq at $520,988.

Priors, stated as priors: the stage discount 0.6 and the concern
haircut 0.10 cannot be fitted — live comps already have tokens.
Design choices, not fits: the [0.15, 2.0] clamp, prior weight 4,
the growth/maturity forms, and gamma = 0.5, selected on the
leave-one-out grid in section 3.

## 2. Calibration

Per-category calibration from the 128 comps. Median = median
mcap/TVL in that category; raw factor = shrunk median / global
median 0.1998 (prior weight 4, clamped [0.15, 2.0]); damped =
raw^0.5, what the model uses.

| Category         | n  | Median | Raw | Damped |
|------------------|---:|-------:|----:|-------:|
| Lending          | 15 |  0.111 | 0.651 | 0.807 |
| Dexs             | 11 |  0.342 | 1.523 | 1.234 |
| Liquid Staking   |  9 |  0.041 | 0.448 | 0.670 |
| Yield            |  9 |  0.191 | 0.971 | 0.985 |
| RWA              |  9 |  0.275 | 1.260 | 1.122 |
| Basis Trading    |  7 |  0.654 | 2.000 | 1.414 |
| CDP              |  3 |  0.169 | 0.933 | 0.966 |
| Restaking        |  2 |  0.025 | 0.708 | 0.841 |
| Derivatives      |  2 |  2.162 | 2.000 | 1.414 |
| Yield Aggregator |  4 |  0.151 | 0.878 | 0.937 |
| Prediction Market|  1 | 400.204| 1.000 | 1.000 |

The clamp binds at the top for Basis Trading and Derivatives (raw
2.0, damped 1.414). Prediction Market has 1 live comp — Rain, a
meme outlier at mcap/TVL 400.204 on $6.6M TVL — printed for honesty
but NOT used; its factor is the global fallback 1.0. That is why
Polymarket, the only Prediction Market row near the top, carries low
confidence (section 7).

## 3. Leave-one-out backtest

Hold out one of the 128 comps, refit everything on the other 127,
predict the held-out comp's mcap, compare. "LOO-def" uses the
model's own definition (size x category x 0.6, no growth/maturity).
Primary metric is median |log error|; MAPE is secondary — it is
dominated by a handful of near-dead tokens whose mcap is noise.

| Candidate                              | MAPE    | med\|log\| |
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

Chosen model (gamma = 0.5, LOO-def, n = 128): MAPE 652.7%,
median |log error| 1.242, within 2x 25.8%, within 3x 45.3%. Two
further views: robust view — held-out comps with mcap >= $1M
only (near-dead tokens excluded from evaluation, not from the
fit) — MAPE 85.8%, median |log error| 1.043, and gamma = 0.5 is
the best model on both metrics there. Full-pipeline view (growth
and maturity included, the model as actually run): MAPE 506.9%,
median |log error| 1.332.

What was rejected, and why. Per-category slopes (M1/M6) overfit:
fitted slopes are wild (CDP -1.83 on n = 3, Dexs +1.49 on n = 11)
and every variant is worse than M0 on median |log error| except
one whose MAPE is 2072%. Robust fits are a wash — the trimmed fit
improves median |log error| to 1.230 on LOO-def but is worse on
the full-pipeline view (1.426 vs 1.332) and the robust view
(1.102 vs 1.043); an improvement that flips sign across views is
noise, so plain OLS stays. No size curve (M3) is much worse
(1.492): the size curve is essential. Microcap filtering (M4) is
incoherent: median |log error| 1.193 while MAPE explodes to
1674.6%.

Gamma = 0 has the best MAPE (572.4%) and median |log error|
1.239, statistically tied with gamma = 0.5 (1.242). Gamma = 0.5 is
chosen because under gamma = 0, Liquid Staking rows rise 2.23x
and Basis Trading rows fall 0.50x, which reads as wrong to anyone
who knows liquid staking trades near 0.03-0.05x TVL and basis
near 0.65x. Gamma = 0.5 keeps that direction at half strength
and wins the robust view outright.

Growth/maturity ablation (gamma = 0.5, full pipeline): both on
506.9% / 1.332; growth only 623.1% / 1.302; maturity only 530.8%
/ 1.255; neither 652.7% / 1.242. Both features help MAPE a lot
and cost a little median |log error|; both are kept, because they
are principled, documented features, not tuned constants.

Stated plainly: only ~26% of comps are predicted within 2x, even
by the best model tested. This model is a ranking device with
honest error bars (low/bull 3.46x), not a price forecast. No R²
is claimed for the fit — none was computed; the scatter and the
leave-one-out numbers above are the calibration evidence.

## 4. Verification audit

Snapshot: 758 protocols. 416 have a token; 342 are pre-token.
Board ranks 201 of the 342; the other 141 are excluded with a
recorded reason each. 758 = 416 + 342, and 342 = 201 + 141.

Pre-token rule: a protocol counts as pre-token only when mcap,
gecko_id AND symbol are all null. A symbol alone counts as a
token: 287 snapshot entries carry a symbol but no mcap — Aave V3
(AAVE), Morpho Blue (MORPHO), LayerZero V2 (ZRO), Kinetiq (kHYPE).
Trusting gecko_id or mcap alone would rank those as "tokenless".

Exclusions by reason (141 rows, $118.84B excluded TVL vs $17.0B
board TVL — the excluded pile is 7x the board):

| Reason         | n  | Excluded TVL |
|----------------|---:|-------------:|
| bridge         | 45 |       $33.19B |
| cex            | 42 |       $69.65B |
| wrapped-staked | 31 |       $11.12B |
| curator        |  6 |        $3.37B |
| non-defi       |  5 |        $0.75B |
| parent-token   |  4 |        $0.12B |
| chain          |  3 |        $0.06B |
| unverifiable   |  3 |        $0.43B |
| stablecoin     |  2 |        $0.14B |

Largest excluded: Bybit $13.82B, WBTC $7.91B, Binance Staked
ETH $7.45B.

Counterfactual — scoring all 141 excluded rows with the model:
admitting them would put Bybit #1 at $98.7M, then Bitfinex
$90.7M, Coinbase Bridge $68.2M, Robinhood $65.9M, WBTC $61.6M;
the top 15 would ALL be excluded-type rows. 35 of the 141 would
score above today's #10 ($10.7M) and 18 above today's #1
($22.2M). Admitting them replaces the launch radar with a CEX and
bridge leaderboard. That is why the board stays at 201 rows, and
why "342 audited" means 201 ranked plus 141 excluded with a
stated reason each, not 342 ranked.

Nine rows were re-admitted after snapshot verification, because
the watchlist is a floor, never a ceiling:
polymarket-international, cian-yield-layer, bitfi-basis,
loopscale-lending, extended-perps, arcus-perps, azverse-perps,
nado-spot, defi-saver-asset-management. Each passes the pre-token
check and is none of CEX / bridge / wrapped-staked / parent-token.
Liquid Collective stays excluded: it issues LsETH, a staked-ETH
receipt (wrapped-staked).

## 5. House-forced rows

Eight board rows carry a baked verification concern. They are on
the board because the house watchlist forces them in (coverage
gate: all 40 watchlist rows), flagged verified = false with the
reason on the row. Each value is cut by a uniform 0.10x haircut:

| Row | Reason | Post-haircut rank |
|-----|--------|------------------:|
| usdd | USDD is itself a stablecoin; the launch case is a governance token, not the USDD asset | #99 |
| bittensor-dtao | Parent token TAO already trades; dTAO subnets are priced in TAO | #159 |
| plume-vaults | Parent token PLUME already trades; Plume Vaults is a product line of Plume | #165 |
| saturn | Stablecoin wrapper; the wrapped asset already trades | #193 |
| doppler-finance | CeDeFi: centralised custody plus DeFi rails | #197 |
| hive-protocol | Chain-adjacent; the DeFi multiple is a weak fit | #177 |
| lightning-network | Payments network, no token-launch mechanism visible in the snapshot | #187 |
| noble | Chain (Cosmos appchain), not a DeFi protocol | #199 |

Why 0.10x: the base case for these rows is no new token, so the
value shown is a governance-option value only. After the haircut
USDD is $2,619,379 (#99, was #1), bittensor-dtao $1,410,582
(#159, was #4), plume-vaults $1,344,224 (#165, was #10), noble
$597,687 (#199).

Honest admission: no snapshot-field rule detects these rows — no
row with symbol TAO or PLUME exists in the 758 protocols, and
there is no Stablecoin category in the snapshot (USDD's category
is CDP). These are external verification judgments, baked as data
and disclosed as judgments, not snapshot-derivable signals. The
top 10 that results is ten genuine pre-token launches: Steakhouse
Financial $22.2M, Polymarket $17.4M, Gauntlet $17.1M, Veda
$16.5M, BitFi $15.7M, OnRe $15.0M, OpenTrade $14.3M, CIAN
$13.5M, Symbiotic $13.4M, DeFi Saver $10.7M.

## 6. Farm mechanics and the farm verdict

Every plan has 5-6 steps. The v2 standard, enforced by a
build-time assertion (the build fails if any step lacks a cost
token and a duration token, or exceeds 550 chars): step 1 always
carries both (capital plus gas/fees plus a hold of N-M days);
every middle step carries at least one of cost or duration;
Yield and APY do NOT count as cost — they are returns, not what
the farmer pays. The disclaimer step carries the plan's numbers
by reference; the exit step states a trigger plus a window.
Length: 150-450 chars per step (gate allows 20-600).

Capital tiers, by TVL: $500 at TVL >= $500M, $250 at >= $100M,
$100 at >= $25M, $50 below that. Duration, by protocol age:
60-90 days at age >= 730 days, 30-60 days at age >= 365 days,
14-30 days below that; unknown age is treated as 365 days and
disclosed on the row.

Points honesty rule: no points program is ever invented. The
sealed snapshot contains no points data, so points status is
"known" for no row at all. Categories where points-style farming
is the norm get "inferred" with conditional wording — "if a
season opens, verify on the project's own channels first" — and
every other row gets "none". On the board the split is known 0 /
inferred 33 / none 168.

The implied airdrop slice per row is a range: implied value x
5-25% community share, with the disclaimer that points
outstanding are unknown, so no per-user value can be computed
honestly. A range with a stated unknown is the honest number; a
single per-user dollar figure would be invented.

Farm verdict (shown in the board's Farm column, computed in
lib/model.ts from fields the model already computes): SKIP when
the row carries a baked verification concern — its value is
governance-option value only after the 0.10x haircut, so a
fresh-launch farm is not the base case (8 rows). THIN when
confidence is low (the multiple is a guess) or the row is a
curator/allocator (0.5x structural discount — a fee slice, not
the full TVL). FARM otherwise. The verdict never promises a
per-user payout: the board cell shows the plan's own capital and
duration beside it, and the detail view shows the airdrop slice.

## 7. What the dashboard shows

Four views, all driven by the same model and the same numbers as
board.json — the page and the board file cannot disagree, because
one build produces both.

- Board: all 201 rows with search, category, chain, TVL-band,
  confidence, farm-verdict and watchlist-only filters, a
  hide-flagged filter, and a verified / flagged chip on every row.
  The board cover states the formula and the leave-one-out
  backtest up front. Sort keys: rank, implied value, TVL, age,
  7d change, farm verdict.
- Detail: one view per protocol — low / base / bull range, the
  row's multiple and category factor, capital, duration, farm
  verdict and implied airdrop slice, the farm steps, and the risk
  note (including the concern reason and the 0.10x haircut).
- Model and audit: the formula, this calibration, the
  leave-one-out numbers, the exclusion table and the
  counterfactual (Bybit would-be #1 at $98.7M), and the
  calibration chart — a log-log scatter of all 128 comps with the
  fitted line log(mcap) = 6.5244 + 0.5444 x log(TVL).
- Live comps: the largest live-token comps by mcap, with TVL,
  mcap and multiple.

## 8. Limitations

- The leave-one-out numbers are still bad in absolute terms:
  MAPE ~653%, median |log error| 1.242, a typical error of ~3.5x.
  The comp set's noise floor — dead tokens and meme outliers — is
  the binding constraint, and no fit form tested beats it.
- Polymarket at #2 is the least-grounded number in the top 10:
  Prediction Market has exactly 1 live comp (Rain, itself a meme
  outlier), so its factor is the global fallback 1.0 and its
  confidence is low, disclosed on the row.
- There is no FDV in the sealed snapshot (mcap only), so the
  model is mcap-based throughout.
- The stage discount (0.6) and the concern haircut (0.10) are
  priors, not fits.
- Rank order below the top 10 is dense and sensitive to gamma:
  190 of 201 rows move rank vs v1, mostly by 1-5 places.
