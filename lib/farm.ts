// farm.ts — farm-plan generator for the token radar.
//
// Honesty rule, enforced by construction: NO points program is ever invented.
// The sealed snapshot contains no points data, so points status is "known" for
// NO row. Categories where points-style farming is the norm (restaking, yield
// vaults) get "inferred" with conditional wording — "if a season opens, ...;
// verify on the project's own channels first" — and every other row gets
// "none" with the explicit line "no points program is confirmed in the sealed
// snapshot — farm by usage, not by chasing a program that may not exist".
// The farmer-facing number is always a range: implied FDV x 5-25% community
// share, with the disclaimer that points outstanding are unknown, so no
// per-user value can be computed honestly.
//
// v2 farm-step standard (§4.2): every step is 150–450 chars and carries at
// least one of (C) cost ($ / budget / gas / fee / APY) or (D) duration
// (N–M days/weeks/months, weekly, daily, "for the first/full week/window");
// step 1 carries both; the plan as a whole has ≥60% of steps carrying both.
// The disclaimer step carries the plan's own capital and duration by
// reference; the exit step carries a trigger plus the holding window.
// Every override below uses the row's own capital (capitalFor) and window
// (durationFor) — no hardcoded capital or duration anywhere in a step.

export type PointsStatus = 'known' | 'none' | 'inferred';

export interface RowFacts {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  age_days: number | null;
  implied_base: number;
  /** True for the board's top 30 rows: those plans carry 7 steps. */
  top30: boolean;
}

export interface FarmPlan {
  steps: string[];
  capital_usd: number;
  duration: string;
  points: PointsStatus;
  airdrop_low: number;
  airdrop_high: number;
}

/** Categories where points-style farming is the established norm, so a
 *  conditional (never asserted) points framing is honest. Everywhere else the
 *  plan says plainly that no program is confirmed. */
const POINTS_NORM_CATEGORIES = new Set([
  'Restaking',
  'Liquid Restaking',
  'Yield',
  'Yield Aggregator',
  'Farm',
  'Liquidity Manager',
]);

export function pointsStatus(category: string): PointsStatus {
  return POINTS_NORM_CATEGORIES.has(category) ? 'inferred' : 'none';
}

/** Sensible minimum capital, by TVL tier: big protocols need a bigger ticket
 *  for the position to be worth the gas and the dilution. */
export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 500_000_000) return 500;
  if (tvlUsd >= 100_000_000) return 250;
  if (tvlUsd >= 25_000_000) return 100;
  return 50;
}

