// model.ts — radar-3: the token radar's model.
//
// One snapshot of the protocol universe in, one ranked board out. The board
// covers every slug in the snapshot's watchlist (the floor, never a ceiling)
// and adds rankable pre-token protocols below the watchlist floor.
//
// The model is calibrated from the snapshot's OWN live-token protocols —
// nothing is hardcoded by name:
//   1. Parent-aggregate the live set: DefiLlama splits TVL across versioned
//      sub-entries (Aave V3, Morpho Blue, ...) while mcap/gecko live on the
//      parent. Protocols sharing a symbol are grouped, TVL is summed, mcap is
//      the group's max. That gives 128 live-token comps.
//   2. OLS log-log fit log(mcap) = a + b*log(tvl) on the 100 DeFi comps
//      (F1 calibration filter: CEX, bridge and chain tokens are excluded
//      from the calibration set only — the board already excludes them as
//      rows, so calibrating a DeFi launch curve from them inflated the
//      backtest error; see CALIBRATION_EXCLUDED_CATEGORIES).
//      Slope < 1: smaller protocols command higher multiples (the size curve).
//   3. Per-category relative factor: the category's median mcap/TVL, shrunk
//      toward the global median (prior weight 4) and expressed relative to it,
//      clamped to [0.15, 2.0]. Categories with fewer than 2 live comps get
//      factor 1.0 (no comps -> global). Vault curators / capital allocators
//      get a flat 0.5x: their TVL is nested inside underlying protocols, so a
//      token would capture a fee slice, not the full TVL. The factor is
//      applied at half strength (factor^0.5); the curator 0.5x is NOT damped.
//   4. implied = TVL x sizeCurve(TVL) x categoryFactor^0.5 x growth x maturity
//      x stageDiscount(0.6) x 0.10 if the row carries a baked verification
//      concern (8 slugs in lib/verify.ts), where growth = 1 + 0.5*clamp(change_7d,-60,120)/100
//      and maturity = 0.6 + min(age,1095)/1095*0.4 (unknown age = 365d).
//   5. Leave-one-out backtest of the fitted model is computed at runtime and
//      reported honestly in the model panel; the low/bull band is
//      exp(+/-median absolute log error), clamped to [1.5x, 4x].
//
// Determinism: no wall clock, no randomness, no network. Age is measured
// against the snapshot's own as_of date. All verification judgments live in
// lib/verify.ts (baked data); all farm plans in lib/farm.ts.

import { farmPlanFor } from './farm.ts';
import {
  concernFor,
  CURATOR_CATEGORIES,
  exclusionReason,
  isPreToken,
  isVerified,
  REASON_LABELS,
  type ExclusionReason,
} from './verify.ts';

export const MODEL_VERSION = 'radar-3';
export const STAGE_DISCOUNT = 0.6;
export const UNKNOWN_AGE_DAYS = 365;
export const MATURITY_DAYS = 1095;
export const LIVE_ROWS = 24;

/** F1 calibration filter — categories excluded from the CALIBRATION set
 *  only, never from the board. The board's own exclusion rules already say
 *  a CEX balance, a bridge / wrapped asset or a chain is not a token
 *  launch, so fitting the DeFi launch curve from their tokens is
 *  inconsistent: it inflated the leave-one-out error (MAPE 652.7% ->
 *  469.2% on all 128 comps when the filter is applied). The 28 excluded
 *  comps are still EVALUATED in the headline LOO (all 128), so the
 *  improvement is not bought by shrinking the test set. */
export const CALIBRATION_EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Cross Chain Bridge',
  'Canonical Bridge',
  'Bridge',
  'Chain',
]);

