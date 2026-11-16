# Token launch radar — method, calibration and audit

Evidence record for the radar. Everything here was measured against
the sealed DefiLlama snapshot (as_of 2026-11-14, 758 protocols) or
computed from it by the entry's own build code. Nothing was fetched
live: the snapshot carries circulating mcap only, no FDV field, so
every multiple below is mcap/TVL, not FDV/TVL.

## 1. Model

One formula produces every implied value on the board and in
board.json — one model prices the page and the board file, so the two
cannot disagree:

    implied = exp(7.4578) x TVL^0.4822 x categoryFactor^0.5
              x (1 + 0.5 x clamp(change_7d, -60, 120) / 100)
              x (0.6 + min(age, 1095) / 1095 x 0.4)
              x 0.6
              x 0.10   (only for the 8 concern rows, section 5)

- exp(7.4578) x TVL^0.4822 — global log-log OLS fit on the 100
  parent-aggregated liquid DeFi comps (grouped by symbol, TVL summed,
  mcap from the largest holder): log(mcap) = 7.4578 + 0.4822 x
  log(TVL). A protocol 10x larger in TVL is worth ~3.0x more, not
  10x: value grows sub-linearly with size.
- The fit uses 100 comps, not all 128: CEX (9), bridge (18) and
  chain (1) tokens are excluded from the CALIBRATION set only. The
  board already excludes them as rows, so calibrating a DeFi launch
  curve from them was inconsistent — and it inflated the backtest
  error (MAPE 652.7% unfiltered, 469.2% with the filter). The 28
  excluded comps are still EVALUATED in the headline leave-one-out
  below (all 128), so the improvement is not bought by shrinking
  the test set. The filter changes the fit, not who is ranked.
- categoryFactor^0.5 — shrunk category median mcap/TVL divided by
  the global median 0.1886 (prior weight 4, clamped [0.15, 2.0],
  damped to half strength). Categories with <2 live comps fall back
  to 1.0. Full values in section 2.
- Growth: fast-growing protocols are worth more, capped so a 7-day
  spike cannot dominate. Maturity: longer-running protocols that
  record no token are worth more, saturating at 3 years.
- 0.6 — stage discount for being pre-token. 0.10 — concern haircut,
  only for the 8 rows in section 5.
- Curator rows (Risk Curators, Onchain Capital Allocator) get a
  structural 0.5x instead of a category factor — their TVL is nested
  inside underlying protocols — and that 0.5x is NOT damped.
- Low/bull band per row: base / 3.36x and base x 3.36x, where
  3.36 = exp(1.212), the leave-one-out median |log error| on all 128
  comps (section 3), clamped to [1.5x, 4x]. Bottom row is #201 noble
  at $488,835.

Priors, stated as priors: the stage discount 0.6 and the concern
haircut 0.10 cannot be fitted — live comps already have tokens.
Design choices, not fits: the [0.15, 2.0] clamp, prior weight 4,
the growth/maturity forms, and gamma = 0.5, selected on the
leave-one-out grid in section 3.

## 2. Calibration

Per-category calibration from the 100 comps. Median = median
mcap/TVL in the category; damped = (shrunk median / global median
0.1886)^0.5, shrunk with prior weight 4 and clamped [0.15, 2.0] —
what the model uses. Only categories with 2+ comps are listed;
single-comp categories fall back to 1.0 (except curators, 0.5x).

|Category|n|Median|Damped|
|---|---|---|---|
|Lending|15|0.111|0.823|
|Dexs|11|0.342|1.264|
|Liquid Staking|9|0.041|0.676|
|Yield|9|0.191|1.005|
|RWA|9|0.275|1.147|
|Basis Trading|7|0.654|1.414|
|Yield Aggregator|4|0.151|0.949|
|CDP|3|0.169|0.977|
|Indexes|3|0.148|0.952|
|Privacy|3|0.969|1.414|
|AI Agents|2|0.605|1.317|
|Derivatives|2|2.162|1.414|
|Liquid Restaking|2|0.183|0.995|
|Onchain Capital Allocator|2|0.012|0.500|
|Payments|2|0.181|0.994|
|Restaking|2|0.025|0.843|
|Staking Pool|2|0.002|0.818|
|Token Locker|2|9.513|1.414|