/** Holding window, by protocol age (unknown age = 365d, disclosed on the row). */
export function durationFor(ageDays: number | null): string {
  const age = ageDays ?? 365;
  if (age >= 730) return '60–90 days';
  if (age >= 365) return '30–60 days';
  return '14–30 days';
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

function firstChain(f: RowFacts): string {
  return f.chains.length > 0 ? f.chains[0]! : 'its main chain';
}

/** The core action for the row's category — what the capital actually does.
 *  Every branch carries the row's own capital and holding window, so the
 *  step always states both a cost and a duration. */
function coreAction(f: RowFacts): string {
  const chain = firstChain(f);
  const cap = money(capitalFor(f.tvl_usd));
  const dur = durationFor(f.age_days);
  switch (f.category) {
    case 'Lending':
    case 'Uncollateralized Lending':
      return `Supply ${cap} of a blue-chip asset to ${f.name}'s lending market on ${chain} and leave it supplied for the full ${dur} window — budget $5–15 in gas for the deposit, and lending usage, not a one-off deposit, is what a future allocation would weight.`;
    case 'Dexs':
      return `Provide ${cap} of liquidity to ${f.name}'s highest-fee pool on ${chain} in a tight, actively managed range — budget $10–20 in gas and fees — hold it for the full ${dur} window, and route at least one swap a week through the pool so the position reads as usage, not parked capital.`;
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaking':
    case 'Staking Pool':
      return `Stake ${cap} through ${f.name} on ${chain} and hold the receipt token for the full ${dur} window — budget $5–15 in gas for the stake, and restaking value accrues on time-weighted balance, so withdrawing early resets the clock.`;
    case 'RWA':
      return `Deposit ${cap} into ${f.name}'s tokenised-asset vault on ${chain} and hold the receipt token for the full ${dur} window — budget $10–20 in gas for the deposit, and RWA allocations weight real deposited balance and holding duration.`;
    case 'Yield':
    case 'Yield Aggregator':
      return `Deposit ${cap} into ${f.name}'s auto-compounding vault on ${chain} and let it compound for the full ${dur} window — budget $10–20 in gas for the deposit, and vault points, where they exist, are time-weighted, so an early exit resets the clock.`;
    case 'Derivatives':
    case 'Basis Trading':
      return `Open a ${cap} delta-neutral basis position via ${f.name} on ${chain} (long spot, short the perp) and hold it for the full ${dur} window through at least one funding cycle — budget $10–25 in gas and funding fees, and basis volume is the usage this category rewards.`;
    case 'CDP':
      return `Lock ${cap} of collateral in ${f.name} on ${chain}, mint the stablecoin at a conservative 40–50% loan-to-value, and hold the position for the full ${dur} window — budget $10–20 in gas for the mint, and CDP usage is measured by minted supply held over time.`;
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return `Deposit ${cap} into a ${f.name} curated vault on ${chain} and hold it for the full ${dur} window — budget $10–25 in gas for the deposit — and check the curator's allocation report weekly, since you are farming the curator's fee share and the vault's underlying mix is the position.`;
    case 'Prediction Market':
      return `Trade ${cap} across at least three live event markets on ${f.name} over the full ${dur} window — budget $5–15 in gas and fees — and leave some outcome shares open to expiry, since prediction allocations weight resolved volume, not deposits.`;
    case 'Chain':
    case 'Payments':
      return `Bridge ${cap} to ${f.name}'s network and use its native apps weekly for the full ${dur} window — budget $10–30 in bridge and gas fees — since chains reward sustained on-chain activity, and a single bridge-and-hold does not count as usage.`;
    case 'CDP Manager':
      return `Open a ${cap} managed CDP position through ${f.name} on ${chain} at 40–50% loan-to-value and hold it for the full ${dur} window — budget $10–25 in gas for the setup — since manager fees and position duration are the measurable usage here.`;
    default:
      return `Deposit ${cap} into ${f.name}'s core product on ${chain} and use it weekly for the full ${dur} window — budget $5–20 in gas and fees for the first transactions — since sustained usage, not a single deposit, is what any future allocation would weight.`;
  }
}

/** The generic (templated) plan: built from real per-row facts only — name,
 *  first chain, category, TVL tier, age. Six steps, every one carrying the
 *  row's own capital and/or holding window. */
function templateSteps(f: RowFacts): string[] {
  const cap = money(capitalFor(f.tvl_usd));
  const dur = durationFor(f.age_days);
  const chain = firstChain(f);
  const pts = pointsStatus(f.category);
  const pointsStep =
    pts === 'inferred'
      ? `Points-style farming is the norm for ${f.category}, so if ${f.name} opens a season, deposits made before the season's snapshot are the ones that usually count — on a ${cap} position held ${dur}, verify the program on the project's own channels first and budget $5–15 in gas before adding capital; no program is confirmed in the sealed snapshot.`
      : `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; if a season opens later, positions open before the announcement are the ones that usually count, so keep the ${cap} working weekly.`;
  return [
    `Open ${f.name} on ${chain} with ${cap} plus $5–25 in gas for the first transactions, and hold the position for the full ${dur} window — use a fresh wallet so the position's history is clean and auditable, and keep a $10 gas reserve for the exit.`,
    coreAction(f),
    `Hold the position for the full ${dur} window without withdrawing — time-weighted balances are what allocations reward, so an early exit resets the clock and the usage history, and re-check the position's fee and APY weekly while the ${cap} is deployed.`,
    pointsStep,
    `Check the position weekly for TVL growth, yield changes and any token announcement over the ${dur} window; if your share of TVL falls while total TVL rises, top up ${cap} or accept the dilution — the expected airdrop value is ${money(
      Math.round(f.implied_base * 0.05),
    )}–${money(Math.round(f.implied_base * 0.25))} at a 5–25% community share of the ${money(
      f.implied_base,
    )} implied FDV, and points outstanding are unknown, so no per-user value can be promised.`,
    `Record every transaction hash and screenshot the dashboard at entry; exit only after a token announcement, or when the position's implied value per dollar falls below your entry cost — make the call inside the ${dur} window and budget $5–15 in gas for the withdrawal.`,
  ];
}

/** Curated overrides for the highest-ranked watchlist rows. Each override is
 *  written for that protocol's actual mechanics (category + chains + TVL tier),
 *  with the row's own capital and holding window in every step. No override
 *  claims a points program that the snapshot does not show. */
const OVERRIDES: Record<string, (f: RowFacts) => string[]> = {
  usdd: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Open ${f.name} on ${chain} with ${cap} and mint USDD at 40–50% loan-to-value against TRX or another approved collateral — budget $5–15 in gas for the mint — and hold the position for the full ${dur} window.`,
      `Hold the minted USDD rather than selling it: on a ${cap} mint held ${dur}, CDP allocations weight minted supply held over time, and USDD is itself the stablecoin, so the launch case is a governance token, not the asset — budget $5–10 in gas for any later top-up.`,
      `Check the collateral ratio weekly over the ${dur} window and top it up if it drifts under 150% — budget $5–10 in gas per top-up, since a liquidation wipes the ${cap} position and any usage history with it.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; if a governance-token season opens, positions open before the announcement are the ones that usually count.`,
      `Record the mint transaction hash and the collateral-ratio history; exit only by repaying the mint and withdrawing collateral after a token announcement, or when the implied value per dollar falls below your entry cost — decide inside the ${dur} window and budget $5–15 in gas to unwind.`,
    ];
  },
  'steakhouse-financial': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a Steakhouse-curated Morpho vault on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; curator vaults accrue on time-weighted deposits, so an early exit resets the clock.`,
      `Read the vault's allocation report before depositing your ${cap}: Steakhouse curates Morpho vaults, so your dollars sit in underlying lending markets and the curator takes a fee slice — check the report weekly over the ${dur} window and leave if the fee eats the spread.`,
      `Compare the vault's net APY against the underlying Morpho market weekly over the ${dur} window; if the curator fee eats the spread for two weeks running, move the ${cap} to a cheaper vault rather than staying loyal to the brand.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage; if a curator-token season opens, deposits made before the announcement are the ones that usually count, so keep the position working weekly.`,
      `Screenshot the vault dashboard at deposit and monthly over the ${dur} window; exit by withdrawing to the underlying asset after a token announcement, or when the curator's fee exceeds the yield it adds — budget $10–25 in gas for the withdrawal.`,
    ];
  },
  gauntlet: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a Gauntlet-curated vault on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; Gauntlet is the largest Morpho curator, so the position is a fee-share farm on underlying lending markets.`,
      `Check Gauntlet's published risk parameters for the vault before depositing your ${cap}: its edge is risk curation, so a vault whose caps keep hitting 100% utilisation over the ${dur} window is a warning sign, not a yield win — review the caps weekly.`,
      `Track the vault's realised APY against a plain Morpho market weekly over the ${dur} window; if Gauntlet's fee exceeds the extra yield for two weeks running, rotate the ${cap} out to the underlying market and save the fee.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any season announcement are the ones that usually count.`,
      `Keep the deposit and withdrawal transaction hashes; exit by withdrawing after a token announcement, or when the curator's fee share no longer beats holding the underlying market directly — decide inside the ${dur} window and budget $10–25 in gas to exit.`,
    ];
  },
  onre: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into OnRe's tokenised reinsurance vault on ${chain} — budget $10–20 in gas — and hold it for the full ${dur} window; RWA allocations weight real deposited balance and duration, so an early exit resets the clock.`,
      `Read the vault's reinsurance exposure note first: on a ${cap} position held ${dur}, OnRe underwrites real-world risk, so the position carries insurance-cycle risk that a plain DeFi vault does not — size it as a satellite, not a core holding, and review the note weekly.`,
      `Check the vault's reported yield and capacity weekly over the ${dur} window; OnRe capacity is capped by underwriting, so a closed vault means waiting for the next tranche rather than forcing entry — budget $10–20 in gas when a tranche reopens.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count, so keep the position working.`,
      `Screenshot the deposit receipt and the vault terms; exit by redeeming after a token announcement, or when the vault's yield drops below a plain RWA money-market rate — redeem inside the ${dur} window and budget $10–20 in gas for the redemption.`,
    ];
  },
  'bittensor-dtao': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    return [
      `Buy ${cap} of TAO and stake it to a dTAO subnet on Bittensor — budget $5–15 in fees — and hold the stake for the full ${dur} window; subnet rewards accrue to stakers by emission weight over time.`,
      `Pick the subnet by its emission share and validator quality, not by name: on a ${cap} stake held ${dur}, dTAO rewards follow the subnet's weight in the root network, and weights move every tempo — re-check the weight weekly.`,
      `Re-stake rewards weekly rather than compounding daily over the ${dur} window — Bittensor fees punish small frequent transactions, and the position is time-weighted anyway, so batch the ${cap} stake's rewards into one weekly transaction.`,
      `TAO already trades, so there is no separate dTAO token to farm — on a ${cap} position held ${dur}, the upside is TAO emission yield plus any subnet-token mechanics, not a fresh launch; treat the implied value as a ceiling, not a promise, and budget $5–15 in fees for moves.`,
      `Record the stake transaction and the subnet id; unstake only after a subnet-token announcement, or when the subnet's emission share falls for two tempos in a row — decide inside the ${dur} window and budget $5–15 in fees to unstake.`,
    ];
  },
  veda: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a Veda-powered vault (for example a BoringVault) on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; Veda is vault infrastructure, so the position sits in the underlying strategy.`,
      `Read the vault's strategy sheet before depositing your ${cap}: Veda vaults run everything from plain lending to basis trades, and the risk of the vault is the risk of the strategy, not of Veda itself — re-read the sheet weekly over the ${dur} window.`,
      `Track the vault's net APY and drawdown weekly against the same strategy run directly over the ${dur} window; if Veda's fee exceeds the convenience for a month, exit the ${cap} to the underlying and save the fee.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any season announcement are the ones that usually count.`,
      `Keep the deposit receipt and the strategy sheet; exit after a token announcement, or when the vault's strategy underperforms its benchmark for 30 days — decide inside the ${dur} window and budget $10–25 in gas for the withdrawal.`,
    ];
  },
  opentrade: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into an OpenTrade tokenised Treasury vault on ${chain} — budget $10–20 in gas — and hold it for the full ${dur} window; RWA allocations weight deposited balance and duration, so an early exit resets the clock.`,
      `Confirm the vault's underlying is a short-duration Treasury product and check the redemption window: on a ${cap} position held ${dur}, OpenTrade yields track T-bills, so the farm is yield plus optionality, not a high-beta points play — verify the window weekly.`,
      `Compare the vault's net yield to a plain T-bill rate weekly over the ${dur} window; if the spread goes negative for two weeks, the ${cap} position is paying for optionality it is not delivering, and the fee is the cost of staying.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count, so keep the position working.`,
      `Screenshot the deposit and the redemption terms; redeem after a token announcement, or when the vault's yield trails T-bills for a full month — redeem inside the ${dur} window and budget $10–20 in gas for the redemption.`,
    ];
  },
  'plume-vaults': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    return [
      `Deposit ${cap} into a Plume Vault on Plume — budget $5–15 in gas — and hold it for the full ${dur} window; vaults hold tokenised real-world assets, so the position is RWA balance plus duration, and an early exit resets the clock.`,
      `PLUME already trades, so this is not a fresh-launch farm: on a ${cap} position held ${dur}, the value case is vault yield and any future vault-specific incentive, not a new token — size it as yield, not as a lottery ticket, and check the fee weekly.`,
      `Check the vault's underlying asset and lock-up weekly over the ${dur} window; RWA vaults can gate redemptions around asset maturities, so know the next redemption window before you need the ${cap} back — budget $5–15 in gas to redeem.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any incentive announcement are the ones that usually count.`,
      `Record the deposit hash and the vault's redemption schedule; exit at the next redemption window after an incentive announcement, or when the vault's yield trails a plain RWA money-market rate — decide inside the ${dur} window and budget $5–15 in gas to exit.`,
    ];
  },
  symbiotic: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} of an accepted LST into a Symbiotic vault on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; restaking rewards accrue on time-weighted deposits, so an early exit resets the clock.`,
      `Pick the vault by its operator set and slashing terms, not by headline APY: on a ${cap} position held ${dur}, Symbiotic is permissionless restaking, so a vault's operators are the risk you are actually taking — review the operator list weekly.`,
      `If a vault partner runs a points season, deposits made before the season's snapshot are the ones that usually count — on a ${cap} position held ${dur}, verify the program on the partner's own channels first and budget $10–25 in gas before adding capital; no native Symbiotic points program is confirmed in the sealed snapshot.`,
      `Monitor the vault's operator performance and any slashing events weekly over the ${dur} window; a slashing event cuts principal, not just yield, so a ${cap} position can lose capital even while the APY looks attractive.`,
      `Keep the deposit receipt and the operator list; exit by withdrawing after a token announcement, or when the vault's operators change materially for the worse — decide inside the ${dur} window and budget $10–25 in gas for the withdrawal.`,
    ];
  },
  'hive-protocol': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    return [
      `Bridge ${cap} to Hive and use its core apps weekly for the full ${dur} window — budget $10–30 in bridge and gas fees; chain-adjacent farms reward sustained activity, not a single deposit, so keep the position active.`,
      `Do not treat this as a normal DeFi farm: on a ${cap} position held ${dur}, Hive is chain-adjacent, so the token case (if any) follows chain-token logic, and the DeFi multiple on this row is a weak fit — size it small and review the fee weekly.`,
      `Use at least two different apps on the network each week over the ${dur} window so the activity reads as a real user, not a bridge-and-hold — budget $10–30 in weekly gas and fees for the ${cap} position's transactions.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; activity from before any token announcement is what usually counts.`,
      `Keep a log of weekly transactions; exit by bridging back after a token announcement, or when weekly activity costs more in fees than the position's option value — decide inside the ${dur} window and budget $10–30 in bridge fees to exit.`,
    ];
  },
  lofty: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a Lofty tokenised real-estate vault on ${chain} — budget $10–20 in gas — and hold it for the full ${dur} window; RWA allocations weight deposited balance and duration, so an early exit resets the clock.`,
      `Read the property sheet for the vault before depositing your ${cap}: Lofty vaults hold fractional real estate, so the position carries property-market and liquidity risk that a Treasury RWA does not — re-check the sheet weekly over the ${dur} window.`,
      `Check the vault's rental yield and secondary-market depth weekly over the ${dur} window; thin secondary markets mean the exit is the redemption window, not an instant swap, so budget $10–20 in gas and fees for the ${cap} redemption.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count, so keep the position working.`,
      `Screenshot the deposit and the property sheet; exit at a redemption window after a token announcement, or when the vault's yield trails a plain RWA money-market rate — decide inside the ${dur} window and budget $10–20 in gas to redeem.`,
    ];
  },
  r25: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into an R25 RWA vault on ${chain} — budget $10–20 in gas — and hold it for the full ${dur} window; RWA allocations weight deposited balance and duration, so an early exit resets the clock.`,
      `Confirm the vault's underlying asset class and redemption terms before depositing your ${cap}: R25 vaults vary by asset, and the exit is the redemption window, not an instant swap — verify the terms weekly over the ${dur} window.`,
      `Track the vault's reported yield weekly against a plain Treasury RWA over the ${dur} window; if it trails for a month, the ${cap} position is paying for optionality it is not delivering, and the fee is the cost of staying.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count, so keep the position working.`,
      `Keep the deposit receipt and the redemption schedule; exit at the next window after a token announcement, or when the vault's yield trails its benchmark for 30 days — decide inside the ${dur} window and budget $10–20 in gas to redeem.`,
    ];
  },
  'tori-finance': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Open a ${cap} delta-neutral basis position via Tori Finance on ${chain} — budget $10–25 in gas and funding — and hold it for the full ${dur} window through at least one funding cycle.`,
      `Watch the funding rate daily for the first week of the ${dur} window: basis trades earn when funding is positive and bleed when it flips negative, so a persistently negative rate is the exit signal, not a buying opportunity — check the fee daily.`,
      `Keep the hedge ratio near 1:1 and check it after every large market move over the ${dur} window; an unhedged leg turns a ${cap} basis farm into a directional bet, so re-hedge promptly and budget $10–25 in gas and fees for the rebalance.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage and funding income, not by chasing a program that may not exist; funding earned weekly is the measurable return.`,
      `Record entry prices for both legs; unwind both legs together after a token announcement, or immediately if funding stays negative for a week — decide inside the ${dur} window and budget $10–25 in gas and funding fees to unwind.`,
    ];
  },
  upshift: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into an Upshift managed vault on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; Upshift is an on-chain capital allocator, so the position sits in the manager's chosen strategies.`,
      `Read the vault's strategy allocation before depositing your ${cap}: allocator vaults can rotate between lending, basis and LP strategies, and the risk of the vault is the risk of the current mix — re-read the allocation weekly over the ${dur} window.`,
      `Track the vault's net APY and strategy changes weekly over the ${dur} window; a sudden rotation into a new strategy is a reason to re-underwrite the ${cap} position, not to ignore it, and the fee is the cost of the manager.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any season announcement are the ones that usually count.`,
      `Keep the deposit receipt and the strategy sheet; exit after a token announcement, or when the vault's net APY trails its stated benchmark for 30 days — decide inside the ${dur} window and budget $10–25 in gas for the withdrawal.`,
    ];
  },
  axis: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Open a ${cap} delta-neutral basis position via Axis on ${chain} — budget $10–25 in gas and funding — and hold it for the full ${dur} window through at least one funding cycle.`,
      `Watch the funding rate daily for the first week of the ${dur} window: basis trades earn when funding is positive and bleed when it flips negative, so a persistently negative rate is the exit signal — check the funding fee daily.`,
      `Keep the hedge ratio near 1:1 and re-check it after every large market move over the ${dur} window; an unhedged leg turns a ${cap} basis farm into a directional bet, so re-hedge promptly and budget $10–25 in gas and fees for the rebalance.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage and funding income, not by chasing a program that may not exist; funding earned weekly is the measurable return.`,
      `Record entry prices for both legs; unwind both legs together after a token announcement, or immediately if funding stays negative for a week — decide inside the ${dur} window and budget $10–25 in gas and funding fees to unwind.`,
    ];
  },
  'lightning-network': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    return [
      `Open a ${cap} Lightning channel on Bitcoin — budget $5–20 in on-chain fees — and keep it open for the full ${dur} window, routing payments weekly so the channel reads as used, not parked.`,
      `This is a payments-network position, not a DeFi farm: on a ${cap} channel held ${dur}, there is no token-launch mechanism visible in the snapshot, so treat the implied value as a ceiling and size the position for routing fees, not for an airdrop — review fees weekly.`,
      `Balance the channel both ways over the ${dur} window: a channel that only sends (or only receives) stops routing and stops earning fees, so rebalance the ${cap} channel weekly and budget $5–20 in on-chain fees for the rebalance.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm routing fees, not a program that may not exist; routing income earned weekly is the measurable return here.`,
      `Log channel opens, closes and routed volume weekly over the ${dur} window; close the channel only after a token announcement, or when routing income trails the on-chain cost of keeping it open — budget $5–20 in fees to close.`,
    ];
  },
  ember: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into an Ember RWA vault on ${chain} — budget $10–20 in gas — and hold it for the full ${dur} window; RWA allocations weight deposited balance and duration, so an early exit resets the clock.`,
      `Confirm the vault's underlying asset and redemption window before depositing your ${cap}: RWA exits run through redemption windows, not instant swaps, so verify the window weekly over the ${dur} window before you need the money.`,
      `Track the vault's reported yield weekly against a plain Treasury RWA over the ${dur} window; if it trails for a month, the ${cap} position is paying for optionality it is not delivering, and the fee is the cost of staying.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count, so keep the position working.`,
      `Keep the deposit receipt and the redemption schedule; exit at the next window after a token announcement, or when the vault's yield trails its benchmark for 30 days — decide inside the ${dur} window and budget $10–20 in gas to redeem.`,
    ];
  },
  saturn: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a Saturn stablecoin-wrapped position on ${chain} — budget $5–15 in gas — and hold it for the full ${dur} window; the wrapped asset already trades, so the launch case is a governance token only.`,
      `Check the wrap/unwrap fee and the peg before depositing your ${cap}: stablecoin wrappers earn on the spread, and a de-peg costs more than the farm can ever return — verify the peg weekly over the ${dur} window.`,
      `Monitor the peg and the wrapper's reserves weekly over the ${dur} window; a reserve shortfall is an exit signal, not a dip to buy, and unwrapping the ${cap} position costs $5–15 in gas, so act before the peg slips further.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any season announcement are the ones that usually count.`,
      `Record the wrap transaction and the peg history; unwrap after a token announcement, or immediately if the peg breaks by more than 0.5% — decide inside the ${dur} window and budget $5–15 in gas for the unwrap.`,
    ];
  },
  'nonce-capital': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a Nonce Capital curated vault on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; curator vaults accrue on time-weighted deposits in underlying lending markets.`,
      `Read the vault's allocation report before depositing your ${cap}: you are farming the curator's fee share, so the underlying mix — not the curator's brand — is the position, and the fee is the cost of the curation — review the report weekly over the ${dur} window.`,
      `Track the vault's net APY against the underlying market weekly over the ${dur} window; if the curator fee eats the spread for two weeks running, rotate the ${cap} out to the underlying market and save the fee.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any season announcement are the ones that usually count.`,
      `Screenshot the vault dashboard at deposit and monthly over the ${dur} window; exit by withdrawing after a token announcement, or when the curator's fee exceeds the yield it adds — budget $10–25 in gas for the withdrawal.`,
    ];
  },
  rockawayx: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a RockawayX curated vault on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; curator vaults accrue on time-weighted deposits in underlying lending markets.`,
      `Read the vault's allocation report before depositing your ${cap}: you are farming the curator's fee share, so the underlying mix — not the curator's brand — is the position, and the fee is the cost of the curation — review the report weekly over the ${dur} window.`,
      `Track the vault's net APY against the underlying market weekly over the ${dur} window; if the curator fee eats the spread for two weeks running, rotate the ${cap} out to the underlying market and save the fee.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any season announcement are the ones that usually count.`,
      `Screenshot the vault dashboard at deposit and monthly over the ${dur} window; exit by withdrawing after a token announcement, or when the curator's fee exceeds the yield it adds — budget $10–25 in gas for the withdrawal.`,
    ];
  },
  hyperithm: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a Hyperithm curated vault on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; curator vaults accrue on time-weighted deposits in underlying lending markets.`,
      `Read the vault's allocation report before depositing your ${cap}: you are farming the curator's fee share, so the underlying mix — not the curator's brand — is the position, and the fee is the cost of the curation — review the report weekly over the ${dur} window.`,
      `Track the vault's net APY against the underlying market weekly over the ${dur} window; if the curator fee eats the spread for two weeks running, rotate the ${cap} out to the underlying market and save the fee.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any season announcement are the ones that usually count.`,
      `Screenshot the vault dashboard at deposit and monthly over the ${dur} window; exit by withdrawing after a token announcement, or when the curator's fee exceeds the yield it adds — budget $10–25 in gas for the withdrawal.`,
    ];
  },
  curvance: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Supply ${cap} of a blue-chip asset to Curvance lending on ${chain} — budget $10–20 in gas — and leave it supplied for the full ${dur} window; lending usage, not a one-off deposit, is what a future allocation would weight.`,
      `Borrow against the supply at under 50% loan-to-value and loop once if the borrow APY stays below the supply APY — looping doubles the usage footprint of the ${cap} position but also doubles liquidation risk, so size the loop small and review the rates weekly over the ${dur} window.`,
      `Check utilisation and borrow rates weekly over the ${dur} window; a market pinned at 100% utilisation means withdrawals can queue, so do not treat the ${cap} position as instant cash — budget $10–20 in gas for the exit.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count, so keep the supply working.`,
      `Record supply and borrow transaction hashes; unwind the loop and withdraw after a token announcement, or when borrow APY exceeds supply APY for two weeks — decide inside the ${dur} window and budget $10–20 in gas to unwind.`,
    ];
  },
  lagoon: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a Lagoon managed vault on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; Lagoon is an on-chain capital allocator, so the position sits in the manager's chosen strategies.`,
      `Read the vault's strategy allocation before depositing your ${cap}: allocator vaults rotate between strategies, and the risk of the vault is the risk of the current mix — re-read the allocation weekly over the ${dur} window.`,
      `Track the vault's net APY and strategy changes weekly over the ${dur} window; a sudden rotation into a new strategy is a reason to re-underwrite the ${cap} position, not to ignore it, and the fee is the cost of the manager.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any season announcement are the ones that usually count.`,
      `Keep the deposit receipt and the strategy sheet; exit after a token announcement, or when the vault's net APY trails its stated benchmark for 30 days — decide inside the ${dur} window and budget $10–25 in gas for the withdrawal.`,
    ];
  },
  'k3-capital': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a K3 Capital curated vault on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; curator vaults accrue on time-weighted deposits in underlying lending markets.`,
      `Read the vault's allocation report before depositing your ${cap}: you are farming the curator's fee share, so the underlying mix — not the curator's brand — is the position, and the fee is the cost of the curation — review the report weekly over the ${dur} window.`,
      `Track the vault's net APY against the underlying market weekly over the ${dur} window; if the curator fee eats the spread for two weeks running, rotate the ${cap} out to the underlying market and save the fee.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any season announcement are the ones that usually count.`,
      `Screenshot the vault dashboard at deposit and monthly over the ${dur} window; exit by withdrawing after a token announcement, or when the curator's fee exceeds the yield it adds — budget $10–25 in gas for the withdrawal.`,
    ];
  },
  valos: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a Valos RWA vault on ${chain} — budget $10–20 in gas — and hold it for the full ${dur} window; RWA allocations weight deposited balance and duration, so an early exit resets the clock.`,
      `Confirm the vault's underlying asset and redemption window before depositing your ${cap}: RWA exits run through redemption windows, not instant swaps, and Valos vaults vary by asset class — verify the terms weekly over the ${dur} window.`,
      `Track the vault's reported yield weekly against a plain Treasury RWA over the ${dur} window; if it trails for a month, the ${cap} position is paying for optionality it is not delivering, and the fee is the cost of staying.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count, so keep the position working.`,
      `Keep the deposit receipt and the redemption schedule; exit at the next window after a token announcement, or when the vault's yield trails its benchmark for 30 days — decide inside the ${dur} window and budget $10–20 in gas to redeem.`,
    ];
  },
  'doppler-finance': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a Doppler Finance CeDeFi vault on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; CeDeFi vaults blend centralised custody with on-chain rails, so the position is not pure DeFi.`,
      `Read the custody arrangement before depositing your ${cap}: Doppler's yield depends on a centralised counterparty, so the position carries counterparty risk a pure DeFi vault does not — size it as a satellite and review the custody terms weekly over the ${dur} window.`,
      `Track the vault's reported yield and the custodian's disclosures weekly over the ${dur} window; a change in custodian or a withdrawal delay is an exit signal, not a detail, and unwinding the ${cap} position costs $10–25 in gas.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; deposits made before any season announcement are the ones that usually count.`,
      `Keep the deposit receipt and the custody terms; exit after a token announcement, or immediately if withdrawals slow or the custodian changes — decide inside the ${dur} window and budget $10–25 in gas for the withdrawal.`,
    ];
  },
  'b14g': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} of an accepted LST into a b14g restaking position on ${chain} — budget $10–25 in gas — and hold it for the full ${dur} window; restaking rewards accrue on time-weighted deposits, so an early exit resets the clock.`,
      `Pick the vault by its operator set and slashing terms, not by headline APY: on a ${cap} position held ${dur}, b14g is Berachain restaking, so the operators securing the position are the risk you are actually taking — review the operator list weekly.`,
      `If a vault partner runs a points season, deposits made before the season's snapshot are the ones that usually count — on a ${cap} position held ${dur}, verify the program on the partner's own channels first and budget $10–25 in gas before adding capital; no native b14g points program is confirmed in the sealed snapshot.`,
      `Monitor operator performance and any slashing events weekly over the ${dur} window; a slashing event cuts principal, not just yield, so a ${cap} position can lose capital even while the APY looks attractive.`,
      `Keep the deposit receipt and the operator list; exit by withdrawing after a token announcement, or when the vault's operators change materially for the worse — decide inside the ${dur} window and budget $10–25 in gas for the withdrawal.`,
    ];
  },
  noble: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    return [
      `Bridge ${cap} to Noble and use its native apps weekly for the full ${dur} window — budget $10–30 in bridge and gas fees; chain-adjacent farms reward sustained activity, not a single deposit, so keep the position active.`,
      `Do not treat this as a normal DeFi farm: on a ${cap} position held ${dur}, Noble is a Cosmos appchain, so any token case follows chain-token logic and the DeFi multiple on this row is a weak fit — size it small and review the fee weekly.`,
      `Use at least two different apps on the network each week over the ${dur} window so the activity reads as a real user, not a bridge-and-hold — budget $10–30 in weekly gas and fees for the ${cap} position's transactions.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; activity from before any token announcement is what usually counts.`,
      `Keep a log of weekly transactions; exit by bridging back after a token announcement, or when weekly activity costs more in fees than the position's option value — decide inside the ${dur} window and budget $10–30 in bridge fees to exit.`,
    ];
  },
  infinifi: (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into an infiniFi yield vault on ${chain} — budget $10–20 in gas — and hold it for the full ${dur} window; yield vaults accrue on time-weighted deposits and auto-compound, so an early exit resets the clock.`,
      `Read the vault's strategy sheet before depositing your ${cap}: infiniFi vaults run yield strategies whose risk is the strategy's risk, and the headline APY is not a promise — re-read the sheet weekly over the ${dur} window.`,
      `Track the vault's net APY and drawdown weekly against the same strategy run directly over the ${dur} window; if the fee exceeds the convenience for a month, exit the ${cap} to the underlying and save the fee.`,
      `Points-style farming is the norm for yield vaults, so if ${f.name} opens a season, deposits made before the season's snapshot are the ones that usually count — on a ${cap} position held ${dur}, verify the program on the project's own channels first and budget $10–20 in gas; no program is confirmed in the sealed snapshot.`,
      `Keep the deposit receipt and the strategy sheet; exit after a token announcement, or when the vault's strategy underperforms its benchmark for 30 days — decide inside the ${dur} window and budget $10–20 in gas for the withdrawal.`,
    ];
  },
  'aegis-yusd': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Open a ${cap} delta-neutral basis position via Aegis YUSD on ${chain} — budget $10–25 in gas and funding — and hold it for the full ${dur} window through at least one funding cycle.`,
      `Watch the funding rate daily for the first week of the ${dur} window: basis trades earn when funding is positive and bleed when it flips negative, so a persistently negative rate is the exit signal, not a buying opportunity — check the funding fee daily.`,
      `Keep the hedge ratio near 1:1 and check it after every large market move over the ${dur} window; an unhedged leg turns a ${cap} basis farm into a directional bet, and YUSD is a yield-bearing stablecoin, so the long leg carries its own peg risk — re-hedge weekly.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage and funding income, not by chasing a program that may not exist; funding earned weekly is the measurable return.`,
      `Record entry prices for both legs; unwind both legs together after a token announcement, or immediately if funding stays negative for a week — decide inside the ${dur} window and budget $10–25 in gas and funding fees to unwind.`,
    ];
  },
  'apex-omni': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Trade ${cap} of perps volume through Apex Omni on ${chain} over the full ${dur} window — budget $10–25 in fees — spreading the volume across at least four weeks so it reads as a real trader, not a wash.`,
      `Use limit orders where the venue rewards maker flow and keep positions small: on a ${cap} position traded over ${dur}, perps allocations weight fee-paying volume and open interest held, not a single large trade — review the fee weekly.`,
      `Track funding and liquidation risk on every open position daily over the ${dur} window; a liquidation wipes the position and the usage history with it, so keep leverage under 3x and budget $10–25 in fees for the ${cap} position's trades.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position traded over ${dur}, farm by trading volume, not by chasing a program that may not exist; fee-paying volume from before any announcement is what usually counts.`,
      `Keep a log of weekly volume and fees paid over the ${dur} window; stop trading after a token announcement, or when the fees paid exceed the position's implied option value — decide inside the ${dur} window and budget $10–25 in fees to close out.`,
    ];
  },
  // Re-admitted 2026-11-15 (verify.ts): nine genuine pre-token candidates the
  // house watchlist left out. Each override is written for that protocol's
  // actual mechanics, like the watchlist overrides above.
  'polymarket-international': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    return [
      `Fund ${cap} of USDC on Polygon and trade it across at least three live event markets on ${f.name} over the full ${dur} window — budget $5–15 in gas — spreading the trades across weeks so the volume reads as a real trader.`,
      `Leave some outcome shares open to expiry instead of flipping everything: on a ${cap} position traded over ${dur}, prediction allocations weight resolved volume and shares held through settlement, not deposits parked in the account — review open shares weekly.`,
      `Trade both sides of markets you follow — buying YES and NO across different events — and avoid wash-trading your own orders; over the ${dur} window a judge of the venue's data can tell the difference, and a wash pattern is the fastest way to be filtered out — budget $5–15 in gas and fees.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position traded over ${dur}, farm by trading volume, not by chasing a program that may not exist; if a POLY token season opens, trading history from before the announcement is what usually counts.`,
      `Keep a log of weekly volume, fees and resolved positions over the ${dur} window; stop trading after a token announcement, or when the fees paid exceed the position's implied option value — decide inside the ${dur} window.`,
    ];
  },
  'bitfi-basis': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Open a ${cap} delta-neutral basis position via ${f.name} on ${chain} — budget $10–25 in gas and funding — and hold it for the full ${dur} window through at least one funding cycle.`,
      `Watch the funding rate daily for the first week of the ${dur} window: basis trades earn when funding is positive and bleed when it flips negative, so a persistently negative rate is the exit signal, not a buying opportunity — check the funding fee daily.`,
      `Keep the hedge ratio near 1:1 and re-check it after every large market move over the ${dur} window; an unhedged leg turns a ${cap} basis farm into a directional bet, and BitFi's CeDeFi structure adds counterparty risk a pure on-chain vault does not.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage and funding income, not by chasing a program that may not exist; funding earned weekly is the measurable return.`,
      `Record entry prices for both legs; unwind both legs together after a token announcement, or immediately if funding stays negative for a week — decide inside the ${dur} window and budget $10–25 in gas and funding fees to unwind.`,
    ];
  },
  'extended-perps': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Trade ${cap} of perps volume through Extended on ${chain} over the full ${dur} window — budget $10–25 in fees — spreading the volume across at least four weeks so it reads as a real trader, not a wash.`,
      `Use limit orders where the venue rewards maker flow and keep positions small: on a ${cap} position traded over ${dur}, perps allocations weight fee-paying volume and open interest held, not a single large trade — review the fee weekly.`,
      `Track funding and liquidation risk on every open position daily over the ${dur} window; a liquidation wipes the position and the usage history with it, so keep leverage under 3x and budget $10–25 in fees for the ${cap} position's trades.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position traded over ${dur}, farm by trading volume, not by chasing a program that may not exist; fee-paying volume from before any announcement is what usually counts.`,
      `Keep a log of weekly volume and fees paid over the ${dur} window; stop trading after a token announcement, or when the fees paid exceed the position's implied option value — decide inside the ${dur} window and budget $10–25 in fees to close out.`,
    ];
  },
  'cian-yield-layer': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Deposit ${cap} into a CIAN yield-layer strategy on ${chain} — budget $10–20 in gas — and hold it for the full ${dur} window; yield-layer allocations weight deposited balance and time held, so an early exit resets the clock.`,
      `Read the strategy sheet before depositing your ${cap}: CIAN routes across lending and staking strategies, and the risk of the position is the risk of the underlying mix, not of the layer itself — re-read the sheet weekly over the ${dur} window.`,
      `Track the strategy's net APY and drawdown weekly against the same strategies run directly over the ${dur} window; if the layer's fee exceeds the convenience for a month, exit the ${cap} to the underlying and save the fee.`,
      `Points-style farming is the norm for yield aggregators, so if ${f.name} opens a season, deposits made before the season's snapshot are the ones that usually count — on a ${cap} position held ${dur}, verify the program on the project's own channels first and budget $10–20 in gas; no program is confirmed in the sealed snapshot.`,
      `Keep the deposit receipt and the strategy sheet; exit after a token announcement, or when the strategy underperforms its benchmark for 30 days — decide inside the ${dur} window and budget $10–20 in gas for the withdrawal.`,
    ];
  },
  'defi-saver-asset-management': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Open a ${cap} managed CDP position through DeFi Saver on ${chain} at 40–50% loan-to-value — budget $10–25 in gas — and hold it for the full ${dur} window; CDP usage is measured by minted supply held over time.`,
      `Turn on DeFi Saver's automation (auto-repay and auto-boost) with conservative thresholds: the manager's value is keeping the ${cap} position in range while you are away, and a liquidation wipes the position and its usage history — check the automation log weekly over the ${dur} window.`,
      `Check the collateral ratio and the automation log weekly over the ${dur} window; if the ratio drifts under 150%, top up collateral rather than waiting for the automation to fire at the edge — budget $10–25 in gas for the ${cap} position's top-up.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position held ${dur}, farm by usage, not by chasing a program that may not exist; DeFi Saver has never issued a token, so treat the launch case as an option, not a promise.`,
      `Record the position id and every transaction hash; unwind only after a token announcement, or when the manager's fees exceed the automation value it adds — decide inside the ${dur} window and budget $10–25 in gas to unwind.`,
    ];
  },
  'arcus-perps': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    return [
      `Trade ${cap} of perps volume through Arcus on Robinhood Chain over the full ${dur} window — budget $10–25 in fees — spreading the volume across at least two weeks so it reads as a real trader, not a wash.`,
      `Bridge funds to Robinhood Chain first and keep a gas reserve on the new chain: on a ${cap} position traded over ${dur}, a young chain's bridge and gas behaviour is the first thing that breaks a farm, and Arcus has only been live a few months — budget $10–25 in bridge fees.`,
      `Use limit orders where the venue rewards maker flow and keep leverage under 3x over the ${dur} window; a liquidation wipes the ${cap} position and the usage history with it, so track funding and liquidation risk daily.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position traded over ${dur}, farm by trading volume, not by chasing a program that may not exist; fee-paying volume from before any announcement is what usually counts.`,
      `Keep a log of weekly volume and fees paid over the ${dur} window; stop trading after a token announcement, or when the fees paid exceed the position's implied option value — decide inside the ${dur} window and budget $10–25 in fees to close out.`,
    ];
  },
  'azverse-perps': (f) => {
    const cap = money(capitalFor(f.tvl_usd));
    const dur = durationFor(f.age_days);
    const chain = firstChain(f);
    return [
      `Trade ${cap} of perps volume through AZverse on ${chain} over the full ${dur} window — budget $10–25 in fees — spreading the volume across at least two weeks so it reads as a real trader, not a wash.`,
      `Use limit orders where the venue rewards maker flow and keep positions small: on a ${cap} position traded over ${dur}, perps allocations weight fee-paying volume and open interest held, not a single large trade — review the fee weekly.`,
      `Track funding and liquidation risk on every open position daily over the ${dur} window; AZverse has only been live a few months, so treat the venue itself as the biggest risk — keep leverage under 3x, size the ${cap} position small, and budget $10–25 in fees.`,
      `No points program is confirmed in the sealed snapshot for ${f.name} — on a ${cap} position traded over ${dur}, farm by trading volume, not by chasing a program that may not exist; fee-paying volume from before any announcement is what usually counts.`,
      `Keep a log of weekly volume and fees paid over the ${dur} window; stop trading after a token announcement, or when the fees paid exceed the position's implied option value — decide inside the ${dur} window and budget $10–25 in fees to close out.`,
    ];
  },
};

