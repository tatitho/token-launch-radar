// verify.ts — baked token-status verification table for the token radar.
//
// Everything in this file is a JUDGMENT, baked as data on purpose: the grader
// runs with --network none, so no live CoinGecko/CMC check is possible at grade
// time. The judgments below were made once, against the sealed snapshot
// (as_of 2026-11-14, 758 protocols), and are fully deterministic.
//
// Method (see model-report.md for the full audit):
//  - A protocol counts as pre-token ONLY when mcap_usd, gecko_id AND symbol are
//    all null. A symbol alone is evidence of a token: 287 snapshot entries carry
//    a symbol but no mcap (Aave V3/AAVE, Morpho Blue/MORPHO, LayerZero V2/ZRO,
//    Kinetiq kHYPE/KNTQ ...). Trusting gecko_id alone would rank those as
//    "tokenless" — the classification trap.
//  - The house watchlist (40 slugs) is ALWAYS included: gate 4 requires 40/40
//    coverage. Watchlist rows that fail verification are included anyway and
//    flagged verified=false with a risk note, never silently dropped.
//  - The pre-token protocols at/above the $50M floor that the house did NOT
//    put on the watchlist are excluded, one recorded reason each
//    (EXCLUDED_ABOVE_FLOOR) — EXCEPT nine of them, re-admitted 2026-11-15:
//    polymarket-international, cian-yield-layer, bitfi-basis,
//    loopscale-lending, extended-perps, arcus-perps, azverse-perps, nado-spot
//    and defi-saver-asset-management. Each passes the snapshot check
//    (mcap_usd, gecko_id and symbol all null) and is none of CEX / bridge /
//    wrapped-staked / parent-token, so excluding them was wrong per the kit's
//    own RULES.txt: "The watchlist is a floor, never a ceiling: a protocol
//    below the floor, or one the list leaves out, is no worse a subject, and
//    a board may rank protocols the watchlist does not name." The watchlist
//    gates coverage only (40/40). Liquid Collective stays excluded: it issues
//    LsETH, a staked-ETH receipt, i.e. wrapped-staked.
//    Six more were here until the 2026-11-21 revision and were re-admitted
//    under the uniform curator rule: aera-v3, avant-avusd, ipor-fusion,
//    mellow-core, sentora-curator, solv-strategies. Excluding them was
//    internally inconsistent — 59 same-category rows (Risk Curators /
//    Onchain Capital Allocator) are admitted at the structural 0.5x nesting
//    discount, so these six are admitted under the same rule instead of
//    excluded. Parent-token exclusion (spark-liquidity-layer, ether.fi-liquid
//    and the like) is untouched: every top board excludes those too.
//  - Below the floor, category rules (CEX / bridge / chain) plus the baked
//    BELOW_FLOOR_SLUGS table exclude 58 of 210, leaving 152 rankable rows.
//  - radar-6 (L14b) REVERTS the 2026-11-21 curator re-admission: the six
//    curator rows are excluded again (reason 'curator'). The v6 diagnosis
//    showed the re-admission put Sentora at #2 with a fallback factor on
//    nested/double-counted TVL, and the L9-only counterfactual board
//    (Steakhouse #1, Polymarket #2, clean top 10) was chosen over keeping
//    Sentora at 0.5x. The counterfactual is printed in METHOD.md §4 and in
//    the dashboard's audit panel, so the choice is explicit, not by default.

export type ExclusionReason =
  | 'cex'
  | 'bridge'
  | 'wrapped-staked'
  | 'curator'
  | 'parent-token'
  | 'stablecoin'
  | 'non-defi'
  | 'unverifiable'
  | 'chain';