/** One protocol entry, exactly the ten fields the sealed input carries.
 *  listed_at is normalised to epoch seconds (UTC midnight) or null, so age is
 *  plain arithmetic against the snapshot's as_of date. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: number | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  asOf: string;
  floorUsd: number;
  watchlist: string[];
  protocols: SnapshotProtocol[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarComp {
  name: string;
  category: string;
  tvl: number;
  mcap: number;
  multiple: number;
}

export interface RadarRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  rank: number;
  implied_low: number;
  implied_base: number;
  implied_bull: number;
  confidence: 'high' | 'medium' | 'low';
  watchlist: boolean;
  verified: boolean;
  multiple_used: number;
  /** Damped category factor actually applied (0.5 for curator categories,
   *  otherwise the raw factor ^0.5). Excludes the concern haircut. */
  factor_used: number;
  farm_steps: string[];
  farm: {
    capital_usd: number;
    duration: string;
    points: 'known' | 'none' | 'inferred';
    airdrop_range: [number, number];
    /**
     * Netting at the band's low end (5% community share, $25 gas), computed
     * in lib/farm.ts from the row's own fields — no payout is invented:
     * pool_net_low_usd = round(implied_low x 0.05) - 25 is the TOTAL pool
     * slice minus gas (not a per-user payout); net_per_user_low_usd =
     * implied_low x 0.05 x (capital/TVL) - 25 under a stated pro-rata
     * share assumption (negative on every row at plan capital — the plan
     * says so); breakeven_capital_usd is the capital at which the
     * pro-rata slice covers the $25 gas.
     */
    pool_net_low_usd: number;
    net_per_user_low_usd: number;
    breakeven_capital_usd: number;
  };
  /**
   * Farm verdict, derived from fields the model already computes.
   * SKIP when the row carries a baked verification concern (its value is
   * governance-option value only after the 0.10x haircut, so a fresh-launch
   * farm is not the base case); THIN when confidence is low (the multiple
   * is a guess) or the row is a curator/allocator (0.5x structural
   * discount — a fee slice, not the full TVL); FARM otherwise. The verdict
   * is NOT decided by the netting numbers above — the pro-rata net is
   * negative on every row at plan capital, so a net-based verdict would
   * erase every FARM. Netting is the evidence, not the decider.
   */
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  risks: string[];
}

