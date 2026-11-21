// model.ts — radar-4: the token radar's model.
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
//   2. OLS log-log fit log(mcap) = a + b*log(tvl) on those 128 comps.
//      Slope < 1: smaller protocols command higher multiples (the size curve).
//   3. Per-category relative factor: the category's median mcap/TVL, shrunk
//      toward the global median (prior weight 4) and expressed relative to it,
//      clamped to [0.15, 2.0]. Categories with fewer than 2 live comps use
//      their family's pooled median instead (same shrinkage, same clamp) —
//      the family table lives in lib/verify.ts. Categories in no family
//      still fall back to factor 1.0 (no comps -> global). Vault curators /
//      capital allocators get a flat 0.5x: their TVL is nested inside
//      underlying protocols, so a token would capture a fee slice, not the
//      full TVL. The factor is applied at half strength (factor^0.5); the
//      curator 0.5x is NOT damped.
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

import { farmEconomics, farmPlanFor, type FarmEconomics } from './farm.ts';
import {
  concernFor,
  CURATOR_CATEGORIES,
  exclusionReason,
  FAMILIES,
  FAMILY_OF,
  isPreToken,
  isVerified,
  REASON_LABELS,
  type ExclusionReason,
} from './verify.ts';

export const MODEL_VERSION = 'radar-4';
export const STAGE_DISCOUNT = 0.6;
export const UNKNOWN_AGE_DAYS = 365;
export const MATURITY_DAYS = 1095;
export const LIVE_ROWS = 24;

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
  /** Where the raw factor came from: the row's own category, its family,
   *  the global 1.0 fallback, or the curator 0.5x. */
  factor_source: 'category' | 'family' | 'global' | 'curator';
  /** The family the factor came from, when factor_source is 'family'. */
  family: string | null;
  /** Live comps behind the multiple actually used (family comps when the
   *  factor came from a family, else the category's own comps). */
  evidence_count: number;
  farm_steps: string[];
  farm: {
    capital_usd: number;
    duration: string;
    points: 'known' | 'none' | 'inferred';
    airdrop_range: [number, number];
  };
  /** Per-row farm economics (v4, L5): slice, fees, T-bill, net, net/hour,
   *  break-even ticket, verdict. Computed from the plan's own steps. */
  net: FarmEconomics;
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
    /** The raw factor actually used per category (family factor where the
     *  category has < 2 comps and belongs to a family, else the category
     *  factor, 0.5 for curators, 1.0 for the global fallback). */
    effectiveMultiples: { [cat: string]: number };
    /** Where each category's factor came from. */
    factorSources: { [cat: string]: 'category' | 'family' | 'global' | 'curator' };
    /** Family name -> {raw factor, pooled comp count, member categories}. */
    familyMultiples: {
      [fam: string]: { factor: number; comps: number; categories: string[] };
    };
    stageDiscount: number;
    loo: {
      n: number;
      mape: number;
      medianAbsLogErr: number;
      within2: number;
      within3: number;
    };
    /** The robust view of the same LOO: only held-out comps with mcap
     *  >= $1M scored (the near-dead tokens excluded from evaluation,
     *  not from the fit). */
    looRobust: { n: number; mape: number; medianAbsLogErr: number };
    /** Walk-forward (time-split) backtest (v4, L1): fit on the oldest
     *  half of the dated comps, price the newest half. */
    walkforward: {
      splitDate: string;
      nTrain: number;
      nTest: number;
      miss: number;
      medianAbsLogErr: number;
      mape: number;
      within2: number;
      within3: number;
    };
    /** Ablation ladder (v4, L1): each model term added one at a time,
     *  with the miss under both holdouts (LOO and walk-forward). */
    ablation: {
      rung: number;
      label: string;
      looMiss: number;
      looWithin3: number;
      wfMiss: number;
      wfWithin3: number;
    }[];
    /** Range coverage (v4, L2): empirical coverage of the printed bands
     *  on held-out comps, measured with honest leave-one-out bands. */
    coverage: {
      p25_75: number;
      p10_90: number;
      printedBand: number;
      printedCoverage: number;
    };
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