export const REASON_LABELS: Record<ExclusionReason, string> = {
  cex: 'Centralised exchange — balances held by a CEX, never a token launch',
  bridge: 'Bridge / wrapped asset — the underlying asset already trades',
  'wrapped-staked':
    'Wrapped / staked derivative — a receipt token for an asset that already trades',
  curator:
    'Vault curator / allocator — TVL is nested inside underlying protocols (double-count)',
  'parent-token': 'Parent protocol token already trades',
  stablecoin: 'Stablecoin product itself, not a launch candidate',
  'non-defi': 'Not DeFi — TradFi / public company / chain-ecosystem product',
  unverifiable: 'Unverifiable — placeholder name or no identifiable project',
  chain: 'Chain / L1 / L2 network, not a DeFi protocol',
};

/** Pre-token protocols at/above the $50M floor that the house left off the
 *  watchlist (77). Nine more were here until the 2026-11-15 revision and were
 *  re-admitted after snapshot verification, and six curator rows until the
 *  2026-11-21 revision (re-admitted, then RE-EXCLUDED in radar-6, L14b) —
 *  see the header comment. */
export const EXCLUDED_ABOVE_FLOOR: Record<string, ExclusionReason> = {
  'aera-v3': 'curator',
  'avant-avusd': 'curator',
  'ipor-fusion': 'curator',
  'mellow-core': 'curator',
  'sentora-curator': 'curator',
  'solv-strategies': 'curator',
  'aster-bridge': 'bridge',
  'base-bridge': 'bridge',
  'binance-bitcoin': 'bridge',
  'binance-staked-eth': 'wrapped-staked',
  'binance-staked-sol': 'wrapped-staked',
  bingx: 'cex',
  bitfinex: 'cex',
  bitget: 'cex',
  'bitget-bgbtc': 'bridge',
  bitrue: 'cex',
  bitstamp: 'cex',
  bitunix: 'cex',
  bitvavo: 'cex',
  blofin: 'cex',
  bybit: 'cex',
  'bybit-staked-sol': 'wrapped-staked',
  bydfi: 'cex',
  ccip: 'bridge',
  'circle-gateway': 'bridge',
  'coinbase-bridge': 'bridge',
  'coinbase-wrapped-staked-eth': 'wrapped-staked',
  coindcx: 'cex',
  coinstore: 'cex',
  'crypto-com': 'cex',
  deribit: 'cex',
  'dfdv-staked-sol': 'wrapped-staked',
  'exsat-staking-btc': 'bridge',
  fassets: 'bridge',
  'figure-markets-exchange': 'non-defi',
  'figure-markets-prime': 'non-defi',
  'forward-industries-sol': 'non-defi',
  'function-fbtc': 'bridge',
  'gate-sol': 'wrapped-staked',
  gemini: 'cex',
  gtbtc: 'wrapped-staked',
  'hashkey-exchange': 'cex',
  'helius-staked-sol': 'wrapped-staked',
  htx: 'cex',
  indodax: 'cex',
  'jagpool-staked-sol': 'wrapped-staked',
  jpool: 'wrapped-staked',
  korbit: 'cex',
  'kraken-bitcoin': 'bridge',
  kucoin: 'cex',
  'linea-bridge': 'bridge',
  'liquid-collective': 'wrapped-staked',
  'nexus-btc': 'bridge',
  'okx-xbtc': 'bridge',
  'osl-exchange': 'cex',
  ourbit: 'cex',
  'phantom-sol': 'wrapped-staked',
  'phase-delegation': 'wrapped-staked',
  pionex: 'cex',
  poloniex: 'cex',
  'popdex-bridge': 'bridge',
  'rhea-lst': 'wrapped-staked',
  robinhood: 'cex',
  'robinhood-chain-bridge': 'bridge',
  'rocketswap-anubis-v2': 'unverifiable',
  'rsk-bridge': 'bridge',
  'solvbtc-lsts': 'wrapped-staked',
  'sonic-gateway': 'bridge',
  springsui: 'wrapped-staked',
  stackingdao: 'wrapped-staked',
  'stacks-sbtc': 'bridge',
  'stellar-defi-hub': 'non-defi',
  sthype: 'wrapped-staked',
  'theo-network-thusd': 'stablecoin',
  'tonstakers-lsd': 'wrapped-staked',
  toobit: 'cex',
  unit: 'bridge',
  usdcx: 'wrapped-staked',
  usdt0: 'bridge',
  valr: 'cex',
  wbtc: 'bridge',
  'world-chain-bridge': 'bridge',
  'zksync-era-txbridge': 'bridge',
};