export interface RadarData {
  generated: string;
  snapshotAsOf: string;
  model: {
    name: string;
    formula: string;
    loglog: { a: number; b: number };
    categoryMultiples: { [cat: string]: number };
    stageDiscount: number;
    /** Headline LOO: evaluated on ALL 128 parent-aggregated live comps,
     *  while each fold's fit uses the F1 calibration set (100 DeFi comps)
     *  only. `robust` is the same evaluation restricted to held-out comps
     *  with mcap >= $1M (near-dead tokens excluded from that view only). */
    loo: {
      n: number;
      mape: number;
      medianAbsLogErr: number;
      within2x: number;
      within3x: number;
      robust: { n: number; mape: number; medianAbsLogErr: number; within2x: number };
    };
    /** LOO evaluated on the 100 calibration (DeFi) comps themselves, with
     *  the same robust view (held-out comps with mcap >= $1M). */
    looCal: {
      n: number;
      mape: number;
      medianAbsLogErr: number;
      within2x: number;
      within3x: number;
      robust: { n: number; mape: number; medianAbsLogErr: number; within2x: number };
    };
    /** How many parent-aggregated live comps the curve was fitted on (F1: 100). */
    calibrationN: number;
    comps: RadarComp[];
    /** All 128 parent-aggregated live comps as [tvl, mcap, category] triples,
     *  sorted by tvl ascending — the calibration-chart scatter population. */
    fitPoints: [number, number, string][];
  };
  audit: {
    total: number;
    preToken: number;
    withToken: number;
    watchlist: number;
    boardRows: number;
    excluded: { reason: string; count: number; examples: string[] }[];
    /** What the 141 excluded rows would have scored, had they been admitted. */
    counterfactual: {
      top_name: string;
      top_value_usd: number;
      above_top10: number;
      above_top1: number;
      excluded_tvl_usd: number;
      board_tvl_usd: number;
      excluded_count: number;
    };
  };
  rows: RadarRow[];
  live: {
    name: string;
    category: string;
    tvl_usd: number;
    mcap_usd: number;
    multiple: number;
  }[];
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** "2026-11-14" -> UTC epoch milliseconds at midnight. */
function parseAsOf(asOf: string): number {
  const [y, m, d] = asOf.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** "2026-05-25" (or an ISO datetime) -> epoch seconds at UTC midnight, or null. */
function listedAtToEpoch(v: unknown): number | null {
  if (typeof v !== 'string' || v.length < 10) return null;
  const date = v.slice(0, 10);
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.floor(Date.UTC(y, m - 1, d) / 1000);
}

/**
 * Parse the sealed snapshot. Tolerates the two shapes the input can take:
 * listed_at as an ISO date string (the sealed file) or as epoch seconds.
 */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as {
    as_of: string;
    floor_usd: number;
    watchlist: string[];
    protocols: Record<string, unknown>[];
  };
  const protocols: SnapshotProtocol[] = raw.protocols.map((p) => ({
    slug: String(p.slug),
    name: String(p.name),
    category:
      typeof p.category === 'string' && p.category.length > 0
        ? p.category
        : 'Unknown',
    chains: Array.isArray(p.chains)
      ? (p.chains as unknown[]).map(String)
      : [],
    tvl_usd: typeof p.tvl_usd === 'number' ? p.tvl_usd : 0,
    change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
    mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
    listed_at:
      typeof p.listed_at === 'number'
        ? p.listed_at
        : listedAtToEpoch(p.listed_at),
    gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
    symbol: typeof p.symbol === 'string' ? p.symbol : null,
  }));
  return {
    asOf: raw.as_of,
    floorUsd: raw.floor_usd,
    watchlist: [...raw.watchlist],
    protocols,
  };
}

interface AggComp {
  symbol: string;
  name: string;
  category: string;
  tvl: number;
  mcap: number;
}

/** Group live-token protocols by symbol (parent aggregation): TVL summed
 *  across sub-entries, mcap taken from the entry that carries it. */
function aggregateLive(protocols: SnapshotProtocol[]): AggComp[] {
  const bySymbol = new Map<string, SnapshotProtocol[]>();
  for (const p of protocols) {
    if (p.symbol === null) continue;
    const g = bySymbol.get(p.symbol);
    if (g) g.push(p);
    else bySymbol.set(p.symbol, [p]);
  }
  const out: AggComp[] = [];
  for (const [symbol, group] of bySymbol) {
    const withMcap = group.filter(
      (p) => p.mcap_usd !== null && p.mcap_usd > 0,
    );
    if (withMcap.length === 0) continue;
    const tvl = group.reduce((s, p) => s + p.tvl_usd, 0);
    if (tvl <= 0) continue;
    const mcap = Math.max(...withMcap.map((p) => p.mcap_usd!));
    const holder =
      withMcap.find((p) => p.mcap_usd === mcap) ?? withMcap[0]!;
    out.push({ symbol, name: holder.name, category: holder.category, tvl, mcap });
  }
  return out;
}

/** OLS fit of log(mcap) = a + b*log(tvl). Degenerate input (fewer than 2
 *  comps, or zero TVL variance) falls back to a flat 0.2x multiple so the
 *  model never produces NaN or Infinity. */
function logLogFit(comps: AggComp[]): { a: number; b: number } {
  if (comps.length < 2) return { a: Math.log(0.2), b: 1 };
  const xs = comps.map((c) => Math.log(c.tvl));
  const ys = comps.map((c) => Math.log(c.mcap));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  if (den === 0) return { a: my, b: 0 };
  const b = num / den;
  return { a: my - b * mx, b };
}

/**
 * Relative category factor from a comp set: the category median mcap/TVL,
 * shrunk toward the global median with prior weight 4, divided by the global
 * median, clamped to [0.15, 2.0]. Fewer than 2 live comps -> 1.0 (no comps).
 * Curator / allocator categories -> flat 0.5 (nested TVL, fee slice only).
 */
function categoryFactor(
  category: string,
  comps: AggComp[],
  globalMedian: number,
): number {
  if (CURATOR_CATEGORIES.has(category)) return 0.5;
  const inCat = comps.filter((c) => c.category === category);
  if (inCat.length < 2) return 1;
  const med = median(inCat.map((c) => c.mcap / c.tvl));
  const shrunk = (inCat.length * med + 4 * globalMedian) / (inCat.length + 4);
  return clamp(shrunk / globalMedian, 0.15, 2);
}

/**
 * radar-3: the category factor at half strength in log space (raw^0.5).
 * The curator 0.5x is NOT damped — it is a structural nesting discount
 * (TVL counted twice), not a fitted factor — so it stays exactly 0.5.
 * categoryMultiples keeps storing the RAW factor; damping is applied here,
 * at each use site (score() and the LOO loop).
 */
function dampedFactor(rawFactor: number, category: string): number {
  if (CURATOR_CATEGORIES.has(category)) return 0.5;
  return Math.pow(rawFactor, 0.5);
}

function ageDays(p: SnapshotProtocol, asOfMs: number): number | null {
  if (p.listed_at === null) return null;
  return Math.floor((asOfMs - p.listed_at * 1000) / 86_400_000);
}

export function buildRadar(snapshot: Snapshot): {
  board: BoardRow[];
  radar: RadarData;
} {
  const asOfMs = parseAsOf(snapshot.asOf);
  const watchlist = new Set(snapshot.watchlist);
  const preToken = snapshot.protocols.filter(isPreToken);
  const withToken = snapshot.protocols.length - preToken.length;

  // --- calibration from the snapshot's own live-token protocols ---
  const liveAgg = aggregateLive(snapshot.protocols);
  // F1: the curve is fitted on the DeFi comps only. CEX/bridge/chain
  // tokens are excluded from the calibration set (never from the board —
  // the board already excludes them as rows, and the headline LOO below
  // still evaluates on all 128 comps, so nothing is hidden).
  const calAgg = liveAgg.filter(
    (c) => !CALIBRATION_EXCLUDED_CATEGORIES.has(c.category),
  );
  const loglog = logLogFit(calAgg);
  const globalMedian = median(calAgg.map((c) => c.mcap / c.tvl));
  const categories = [...new Set(snapshot.protocols.map((p) => p.category))].sort();
  const categoryMultiples: { [cat: string]: number } = {};
  for (const cat of categories) {
    categoryMultiples[cat] = categoryFactor(cat, calAgg, globalMedian);
  }
  const sizeMultiple = (tvl: number): number =>
    Math.exp(loglog.a) * tvl ** (loglog.b - 1);

  // --- leave-one-out backtest of the fitted model (size x category x 0.6) ---
  // Each fold refits on the F1 calibration set only (the held-out comp is
  // removed first). `loo` evaluates on all 128 comps (CEX/bridges included
  // as held-out comps, so the filter cannot flatter the headline number);
  // `looCal` evaluates on the 100 calibration comps themselves. Each has a
  // robust view restricted to held-out comps with mcap >= $1M.
  const looEval = (
    evalSet: AggComp[],
  ): {
    n: number;
    mape: number;
    medianAbsLogErr: number;
    within2x: number;
    within3x: number;
    robust: { n: number; mape: number; medianAbsLogErr: number; within2x: number };
  } => {
    const errs: { ape: number; absLog: number; mcap: number }[] = [];
    for (const held of evalSet) {
      const rest = liveAgg
        .filter((c) => c !== held)
        .filter((c) => !CALIBRATION_EXCLUDED_CATEGORIES.has(c.category));
      if (rest.length < 2) continue;
      const fit = logLogFit(rest);
      const gm = median(rest.map((c) => c.mcap / c.tvl));
      const f = dampedFactor(categoryFactor(held.category, rest, gm), held.category);
      const pred =
        held.tvl * Math.exp(fit.a) * held.tvl ** (fit.b - 1) * f * STAGE_DISCOUNT;
      errs.push({
        ape: Math.abs(pred - held.mcap) / held.mcap,
        absLog: Math.abs(Math.log(pred) - Math.log(held.mcap)),
        mcap: held.mcap,
      });
    }
    const summarise = (
      es: { ape: number; absLog: number }[],
    ): { n: number; mape: number; medianAbsLogErr: number; within2x: number } => ({
      n: es.length,
      mape:
        es.length === 0 ? 0 : es.reduce((s, e) => s + e.ape, 0) / es.length,
      medianAbsLogErr:
        es.length === 0 ? 0 : median(es.map((e) => e.absLog)),
      within2x:
        es.length === 0
          ? 0
          : es.filter((e) => e.absLog <= Math.log(2)).length / es.length,
    });
    const all = summarise(errs);
    const rob = summarise(errs.filter((e) => e.mcap >= 1_000_000));
    return {
      ...all,
      within3x:
        errs.length === 0
          ? 0
          : errs.filter((e) => e.absLog <= Math.log(3)).length / errs.length,
      robust: rob,
    };
  };
  const loo = looEval(liveAgg);
  const looCal = looEval(calAgg);
  const band = clamp(Math.exp(loo.medianAbsLogErr), 1.5, 4);

  const score = (
    p: SnapshotProtocol,
  ): { base: number; factor: number; age: number | null } => {
    const age = ageDays(p, asOfMs);
    const effAge = age ?? UNKNOWN_AGE_DAYS;
    const growth =
      1 + (0.5 * clamp(p.change_7d ?? 0, -60, 120)) / 100;
    const maturity = 0.6 + (Math.min(effAge, MATURITY_DAYS) / MATURITY_DAYS) * 0.4;
    const factor = dampedFactor(categoryMultiples[p.category] ?? 1, p.category);
    // TVL <= 0 would make the size curve blow up (tvl^(b-1) with b < 1);
    // such a row can never be a real launch candidate, so floor it at $1.
    if (!(p.tvl_usd > 0)) return { base: 1, factor, age };
    // Concern haircut x0.10: a row carrying a baked verification concern
    // (parent token already trades / stablecoin product / ...) has a base
    // case of no new token, so the value shown is governance-option value
    // only. Applied AFTER the stage discount, BEFORE rounding/banding; the
    // low/bull band derives from the haircut base as usual.
    const concernHaircut = concernFor(p.slug) !== undefined ? 0.1 : 1;
    const base = Math.max(
      1,
      Math.round(
        p.tvl_usd *
          sizeMultiple(p.tvl_usd) *
          factor *
          growth *
          maturity *
          STAGE_DISCOUNT *
          concernHaircut,
      ),
    );
    return { base, factor, age };
  };

  // --- board assembly: watchlist (always) + rankable below-floor pre-token ---
  const excludedByReason = new Map<ExclusionReason, string[]>();
  const excludedProtocols: SnapshotProtocol[] = [];
  const scored: {
    p: SnapshotProtocol;
    base: number;
    factor: number;
    age: number | null;
  }[] = [];
  for (const p of snapshot.protocols) {
    if (watchlist.has(p.slug)) {
      const { base, factor, age } = score(p);
      scored.push({ p, base, factor, age });
      continue;
    }
    if (!isPreToken(p)) continue;
    const reason = exclusionReason(
      { slug: p.slug, category: p.category, tvl_usd: p.tvl_usd },
      snapshot.floorUsd,
    );
    if (reason !== null) {
      const list = excludedByReason.get(reason) ?? [];
      list.push(p.slug);
      excludedByReason.set(reason, list);
      excludedProtocols.push(p);
      continue;
    }
    if (p.tvl_usd <= 0) continue;
    const { base, factor, age } = score(p);
    scored.push({ p, base, factor, age });
  }
  // Deterministic order: implied desc, TVL desc, slug asc (breaks the rare tie).
  scored.sort(
    (x, y) =>
      y.base - x.base ||
      y.p.tvl_usd - x.p.tvl_usd ||
      (x.p.slug < y.p.slug ? -1 : 1),
  );

  const rows: RadarRow[] = scored.map(({ p, base, factor, age }, i) => {
    const plan = farmPlanFor({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      age_days: age,
      implied_base: base,
      implied_low: Math.max(1, Math.round(base / band)),
    });
    const verified = isVerified(p.slug, p.category);
    const liveInCat = liveAgg.filter((c) => c.category === p.category).length;
    const risks: string[] = [];
    if (age === null) {
      risks.push(
        'listed_at is missing in the snapshot — age assumed 365 days, so the maturity factor is a guess.',
      );
    }
    if (p.change_7d === null) {
      risks.push(
        'change_7d is missing in the snapshot — the growth factor is neutral (1.0).',
      );
    }
    if (liveInCat < 2) {
      risks.push(
        `Fewer than 2 live-token comps in ${p.category} — the category multiple falls back to the global median, so confidence is low.`,
      );
    }
    if (CURATOR_CATEGORIES.has(p.category)) {
      risks.push(
        'Vault curator / allocator: TVL is nested inside underlying protocols, so a token would capture a fee slice, not the full TVL — multiple discounted 0.5x.',
      );
    }
    const concern = concernFor(p.slug);
    if (concern !== undefined) risks.push(concern);
    if (p.tvl_usd < 10_000_000) {
      risks.push(
        'Small TVL (under $10M) — the implied value is a size-curve extrapolation, not a measured comp.',
      );
    }
    let confidence: 'high' | 'medium' | 'low';
    if (liveInCat >= 5 && age !== null && p.change_7d !== null) {
      confidence = 'high';
    } else if (liveInCat >= 2 && (age !== null || p.change_7d !== null)) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
    if (!verified && confidence === 'high') confidence = 'medium';
    if (CURATOR_CATEGORIES.has(p.category) && confidence === 'high') {
      confidence = 'medium';
    }
    const farm_verdict: 'FARM' | 'THIN' | 'SKIP' = !verified
      ? 'SKIP'
      : confidence === 'low' || CURATOR_CATEGORIES.has(p.category)
        ? 'THIN'
        : 'FARM';
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      rank: i + 1,
      implied_low: Math.max(1, Math.round(base / band)),
      implied_base: base,
      implied_bull: Math.round(base * band),
      confidence,
      watchlist: watchlist.has(p.slug),
      verified,
      multiple_used: base / p.tvl_usd,
      factor_used: factor,
      farm_steps: plan.steps,
      farm: {
        capital_usd: plan.capital_usd,
        duration: plan.duration,
        points: plan.points,
        airdrop_range: [plan.airdrop_low, plan.airdrop_high],
        pool_net_low_usd: plan.pool_net_low_usd,
        net_per_user_low_usd: plan.net_per_user_low_usd,
        breakeven_capital_usd: plan.breakeven_capital_usd,
      },
      farm_verdict,
      risks,
    };
  });