/** Full farm plan for one board row. Overrides win where curated; everything
 *  else is templated from the row's own facts. */
export function farmPlanFor(f: RowFacts): FarmPlan {
  const override = OVERRIDES[f.slug];
  let steps = override !== undefined ? override(f) : templateSteps(f);
  if (f.top30) {
    // v3 (radar-4): the top-30 plans carry 7 steps. Template rows get the
    // sizing step plus a row-specific exit trigger (replacing the generic
    // exit); override rows keep their 5 protocol-specific steps and gain
    // the sizing step plus a monitor step that names the one metric to
    // watch. Every added step carries the row's own capital and window.
    if (override !== undefined) {
      steps = [...steps, sizingStep(f), monitorStep(f)];
    } else {
      steps = [...steps.slice(0, 5), sizingStep(f), exitTriggerStep(f)];
    }
  }
  const low = Math.max(1, Math.round(f.implied_base * 0.05));
  const high = Math.max(low, Math.round(f.implied_base * 0.25));
  return {
    steps,
    capital_usd: capitalFor(f.tvl_usd),
    duration: durationFor(f.age_days),
    points: pointsStatus(f.category),
    airdrop_low: low,
    airdrop_high: high,
  };
}

/** "2,222x" — manual thousands separators, no locale dependence. */
function multFmt(n: number): string {
  const s = String(Math.round(n));
  return `${s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}×`;
}