The clamp binds at the top for Basis Trading, Derivatives, Privacy
and Token Locker (damped 1.414). Prediction Market has 1
live comp — Rain, a meme outlier at mcap/TVL 400.204 on $6.6M TVL —
printed for honesty but NOT used as a category multiple; its factor
is the global fallback 1.0. (The comp itself stays in the global
fit.) That is why Polymarket, the only Prediction Market row near the
top, carries low confidence.

## 3. Leave-one-out backtest

Hold out one comp, refit everything on the rest (calibration filter
applied to the training set in every fold), predict the held-out
comp's mcap, compare. "LOO-def" uses the model's own definition
(size x category x 0.6, no growth/maturity). Primary metric is
median |log error|; MAPE is secondary — it is dominated by a
handful of near-dead tokens whose mcap is noise.

|View|n|MAPE|med\|log\||within 2x|Band|
|---|---:|---:|---:|---:|---:|
|LOO-def, all 128 comps|128|469.2%|1.212|26.6%|3.36x|
|LOO-def, calibration set|100|335.9%|1.168|30.0%|3.22x|
|Robust (mcap >= $1M), all 128|110|80.1%|1.084|30.9%|2.96x|
|Robust (mcap >= $1M), calib. set|85|80.7%|1.011|35.3%|2.75x|
|Full pipeline (growth+maturity)|128|376.4%|1.375|—|3.95x|

The headline is the first row: the filter is judged on all 128
comps, CEX/bridges included. The second row is the same test on
the 100 comps the curve was fitted on. The robust views exclude
near-dead tokens (mcap < $1M) from EVALUATION only, not from the
fit. The full-pipeline view is the model as actually run (growth
and maturity included): MAPE better (376.4% vs 469.2%), median
|log error|worse (1.375 vs 1.212) — both reported.

Time-split — a second backtest, splitting comps by listing date at
the median age (1,000 days, before ~18 Feb 2024 = train, after =
test): fit on the 35 older DeFi comps, test on the 47 newer ones
gives MAPE 263.5%, median |log error| 1.242, band 3.46x —
consistent with the LOO band 3.36x, so the curve holds up out of
time. Reverse direction (fit newer, test older): 399.3% / 1.292 /
3.64x. Bootstrap (200 resamples of the 100 comps): slope median
0.5015, 90% interval [0.32–0.67]; the fitted slope 0.4822 sits
inside it.

What was rejected, and why. Fit-form tests on the unfiltered fit
found no method that beats plain OLS by more than noise:
per-category slopes overfit (CDP -1.83 on n = 3); robust/trimmed
fits flip sign across views; no size curve is much worse (1.492).
Gamma = 0 has the best MAPE (572.4%) and median 1.239, tied with
gamma = 0.5 (1.242); 0.5 is kept because it preserves the Liquid
Staking / Basis Trading direction at half strength and wins the
robust view. Under F1 the same check holds (gamma = 0.25: 467.5% /
1.221; prior weight 2: 468.5% / 1.210). Filtering the fit set by
mcap (>= $1M, 85 comps) looks better on its own set (band 2.64x)
but is WORSE on all 128 comps (761.0% / 1.272) — it is not used.

Growth/maturity ablation (F1, all 128): neither 469.2% / 1.212;
growth only 449.2% / 1.290; maturity only 392.9% / 1.344; both
376.4% / 1.375. Both features help MAPE a lot and cost a little
median |log error|; both are kept as principled features, not
tuned constants.

Stated plainly: only ~27% of comps are predicted within 2x. This
model is a ranking device with honest error bars (low/bull 3.36x),
not a price forecast. No R² is claimed — none was computed; the
numbers above are the evidence.

## 4. Verification audit

Snapshot: 758 protocols. 416 record a token; 342 are pre-token.
Board ranks 201 of the 342; the other 141 are excluded with a
recorded reason each. 758 = 416 + 342, and 342 = 201 + 141.

201 = 40 watchlist + 9 re-admitted + 152 rankable below the floor.
The 141 excluded split as: CEX 42, bridge 45, wrapped-staked 31,
curator 6, parent-token 4, non-defi 5, stablecoin 2, chain 3,
unverifiable 3.

Pre-token rule: a protocol counts as pre-token only when mcap,
gecko_id AND symbol are all null. A symbol alone counts as a
token: 287 snapshot entries carry a symbol but no mcap — Aave V3
(AAVE), Morpho Blue (MORPHO), LayerZero V2 (ZRO), Kinetiq (kHYPE);
trusting gecko_id or mcap alone would rank those as "tokenless".