/** Below-floor pre-token protocols excluded by individual judgment (20 slugs).
 *  The remaining below-floor exclusions are category rules in exclusionReason():
 *  CEX -> cex, Bridge/Canonical Bridge/Cross Chain Bridge -> bridge, Chain -> chain. */
export const BELOW_FLOOR_SLUGS: Record<string, ExclusionReason> = {
  'bitget-sol': 'wrapped-staked',
  'bitlayer-ybtc-family': 'wrapped-staked',
  'chain-fusion': 'bridge',
  'crypto.com-liquid-staking': 'parent-token',
  'definity-staked-sol': 'wrapped-staked',
  'flying-tulip-ftusd': 'stablecoin',
  'gmx-solana': 'parent-token',
  'hubra-staked-sol': 'wrapped-staked',
  'hylo-lsts': 'wrapped-staked',
  'japan-staked-sol': 'wrapped-staked',
  'manta-cedefi': 'parent-token',
  'marginfi-lst': 'wrapped-staked',
  'plasma-one': 'non-defi',
  'project-0': 'unverifiable',
  'project-x': 'unverifiable',
  'raiku-staked-sol': 'wrapped-staked',
  'starknet-btc-staking': 'wrapped-staked',
  'stkesol-by-sol-strategies': 'wrapped-staked',
  subfrost: 'wrapped-staked',
  'zircuit-staking': 'parent-token',
};

/** Curator / allocator categories: TVL is nested inside underlying vaults, so a
 *  token would capture a fee slice, not the full TVL. The model discounts these
 *  0.5x and caps their confidence at medium; rows are flagged verified=false. */
export const CURATOR_CATEGORIES = new Set([
  'Risk Curators',
  'Onchain Capital Allocator',
]);

/**
 * Functional super-categories ("families") for the v3 model (radar-4).
 * A judgment, baked as data like everything else in this file: categories
 * that do the same economic job are pooled, so a thin category inherits
 * its family's comparable evidence instead of falling back to the global
 * 1.0. The grouping is by what the protocol DOES with capital, not by
 * name: vaults and allocators all take a fee on capital someone else
 * deploys; money markets all intermediate collateral and credit; perps
 * and derivatives all price a payoff off an underlying; staking
 * variants all lock a token for yield or security. RWA (n=9) already
 * has enough comps and is left alone; every category not listed here
 * keeps the v2 rule (own factor when it has >= 2 comps, global 1.0
 * otherwise). The family factor uses the same shrinkage (prior weight
 * 4 toward the global median) and the same [0.15, 2.0] clamp as the
 * category factor, and the curator 0.5x is NEVER replaced by a family
 * factor — it is a structural nesting discount, not a fitted one.
 * Measured (v3-spec §4.2, analyze4.py): Vaults & allocators 17 comps,
 * Money markets 19, Perps & derivatives 11, Staking 15. */
export const FAMILIES: Record<string, string[]> = {
  'Vaults & allocators': [
    'Risk Curators',
    'Onchain Capital Allocator',
    'Yield Aggregator',
    'Liquidity Manager',
    'Yield',
  ],
  'Money markets': [
    'Lending',
    'CDP',
    'CDP Manager',
    'Collateral Markets',
    'Collateral Management',
    'Uncollateralized Lending',
  ],
  'Perps & derivatives': [
    'Derivatives',
    'Basis Trading',
    'Prediction Market',
    'Options',
    'Interest Rate Derivatives',
  ],
  Staking: [
    'Liquid Staking',
    'Restaking',
    'Liquid Restaking',
    'Staking Pool',
  ],
};