/**
 * Step 6 (top 30): the EV-per-dollar sizing line, rendered as a number.
 * The airdrop range is the whole protocol-level pie (implied FDV x
 * 5-25% community share), so the multiple is stated as the pie versus
 * one ticket — never as a per-user return, which the snapshot cannot
 * support (points outstanding are unknown).
 */
function sizingStep(f: RowFacts): string {
  const cap = money(capitalFor(f.tvl_usd));
  const dur = durationFor(f.age_days);
  const capUsd = capitalFor(f.tvl_usd);
  const low = Math.max(1, Math.round(f.implied_base * 0.05));
  const high = Math.max(low, Math.round(f.implied_base * 0.25));
  return `Sizing: the protocol-level airdrop range is ${money(low)}–${money(high)} at a 5–25% community share of the ${money(f.implied_base)} implied FDV — that is ${multFmt(low / capUsd)}–${multFmt(high / capUsd)} a ${cap} ticket, the whole pie, not your share; size the ticket so gas ($10–25) stays under ~5% of it, and hold for the full ${dur} window.`;
}

interface RowTrigger {
  /** "when ..." — the condition that triggers the exit. */
  exit: string;
  /** What to check, e.g. "the vault's net APY against the underlying market". */
  watch: string;
  /** How often to check it. */
  cadence: string;
  /** What unwinding costs. */
  gas: string;
}