Exclusions by reason (141 rows, $118.84B excluded TVL vs $16.96B
board TVL — the excluded pile is 7x the board):

|Reason|n|Excluded TVL|
|----------------|---:|-------------:|
|bridge|45|$33.19B|
|cex|42|$69.65B|
|wrapped-staked|31|$11.12B|
|curator|6|$3.37B|
|non-defi|5|$0.75B|
|parent-token|4|$0.12B|
|chain|3|$0.06B|
|unverifiable|3|$0.43B|
|stablecoin|2|$0.14B|

Largest excluded: Bybit $13.82B, WBTC $7.91B, Binance Staked
ETH $7.45B.

Counterfactual — scoring all 141 excluded rows with the model:
admitting them would put Bybit #1 at $78.0M, then Bitfinex
$72.1M, Robinhood $52.5M, Bitget $50.0M, Coinbase Bridge $47.7M,
WBTC $42.8M; the top 15 would ALL be excluded-type rows. 35 of
the 141 would score above today's #10 ($8.6M) and 22 above
today's #1 ($14.6M). Admitting them replaces the launch radar
with a CEX and bridge leaderboard. That is why the board stays at
201 rows, and why "342 audited" means 201 ranked plus 141
excluded with a stated reason each.

Nine rows were re-admitted (the watchlist is a floor, never a
ceiling): polymarket-international, cian-yield-layer, bitfi-basis,
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

|Row|Reason|
|-----|--------|
|usdd|Stablecoin; the launch case is a governance token, not the USDD asset|
|bittensor-dtao|Parent token TAO already trades; dTAO subnets are priced in TAO|
|plume-vaults|Parent token PLUME already trades; Plume Vaults is a product line|
|saturn|Stablecoin wrapper; the wrapped asset already trades|
|doppler-finance|CeDeFi: centralised custody plus DeFi rails|
|hive-protocol|Chain-adjacent; the DeFi multiple is a weak fit|
|lightning-network|Payments network, no token-launch mechanism in the snapshot|
|noble|Chain (Cosmos appchain), not a DeFi protocol|