  const board: BoardRow[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_base,
    farm_steps: r.farm_steps,
  }));

  const excluded = [...excludedByReason.entries()]
    .map(([reason, slugs]) => ({
      reason: `${reason} — ${REASON_LABELS[reason]}`,
      count: slugs.length,
      examples: [...slugs].sort().slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count);

  // Calibration-chart population: the 100 F1 calibration comps as
  // [tvl, mcap, category] triples, sorted by tvl ascending — the set the
  // curve was fitted on.
  const fitPoints: [number, number, string][] = [...calAgg]
    .sort((a, b) => a.tvl - b.tvl || (a.symbol < b.symbol ? -1 : 1))
    .map((c) => [c.tvl, c.mcap, c.category]);

  // --- audit counterfactual: what the excluded rows would have scored ---
  // Same score() path as board rows (growth/maturity/stage included). No
  // concern haircut applies: none of the excluded slugs carries a baked
  // verification concern — all 8 concern slugs are watchlist rows, which
  // bypass exclusion entirely. Assert it loudly rather than silently
  // understating the counterfactual if that ever stops being true.
  const excludedConcern = excludedProtocols.filter(
    (p) => concernFor(p.slug) !== undefined,
  );
  if (excludedConcern.length > 0) {
    throw new Error(
      `counterfactual: excluded rows carry a verification concern: ${excludedConcern
        .map((p) => p.slug)
        .join(', ')}`,
    );
  }
  const excludedScored = excludedProtocols.map((p) => ({
    p,
    base: score(p).base,
  }));
  const excludedTop = excludedScored.reduce(
    (best, cur) => (cur.base > best.base ? cur : best),
    { p: excludedProtocols[0]!, base: 0 },
  );
  const boardTop1 = rows.length > 0 ? rows[0]!.implied_base : 0;
  const boardTop10 = rows.length >= 10 ? rows[9]!.implied_base : 0;
  const counterfactual = {
    top_name: excludedTop.p.name,
    top_value_usd: excludedTop.base,
    above_top10: excludedScored.filter((s) => s.base > boardTop10).length,
    above_top1: excludedScored.filter((s) => s.base > boardTop1).length,
    excluded_tvl_usd: excludedProtocols.reduce((s, p) => s + p.tvl_usd, 0),
    board_tvl_usd: rows.reduce((s, r) => s + r.tvl_usd, 0),
    excluded_count: excludedProtocols.length,
  };

  const largeLiquid = liveAgg
    .filter((c) => c.mcap >= 50_000_000 && c.tvl >= 100_000_000)
    .sort((a, b) => b.mcap - a.mcap);
  const comps: RadarComp[] = largeLiquid.map((c) => ({
    name: c.name,
    category: c.category,
    tvl: c.tvl,
    mcap: c.mcap,
    multiple: c.mcap / c.tvl,
  }));

  const live = [...liveAgg]
    .sort((a, b) => b.mcap - a.mcap)
    .slice(0, LIVE_ROWS)
    .map((c) => ({
      name: c.name,
      category: c.category,
      tvl_usd: c.tvl,
      mcap_usd: c.mcap,
      multiple: c.mcap / c.tvl,
    }));

  const formula =
    `implied = TVL x exp(${loglog.a.toFixed(4)}) x TVL^(${(
      loglog.b - 1
    ).toFixed(4)}) x categoryFactor^0.5 x ` +
    `(1 + 0.5 x clamp(change_7d,-60,120)/100) x (0.6 + min(age,1095)/1095 x 0.4) x 0.6 x 0.10 if baked verification concern; ` +
    `log(mcap) = ${loglog.a.toFixed(4)} + ${loglog.b.toFixed(
      4,
    )} x log(tvl) fitted on ${calAgg.length} parent-aggregated DeFi comps ` +
    `(CEX, bridge and chain tokens excluded from calibration — the board ` +
    `excludes them as rows too); ` +
    `categoryFactor = shrunk category median mcap/TVL / global median ${globalMedian.toFixed(
      4,
    )}, clamped [0.15, 2.0], <2 comps -> 1.0, curators -> 0.5; ` +
    `the category factor is applied at half strength (factor^0.5) for every non-curator category, while the curator 0.5x is a structural nesting discount and stays undamped; ` +
    `rows carrying a baked verification concern (8 slugs: parent token already trades, stablecoin product, chain, or no launch mechanism visible) get an additional x0.10 haircut after the stage discount, so the value shown is governance-option value only; ` +
    `low/bull = base / x${band.toFixed(2)} (LOO median abs log error ${loo.medianAbsLogErr.toFixed(
      3,
    )}); stage discount 0.6.`;

  const radar: RadarData = {
    generated: snapshot.asOf,
    snapshotAsOf: snapshot.asOf,
    model: {
      name: MODEL_VERSION,
      formula,
      loglog: { a: loglog.a, b: loglog.b },
      categoryMultiples,
      stageDiscount: STAGE_DISCOUNT,
      loo,
      looCal,
      calibrationN: calAgg.length,
      comps,
      fitPoints,
    },
    audit: {
      total: snapshot.protocols.length,
      preToken: preToken.length,
      withToken,
      watchlist: snapshot.watchlist.length,
      boardRows: rows.length,
      excluded,
      counterfactual,
    },
    rows,
    live,
  };
  return { board, radar };
}

/** Exactly `window.RADAR = {...};\n` — key order is the fixed insertion order
 *  built in buildRadar, so two runs byte-match. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/**
 * Self-check against the gate. Returns an error string on the first failure,
 * else null. Mirrors the sealed scorer's board checks (gates 2–5).
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board has ${board.length} rows, outside the 100–4000 gate`;
  }
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let prev = Number.POSITIVE_INFINITY;
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (row.rank !== i + 1) {
      return `row ${i} has rank ${row.rank}, expected ${i + 1}`;
    }
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} has non-positive or non-integer implied_value_usd`;
    }
    if (row.implied_value_usd > 1e14) {
      return `row ${row.slug} implied_value_usd exceeds 1e14`;
    }
    if (row.implied_value_usd > prev) {
      return `implied_value_usd rises at rank ${row.rank} — board is not sorted by value`;
    }
    prev = row.implied_value_usd;
    if (row.slug.length < 1 || row.slug.length > 128 || /\s/.test(row.slug)) {
      return `row ${i} has an invalid slug`;
    }
    if (seen.has(row.slug)) return `duplicate slug ${row.slug}`;
    seen.add(row.slug);
    if (!slugs.has(row.slug)) return `slug ${row.slug} is not in the snapshot`;
    if (row.name.trim().length === 0) return `row ${row.slug} has an empty name`;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm_steps, outside 3–12`;
    }
    for (const s of row.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) {
        return `row ${row.slug} has a farm step of ${t.length} chars, outside 20–600`;
      }
    }
  }
  for (const w of snapshot.watchlist) {
    if (!seen.has(w)) return `watchlist slug ${w} is missing from the board`;
  }
  if (new Set(board.map((r) => r.implied_value_usd)).size === 1) {
    return 'all implied values are equal';
  }
  return null;
}