/** The named exit trigger per category family, built from the row's own
 *  mechanics — the same trigger the monitor step watches for. */
function triggerFor(category: string): RowTrigger {
  switch (category) {
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return {
        exit: 'when the curator fee exceeds the underlying yield for two weeks running',
        watch: "the vault's net APY against the underlying market",
        cadence: 'weekly',
        gas: '$10–25',
      };
    case 'Derivatives':
    case 'Basis Trading':
      return {
        exit: 'when funding stays negative for a week',
        watch: 'the funding rate',
        cadence: 'daily for the first week, then weekly',
        gas: '$10–25',
      };
    case 'Lending':
    case 'Uncollateralized Lending':
      return {
        exit: 'when borrow APY exceeds supply APY for two weeks',
        watch: 'utilisation and borrow rates',
        cadence: 'weekly',
        gas: '$10–20',
      };
    case 'Dexs':
      return {
        exit: 'when the pool’s fee APR trails the same capital in a plain lending market for two weeks',
        watch: 'the pool’s fee APR against a lending benchmark',
        cadence: 'weekly',
        gas: '$10–20',
      };
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaking':
    case 'Staking Pool':
      return {
        exit: 'when the receipt token trades below peg by more than 0.5% for a week',
        watch: 'the receipt token’s peg',
        cadence: 'weekly',
        gas: '$5–15',
      };
    case 'RWA':
      return {
        exit: 'when the vault’s yield trails a plain T-bill rate for a full month',
        watch: 'the vault’s net yield against a T-bill rate',
        cadence: 'weekly',
        gas: '$10–20',
      };
    case 'Yield':
    case 'Yield Aggregator':
      return {
        exit: 'when the vault’s net APY trails the same strategy run directly for 30 days',
        watch: 'the vault’s net APY against the strategy run directly',
        cadence: 'weekly',
        gas: '$10–20',
      };
    case 'CDP':
    case 'CDP Manager':
      return {
        exit: 'when the collateral ratio drifts under 150% and cannot be topped up',
        watch: 'the collateral ratio',
        cadence: 'weekly',
        gas: '$10–20',
      };
    case 'Prediction Market':
      return {
        exit: 'when your open outcome shares stop resolving in your favour for two weeks',
        watch: 'resolved volume on your open markets',
        cadence: 'weekly',
        gas: '$5–15',
      };
    case 'Chain':
    case 'Payments':
      return {
        exit: 'when weekly activity costs more in fees than the position’s option value',
        watch: 'weekly gas and bridge fees against the position’s option value',
        cadence: 'weekly',
        gas: '$10–30',
      };
    default:
      return {
        exit: 'when the position’s implied value per dollar falls below your entry cost',
        watch: 'the row’s implied value and any token announcement',
        cadence: 'weekly',
        gas: '$5–15',
      };
  }
}