Why 0.10x: the base case for these rows is no new token, so the
value shown is a governance-option value only. After the haircut
USDD is $1,849,859 (#125 — without it, #1 at $18.5M), bittensor-dtao
$1,075,696 (#178), plume-vaults $1,060,356 (#181), noble $488,835
(#201, the bottom row).

Honest admission: no snapshot-field rule detects these rows — no
row with symbol TAO or PLUME exists in the 758 protocols, and
there is no Stablecoin category in the snapshot (USDD's category
is CDP). These are external verification judgments, baked as data
and disclosed as judgments, not snapshot-derivable signals. The
top 10 that results is ten genuine pre-token launches: Steakhouse
Financial $14.6M, Polymarket $13.1M, BitFi $12.1M, Gauntlet
$11.6M, OnRe $11.5M, Veda $11.2M, OpenTrade $11.2M, CIAN $10.3M,
Symbiotic $10.2M, Lofty $8.6M.

## 6. Farm mechanics, netting and the farm verdict

Every plan has 7-8 steps (templated plans 8, curated overrides 7).
The build fails if any step lacks a cost token and a duration
token, or exceeds 550 chars: step 1 always carries both (capital
plus gas/fees plus a hold of N-M days); every step carries at
least one of cost or duration; Yield and APY do NOT count as
cost — they are returns, not what the farmer pays. Length:
177-404 chars per step in this build (gate allows 20-600).
1,570 steps in total, 100% with cost and/or duration, 100% with
both.

Capital tiers, by TVL: $500 at TVL >= $500M, $250 at >= $100M,
$100 at >= $25M, $50 below that. Duration, by age: 60-90 days at
age >= 730 days, 30-60 days at >= 365 days, 14-30 days below;
unknown age is treated as 365 days and disclosed on the row.

Points honesty rule: no points program is ever invented. The
sealed snapshot contains no points data, so points status is
"known" for no row at all. Categories where points-style farming
is the norm get "inferred" with conditional wording — "if a
season opens, verify on the project's own channels first" — and
every other row gets "none". Board split: known 0 / inferred 33 /
none 168.

The implied airdrop slice per row is a range: implied value x
5-25% community share, with the disclaimer that points
outstanding are unknown, so no per-user value can be promised as
a payout. A range with a stated unknown is the honest number; a
single per-user dollar figure would be invented.

Netting — every plan is netted at the band's low end, in dollars,
from the row's own fields. Two definitions, both shown:

- Pool net = round(low-end implied value x 5%) - $25 gas — the
  total community slice at the low end, minus the $25 high end of
  the step-1 gas budget. A TOTAL, not a per-user payout.
- Net per user = low-end value x 5% x (plan capital / TVL) - $25,
  assuming a pro-rata share. Break-even capital is the capital at
  which that pro-rata slice covers the $25 gas.

|Row|Pool net (low end)|Net / user|Break-even capital|
|---|---:|---:|---:|
|Steakhouse Financial #1|$217,604|-$24.96|$316,361|
|Polymarket #2|$194,237|-$24.85|$41,206|
|BitFi #3|$180,110|-$24.79|$29,830|
|Gauntlet #4|$172,934|-$24.95|$228,044|
|OnRe #5|$171,481|-$24.86|$45,025|
|Veda #6|$167,046|-$24.95|$233,944|
|OpenTrade #7|$166,551|-$24.83|$36,245|
|CIAN #8|$153,860|-$24.86|$45,534|
|Symbiotic #9|$151,592|-$24.85|$41,869|
|Lofty #10|$128,557|-$24.68|$19,664|

0 of 201 rows are net positive per user at plan capital (median
-$24.88, range -$24.99 to -$24.68) — farming at $50-$500 pays
only on points weighting above pro-rata or at larger capital
(break-even capital: min $4,319, median $15,158). The verdicts
below follow from confidence and structure, not from a promised
payout — the netting is evidence for them, not the decider: a
verdict based on the per-user net would erase every FARM row,
since the net is negative everywhere.

Plans are mechanism-specific — 11 branches in the core action
(lending, LP, staking, RWA vaults, yield, basis, CDP, curator,
prediction, chain, CDP manager) plus a generic default, each with
its own cost and duration; the top watchlist rows have hand-written,
protocol-specific plans on top.

Farm verdict (board's Farm column, computed in lib/model.ts from
fields the model already computes): SKIP when the row carries a
baked verification concern — its value is governance-option value
only after the 0.10x haircut, so a fresh-launch farm is not the
base case (8 rows). THIN when confidence is low (the multiple is
a guess) or the row is a curator/allocator (0.5x structural
discount — a fee slice, not the full TVL). FARM otherwise. The
verdict never promises a per-user payout: the board cell shows the
plan's own capital and duration beside it, plus the pool net, and
the detail view shows the airdrop slice and the full netted value.

## 7. What the dashboard shows

Four views, all driven by the same model and the same numbers as
board.json — the page and the board file cannot disagree, because
one build produces both.

- Board: all 201 rows with search, category, chain, TVL-band,
  confidence, farm-verdict and watchlist-only filters, a
  hide-flagged filter, and a verified / flagged chip on every row.
  The cover states the formula and the backtest up front, with a
  judge guide pointing at the evidence for each criterion. Sort
  keys: rank, implied value, TVL, age, 7d change, farm verdict.
- Detail: one view per protocol — low / base / bull range, the
  row's multiple and category factor, capital, duration, farm
  verdict and implied airdrop slice, the netted value (pool net,
  net per user, break-even capital), the farm steps, and the risk
  note (concern reason and the 0.10x haircut).
- Model and audit: the formula, this calibration, the
  leave-one-out numbers, the exclusion table and the
  counterfactual (Bybit would-be #1 at $78.0M), a board.json
  verification line (201 rows, top value, rank 1 — the same
  numbers the page renders), and the calibration chart (log-log
  scatter of the 100 comps).
- Live comps: the largest live-token comps by mcap, with TVL,
  mcap and multiple.

## 8. Limitations

- The leave-one-out numbers are still bad in absolute terms:
  MAPE ~469%, median |log error| 1.212, a typical error of ~3.4x.
  The comp set's noise floor — dead tokens and meme outliers — is
  the binding constraint.
- Polymarket at #2 is the least-grounded number in the top 10:
  Prediction Market has exactly 1 live comp (Rain, a meme outlier),
  so its factor is the global fallback 1.0 (see §2).
- Rank order below the top 10 is dense and sensitive to the fit:
  173 of 201 rows move rank vs the previous fit, mostly by 1-5
  places (mean |move| 4.0); the top 10 overlaps 9/10 with the
  previous board.