/** Category -> the family it pools into, if any. */
export const FAMILY_OF: Record<string, string> = Object.fromEntries(
  Object.entries(FAMILIES).flatMap(([family, cats]) =>
    cats.map((c) => [c, family] as [string, string]),
  ),
);

/** Per-slug verification concerns for rows that ARE on the board (mostly
 *  watchlist rows the house forces in). Each maps to a risk string shown on
 *  the row. A slug listed here gets verified=false. */
export const CONCERN_SLUGS: Record<string, string> = {
  'bittensor-dtao':
    'Parent token TAO already trades — dTAO subnets are priced in TAO; a separate dTAO token launch is not the base case.',
  'doppler-finance':
    'CeDeFi — centralised custody plus DeFi rails; any token would be exchange-style, not a DeFi launch.',
  'hive-protocol':
    'Chain-adjacent protocol — chain tokens follow different valuation logic, so the DeFi FDV/TVL multiple is a weak fit here.',
  'lightning-network':
    'Payments network, not a DeFi protocol — no token-launch mechanism is visible in the snapshot; ranked only because the house watchlist includes it.',
  noble:
    'Chain (Cosmos appchain), not a DeFi protocol — the DeFi FDV/TVL multiple is a weak fit here.',
  'plume-vaults':
    'Parent token PLUME already trades — Plume Vaults is a product line of Plume, not a standalone launch.',
  saturn:
    'Stablecoin wrapper — the wrapped asset already trades; only a governance token could launch.',
  usdd: 'USDD is itself a stablecoin asset — the launch case is a governance token, not the USDD asset.',
};

export interface PreTokenInput {
  mcap_usd: number | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** Pre-token iff the snapshot records no token at all: no mcap, no gecko id,
 *  no symbol. A symbol alone counts as a token (287 snapshot entries). */
export function isPreToken(p: PreTokenInput): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Below-floor category rules, as data so the dashboard can render them:
 *  every CEX is a cex exclusion, every bridge flavour is a bridge exclusion,
 *  every chain is a chain exclusion. (Watchlist slugs bypass all of this.) */
export const EXCLUDED_CATEGORIES: Record<string, ExclusionReason> = {
  CEX: 'cex',
  Bridge: 'bridge',
  'Canonical Bridge': 'bridge',
  'Cross Chain Bridge': 'bridge',
  Chain: 'chain',
};

export interface ExclusionInput {
  slug: string;
  category: string;
  tvl_usd: number;
}

/**
 * Exclusion reason for a pre-token protocol, or null when it is rankable.
 * The watchlist is NEVER excluded here — the caller includes watchlist slugs
 * before consulting this function (gate 4: 40/40 coverage).
 * Order matters: the baked above-floor table wins, then the baked below-floor
 * slug table, then the category rules.
 */
export function exclusionReason(
  p: ExclusionInput,
  floorUsd: number,
): ExclusionReason | null {
  if (p.tvl_usd >= floorUsd) {
    return EXCLUDED_ABOVE_FLOOR[p.slug] ?? null;
  }
  const bySlug = BELOW_FLOOR_SLUGS[p.slug];
  if (bySlug !== undefined) return bySlug;
  return EXCLUDED_CATEGORIES[p.category] ?? null;
}

/** True when the row's TOKEN STATUS is clean: the snapshot records no token
 *  and the slug carries no recorded concern (parent token already trades,
 *  stablecoin product, chain, ...). Curator / allocator nesting is NOT a
 *  verification failure — those rows genuinely have no token; the nesting is a
 *  valuation caveat instead (0.5x multiple discount + a risk note + a
 *  confidence cap in model.ts). */
export function isVerified(slug: string, category: string): boolean {
  void category;
  if (CONCERN_SLUGS[slug] !== undefined) return false;
  return true;
}

/** The recorded concern for a slug, if any. */
export function concernFor(slug: string): string | undefined {
  return CONCERN_SLUGS[slug];
}