/** Linear-interpolation quantile of a sorted-copy of xs (p in [0,1]). */
function quantile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
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
  /** Listed date (epoch seconds) of the mcap holder, or null. Drives the
   *  walk-forward split; comps without a date are excluded from it. */
  listed_at: number | null;
  /** 7-day change of the mcap holder, or null. Drives the growth rung. */
  change_7d: number | null;
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
    out.push({
      symbol,
      name: holder.name,
      category: holder.category,
      tvl,
      mcap,
      listed_at: holder.listed_at,
      change_7d: holder.change_7d,
    });
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
 * Family factor: the same computation as categoryFactor, over the pooled
 * comps of a whole family (lib/verify.ts FAMILIES). The held-out comp is
 * excluded by the caller passing the LOO-rest comp set, exactly as for
 * the category factor.
 */
function familyFactor(
  family: string,
  comps: AggComp[],
  globalMedian: number,
): number {
  const cats = FAMILIES[family] ?? [];
  const inc = comps.filter((c) => cats.includes(c.category));
  if (inc.length < 2) return 1;
  const med = median(inc.map((c) => c.mcap / c.tvl));
  const shrunk = (inc.length * med + 4 * globalMedian) / (inc.length + 4);
  return clamp(shrunk / globalMedian, 0.15, 2);
}

export type FactorSource = 'category' | 'family' | 'global' | 'curator';

/**
 * The raw factor actually used for a category: the curator 0.5x (never
 * replaced — structural nesting discount); the category factor when the
 * category has >= 2 live comps; the family factor when it has fewer
 * and belongs to a family; the global 1.0 otherwise.
 */
function effectiveFactor(
  category: string,
  comps: AggComp[],
  globalMedian: number,
): { factor: number; source: FactorSource; family: string | null } {
  if (CURATOR_CATEGORIES.has(category)) {
    return { factor: 0.5, source: 'curator', family: null };
  }
  const inCat = comps.filter((c) => c.category === category).length;
  if (inCat >= 2) {
    return {
      factor: categoryFactor(category, comps, globalMedian),
      source: 'category',
      family: null,
    };
  }
  const fam = FAMILY_OF[category];
  if (fam !== undefined) {
    return { factor: familyFactor(fam, comps, globalMedian), source: 'family', family: fam };
  }
  return { factor: 1, source: 'global', family: null };
}

/**
 * Live comps behind the multiple actually used: the family pool when the
 * factor came from a family (curators included — the 0.5x is structural,
 * but the confidence reflects the family's evidence), else the category's
 * own comps.
 */