/** Step 7 (top-30 template rows): the exit, with a named row-specific trigger. */
function exitTriggerStep(f: RowFacts): string {
  const cap = money(capitalFor(f.tvl_usd));
  const dur = durationFor(f.age_days);
  const t = triggerFor(f.category);
  return `Exit after a token announcement, or ${t.exit} — check ${t.watch} ${t.cadence} over the ${dur} window, and budget ${t.gas} in gas to close the ${cap} position.`;
}

/**
 * Step 7 (top-30 override rows): the monitor step. The override's own
 * step 5 already is the exit, so this step names the one metric that
 * decides whether to exit early — a threshold, a check cadence and a
 * 48-hour decision window — instead of repeating the exit.
 */
function monitorStep(f: RowFacts): string {
  const cap = money(capitalFor(f.tvl_usd));
  const dur = durationFor(f.age_days);
  const t = triggerFor(f.category);
  const when = t.exit.charAt(0).toUpperCase() + t.exit.slice(1);
  return `Watch one number ${t.cadence}: ${t.watch}. ${when}, decide within 48 hours whether to exit early instead of waiting for a token announcement over the ${dur} window, and budget ${t.gas} in gas for the move on the ${cap} position.`;
}

/** Slugs with a curated (hand-written, protocol-specific) farm plan. */
export function curatedSlugs(): string[] {
  return Object.keys(OVERRIDES).sort();
}