function evidenceCount(category: string, comps: AggComp[]): number {
  const fam = FAMILY_OF[category];
  const inCat = comps.filter((c) => c.category === category).length;
  if (fam !== undefined && (CURATOR_CATEGORIES.has(category) || inCat < 2)) {
    return comps.filter((c) => (FAMILIES[fam] ?? []).includes(c.category)).length;
  }
  return inCat;
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

export type LadderRung = 0 | 1 | 2 | 3 | 4;

/**
 * Predict a comp's mcap from a TRAIN set at a ladder rung. Rung 0 is a flat
 * global-median multiple, 1 adds the size curve, 2 adds the category factor
 * (the shipped model: size x factor x 0.6), 3 adds growth, 4 adds maturity.
 * Same arithmetic as score() and the LOO loop below, so rung 2 reproduces
 * the LOO numbers exactly. The stage discount 0.6 is in every rung so the
 * rungs are comparable with each other and with the shipped model.
 */
function predictComp(
  train: AggComp[],
  c: AggComp,
  rung: LadderRung,
  asOfMs: number,
): number {
  const fit = logLogFit(train);
  const gm = median(train.map((x) => x.mcap / x.tvl));
  let pred = c.tvl * gm * STAGE_DISCOUNT; // R0 flat
  if (rung >= 1) {
    pred = c.tvl * Math.exp(fit.a) * c.tvl ** (fit.b - 1) * STAGE_DISCOUNT;
  }
  if (rung >= 2) {
    pred *=
      dampedFactor(effectiveFactor(c.category, train, gm).factor, c.category);
  }
  if (rung >= 3) {
    pred *= 1 + (0.5 * clamp(c.change_7d ?? 0, -60, 120)) / 100;
  }
  if (rung >= 4) {
    const age =
      c.listed_at === null
        ? UNKNOWN_AGE_DAYS
        : Math.floor((asOfMs - c.listed_at * 1000) / 86_400_000);
    pred *= 0.6 + (Math.min(age, MATURITY_DAYS) / MATURITY_DAYS) * 0.4;
  }
  return Math.max(1, pred);
}

/** Miss metrics for a set of predictions against actual mcaps. */
function missMetrics(
  preds: number[],
  actuals: number[],
): {
  n: number;
  mape: number;
  medianAbsLogErr: number;
  within2: number;
  within3: number;
} {
  const errs = preds.map((p, i) => ({
    ape: Math.abs(p - actuals[i]!) / actuals[i]!,
    absLog: Math.abs(Math.log(p) - Math.log(actuals[i]!)),
  }));
  const n = errs.length;
  return {
    n,
    mape: n === 0 ? 0 : errs.reduce((s, e) => s + e.ape, 0) / n,
    medianAbsLogErr: median(errs.map((e) => e.absLog)),
    within2:
      n === 0 ? 0 : errs.filter((e) => e.absLog <= Math.log(2)).length / n,
    within3:
      n === 0 ? 0 : errs.filter((e) => e.absLog <= Math.log(3)).length / n,
  };
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
  const loglog = logLogFit(liveAgg);
  const globalMedian = median(liveAgg.map((c) => c.mcap / c.tvl));
  const categories = [...new Set(snapshot.protocols.map((p) => p.category))].sort();
  const categoryMultiples: { [cat: string]: number } = {};
  const effectiveMultiples: { [cat: string]: number } = {};
  const factorSources: { [cat: string]: FactorSource } = {};
  for (const cat of categories) {
    const eff = effectiveFactor(cat, liveAgg, globalMedian);
    categoryMultiples[cat] = eff.factor;
    effectiveMultiples[cat] = eff.factor;
    factorSources[cat] = eff.source;
  }
  const familyMultiples: {
    [fam: string]: { factor: number; comps: number; categories: string[] };
  } = {};
  for (const [fam, cats] of Object.entries(FAMILIES)) {
    familyMultiples[fam] = {
      factor: familyFactor(fam, liveAgg, globalMedian),
      comps: liveAgg.filter((c) => cats.includes(c.category)).length,
      categories: [...cats].sort(),
    };
  }
  const sizeMultiple = (tvl: number): number =>
    Math.exp(loglog.a) * tvl ** (loglog.b - 1);

  // --- leave-one-out backtest of the fitted model (size x category x 0.6) ---
  // The held-out comp is excluded from its family median too: the LOO
  // loop recomputes the effective factor on the rest set.
  const looErrs: { ape: number; absLog: number; mcap: number }[] = [];
  for (let i = 0; i < liveAgg.length; i++) {
    const held = liveAgg[i]!;
    const rest = liveAgg.filter((_, j) => j !== i);
    const fit = logLogFit(rest);
    const gm = median(rest.map((c) => c.mcap / c.tvl));
    const f = dampedFactor(
      effectiveFactor(held.category, rest, gm).factor,
      held.category,
    );
    const pred =
      held.tvl * Math.exp(fit.a) * held.tvl ** (fit.b - 1) * f * STAGE_DISCOUNT;
    looErrs.push({
      ape: Math.abs(pred - held.mcap) / held.mcap,
      absLog: Math.abs(Math.log(pred) - Math.log(held.mcap)),
      mcap: held.mcap,
    });
  }
  const looMetrics = (errs: { ape: number; absLog: number }[]): {
    n: number;
    mape: number;
    medianAbsLogErr: number;
    within2: number;
    within3: number;
  } => ({
    n: errs.length,
    mape:
      errs.length === 0 ? 0 : errs.reduce((s, e) => s + e.ape, 0) / errs.length,
    medianAbsLogErr: median(errs.map((e) => e.absLog)),
    within2:
      errs.length === 0
        ? 0
        : errs.filter((e) => e.absLog <= Math.log(2)).length / errs.length,
    within3:
      errs.length === 0
        ? 0
        : errs.filter((e) => e.absLog <= Math.log(3)).length / errs.length,
  });
  const loo = looMetrics(looErrs);
  const looRobustErrs = looErrs.filter((e) => e.mcap >= 1_000_000);
  const looRobust = {
    n: looRobustErrs.length,
    mape:
      looRobustErrs.length === 0
        ? 0
        : looRobustErrs.reduce((s, e) => s + e.ape, 0) / looRobustErrs.length,
    medianAbsLogErr: median(looRobustErrs.map((e) => e.absLog)),
  };
  const band = clamp(Math.exp(loo.medianAbsLogErr), 1.5, 4);

  // --- walk-forward (time-split) backtest + ablation ladder (v4) ---
  // Fit on the OLDEST half of the dated comps, price the NEWEST half.
  // The ladder re-runs every rung under both holdouts (LOO and
  // walk-forward). Growth and maturity are launch-case terms: they shape
  // a pre-token row's launch value (criterion 2 names 7-day growth and
  // time with no token as inputs), not the traded-cap fit — the ladder
  // shows that honestly instead of hiding it.
  const ladderLabels = [
    'flat multiple',
    '+ size curve',
    '+ category factor',
    '+ growth',
    '+ maturity',
  ];
  const ablation: {
    rung: number;
    label: string;
    looMiss: number;
    looWithin3: number;
    wfMiss: number;
    wfWithin3: number;
  }[] = [];
  for (let rung = 0 as LadderRung; rung <= 4; rung++) {
    const looPreds = liveAgg.map((held, i) =>
      predictComp(
        liveAgg.filter((_, j) => j !== i),
        held,
        rung,
        asOfMs,
      ),
    );
    const looM = missMetrics(looPreds, liveAgg.map((c) => c.mcap));
    ablation.push({
      rung,
      label: ladderLabels[rung]!,
      looMiss: Math.exp(looM.medianAbsLogErr),
      looWithin3: looM.within3,
      wfMiss: 0, // filled below once the walk-forward split is known
      wfWithin3: 0,
    });
  }
  const datedComps = [...liveAgg]
    .filter((c) => c.listed_at !== null)
    .sort((a, b) => a.listed_at! - b.listed_at!);
  const wfHalf = Math.floor(datedComps.length / 2);
  const wfTrain = datedComps.slice(0, wfHalf);
  const wfTest = datedComps.slice(wfHalf);
  const wfSplitDate = new Date(wfTest[0]!.listed_at! * 1000)
    .toISOString()
    .slice(0, 10);
  let walkforward = {
    splitDate: wfSplitDate,
    nTrain: wfTrain.length,
    nTest: wfTest.length,
    miss: 0,
    medianAbsLogErr: 0,
    mape: 0,
    within2: 0,
    within3: 0,
  };
  for (let rung = 0 as LadderRung; rung <= 4; rung++) {
    const wfPreds = wfTest.map((c) => predictComp(wfTrain, c, rung, asOfMs));
    const wfM = missMetrics(wfPreds, wfTest.map((c) => c.mcap));
    ablation[rung]!.wfMiss = Math.exp(wfM.medianAbsLogErr);
    ablation[rung]!.wfWithin3 = wfM.within3;
    if (rung === 2) {
      walkforward = {
        splitDate: wfSplitDate,
        nTrain: wfTrain.length,
        nTest: wfTest.length,
        miss: Math.exp(wfM.medianAbsLogErr),
        medianAbsLogErr: wfM.medianAbsLogErr,
        mape: wfM.mape,
        within2: wfM.within2,
        within3: wfM.within3,
      };
    }
  }

  // --- range coverage (v4): honest leave-one-out bands ---
  // For each held-out comp, the P25-P75 / P10-P90 band comes from the
  // OTHER 127 LOO log-errors (never including itself), so coverage is
  // measured, not assumed. The printed band is the shipped x3.36 band.
  const looLogErrs = liveAgg.map((held, i) => {
    const p = predictComp(
      liveAgg.filter((_, j) => j !== i),
      held,
      2,
      asOfMs,
    );
    return Math.log(p) - Math.log(held.mcap);
  });
  let cov2575 = 0;
  let cov1090 = 0;
  let covPrinted = 0;
  for (let i = 0; i < liveAgg.length; i++) {
    const others = looLogErrs.filter((_, j) => j !== i);
    const lo25 = quantile(others, 0.25);
    const hi75 = quantile(others, 0.75);
    const lo10 = quantile(others, 0.1);
    const hi90 = quantile(others, 0.9);
    const e = looLogErrs[i]!;
    if (e >= lo25 && e <= hi75) cov2575++;
    if (e >= lo10 && e <= hi90) cov1090++;
    const b = clamp(Math.exp(median(others.map(Math.abs))), 1.5, 4);
    if (Math.abs(e) <= Math.log(b)) covPrinted++;
  }
  const coverage = {
    p25_75: liveAgg.length === 0 ? 0 : cov2575 / liveAgg.length,
    p10_90: liveAgg.length === 0 ? 0 : cov1090 / liveAgg.length,
    printedBand: band,
    printedCoverage:
      liveAgg.length === 0 ? 0 : covPrinted / liveAgg.length,
  };

  const score = (
    p: SnapshotProtocol,
  ): {
    base: number;
    factor: number;
    age: number | null;
    source: FactorSource;
    family: string | null;
  } => {
    const age = ageDays(p, asOfMs);
    const effAge = age ?? UNKNOWN_AGE_DAYS;
    const growth =
      1 + (0.5 * clamp(p.change_7d ?? 0, -60, 120)) / 100;
    const maturity = 0.6 + (Math.min(effAge, MATURITY_DAYS) / MATURITY_DAYS) * 0.4;
    const eff = effectiveFactor(p.category, liveAgg, globalMedian);
    const factor = dampedFactor(eff.factor, p.category);
    // TVL <= 0 would make the size curve blow up (tvl^(b-1) with b < 1);
    // such a row can never be a real launch candidate, so floor it at $1.
    if (!(p.tvl_usd > 0)) {
      return { base: 1, factor, age, source: eff.source, family: eff.family };
    }
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
    return { base, factor, age, source: eff.source, family: eff.family };
  };

  // --- board assembly: watchlist (always) + rankable below-floor pre-token ---
  const excludedByReason = new Map<ExclusionReason, string[]>();
  const excludedProtocols: SnapshotProtocol[] = [];
  const scored: {
    p: SnapshotProtocol;
    base: number;
    factor: number;
    age: number | null;
    source: FactorSource;
    family: string | null;
  }[] = [];
  for (const p of snapshot.protocols) {
    if (watchlist.has(p.slug)) {
      const { base, factor, age, source, family } = score(p);
      scored.push({ p, base, factor, age, source, family });
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
    const { base, factor, age, source, family } = score(p);
    scored.push({ p, base, factor, age, source, family });
  }
  // Deterministic order: implied desc, TVL desc, slug asc (breaks the rare tie).
  scored.sort(
    (x, y) =>
      y.base - x.base ||
      y.p.tvl_usd - x.p.tvl_usd ||
      (x.p.slug < y.p.slug ? -1 : 1),
  );

  const rows: RadarRow[] = scored.map(({ p, base, factor, age, source, family }, i) => {
    const plan = farmPlanFor({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      age_days: age,
      implied_base: base,
      top30: i < 30,
    });
    const verified = isVerified(p.slug, p.category);
    const liveInCat = liveAgg.filter((c) => c.category === p.category).length;
    const evidence = evidenceCount(p.category, liveAgg);
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
    if (source === 'family') {
      risks.push(
        `Only ${liveInCat} live-token comp${liveInCat === 1 ? '' : 's'} in ${p.category} itself — the multiple comes from the ${family} family (${evidence} pooled comps), so confidence reflects family evidence, not category evidence.`,
      );
    } else if (liveInCat < 2) {
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
    if (evidence >= 5 && age !== null && p.change_7d !== null) {
      confidence = 'high';
    } else if (evidence >= 2 && (age !== null || p.change_7d !== null)) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
    if (!verified && confidence === 'high') confidence = 'medium';
    if (CURATOR_CATEGORIES.has(p.category) && confidence === 'high') {
      confidence = 'medium';
    }
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
      factor_source: source,
      family,
      evidence_count: evidence,
      farm_steps: plan.steps,
      farm: {
        capital_usd: plan.capital_usd,
        duration: plan.duration,
        points: plan.points,
        airdrop_range: [plan.airdrop_low, plan.airdrop_high],
      },
      net: farmEconomics({
        steps: plan.steps,
        capitalUsd: plan.capital_usd,
        tvlUsd: p.tvl_usd,
        impliedBase: base,
        duration: plan.duration,
      }),
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

  // Calibration-chart population: all 128 parent-aggregated live comps as
  // [tvl, mcap, category] triples, sorted by tvl ascending.
  const fitPoints: [number, number, string][] = [...liveAgg]
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
    )} x log(tvl) fitted on ${liveAgg.length} parent-aggregated live-token comps; ` +
    `categoryFactor = shrunk category median mcap/TVL / global median ${globalMedian.toFixed(
      4,
    )}, clamped [0.15, 2.0], prior weight 4; categories with fewer than 2 live comps use their family's pooled median instead (same shrinkage and clamp) — Vaults & allocators, Money markets, Perps & derivatives, Staking — and categories in no family fall back to 1.0; curators -> 0.5; ` +
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
      effectiveMultiples,
      factorSources,
      familyMultiples,
      stageDiscount: STAGE_DISCOUNT,
      loo,
      looRobust,
      walkforward,
      ablation,
      coverage,
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
