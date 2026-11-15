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

export type PointsStatus = 'known' | 'none' | 'inferred';

export interface RowFacts {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  age_days: number | null;
  implied_base: number;
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

/** The core action for the row's category — what the capital actually does. */
function coreAction(f: RowFacts): string {
  const chain = firstChain(f);
  const cap = money(capitalFor(f.tvl_usd));
  switch (f.category) {
    case 'Lending':
    case 'Uncollateralized Lending':
      return `Supply ${cap} of a blue-chip asset to ${f.name}'s lending market on ${chain} and leave it supplied — lending usage, not a one-off deposit, is what a future allocation would weight.`;
    case 'Dexs':
      return `Provide ${cap} of liquidity to ${f.name}'s highest-fee pool on ${chain} in a tight, actively managed range, and route at least one swap a week through the pool so the position reads as usage, not parked capital.`;
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaking':
    case 'Staking Pool':
      return `Stake ${cap} through ${f.name} on ${chain} and hold the receipt token for the full window — restaking value accrues on time-weighted balance, so withdrawing early resets the clock.`;
    case 'RWA':
      return `Deposit ${cap} into ${f.name}'s tokenised-asset vault on ${chain} and hold the receipt token — RWA allocations weight real deposited balance and holding duration.`;
    case 'Yield':
    case 'Yield Aggregator':
      return `Deposit ${cap} into ${f.name}'s auto-compounding vault on ${chain} and let it compound for the full window — vault points, where they exist, are time-weighted.`;
    case 'Derivatives':
    case 'Basis Trading':
      return `Open a ${cap} delta-neutral basis position via ${f.name} on ${chain} (long spot, short the perp) and hold it through at least one funding cycle — basis volume is the usage this category rewards.`;
    case 'CDP':
      return `Lock ${cap} of collateral in ${f.name} on ${chain}, mint the stablecoin at a conservative 40–50% loan-to-value, and hold the position — CDP usage is measured by minted supply held over time.`;
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return `Deposit ${cap} into a ${f.name} curated vault on ${chain} and check the curator's allocation report weekly — you are farming the curator's fee share, so the vault's underlying mix is the position.`;
    case 'Prediction Market':
      return `Trade ${cap} across at least three live event markets on ${f.name} and leave some outcome shares open to expiry — prediction allocations weight resolved volume, not deposits.`;
    case 'Chain':
    case 'Payments':
      return `Bridge ${cap} to ${f.name}'s network and use its native apps weekly — chains reward sustained on-chain activity, and a single bridge-and-hold does not count as usage.`;
    case 'CDP Manager':
      return `Open a ${cap} managed CDP position through ${f.name} on ${chain} at 40–50% loan-to-value and hold it — manager fees and position duration are the measurable usage.`;
    default:
      return `Deposit ${cap} into ${f.name}'s core product on ${chain} and use it weekly for the full window — sustained usage, not a single deposit, is what any future allocation would weight.`;
  }
}

/** Curated overrides for the highest-ranked watchlist rows. Each override is
 *  written for that protocol's actual mechanics (category + chains + TVL tier),
 *  with a concrete cost and duration in every plan. No override claims a
 *  points program that the snapshot does not show. */
const OVERRIDES: Record<string, (f: RowFacts) => string[]> = {
  usdd: (f) => [
    `Open ${f.name} on ${firstChain(f)} with ${money(capitalFor(f.tvl_usd))} and mint USDD at 40–50% loan-to-value against TRX or another approved collateral — budget $5–15 in gas for the mint and hold the position 30–60 days.`,
    `Hold the minted USDD rather than selling it: CDP allocations weight minted supply held over time, and USDD is itself the stablecoin, so the launch case is a governance token, not the asset.`,
    `Check the collateral ratio weekly and top it up if it drifts under 150% — a liquidation wipes the position and any usage history with it.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist; if a governance-token season opens, positions open before the announcement are the ones that usually count.`,
    `Record the mint transaction hash and the collateral-ratio history; exit only by repaying the mint and withdrawing collateral after a token announcement, or when the implied value per dollar falls below your entry cost.`,
  ],
  'steakhouse-financial': (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Steakhouse-curated Morpho vault on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; curator vaults accrue on time-weighted deposits.`,
    `Read the vault's allocation report before depositing: Steakhouse curates Morpho vaults, so your dollars sit in underlying lending markets and the curator takes a fee slice — you are farming that slice, not a standalone protocol.`,
    `Compare the vault's net APY against the underlying Morpho market weekly; if the curator fee eats the spread, move to a cheaper vault rather than staying loyal.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage; if a curator-token season opens, deposits made before the announcement are the ones that usually count.`,
    `Screenshot the vault dashboard at deposit and monthly; exit by withdrawing to the underlying asset after a token announcement, or when the curator's fee exceeds the yield it adds.`,
  ],
  gauntlet: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Gauntlet-curated vault on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; Gauntlet is the largest Morpho curator, so the position is a fee-share farm on underlying lending markets.`,
    `Check Gauntlet's published risk parameters for the vault: its edge is risk curation, so a vault whose caps keep hitting 100% utilisation is a warning sign, not a yield win.`,
    `Track the vault's realised APY against a plain Morpho market weekly; if Gauntlet's fee exceeds the extra yield for two weeks running, rotate out.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Keep the deposit and withdrawal transaction hashes; exit after a token announcement, or when the curator's fee share no longer beats holding the underlying market directly.`,
  ],
  onre: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into OnRe's tokenised reinsurance vault on ${firstChain(f)} — budget $10–20 in gas — and hold 30–60 days; RWA allocations weight real deposited balance and duration.`,
    `Read the vault's reinsurance exposure note first: OnRe underwrites real-world risk, so the position carries insurance-cycle risk that a plain DeFi vault does not — size it as a satellite, not a core holding.`,
    `Check the vault's reported yield and capacity weekly; OnRe capacity is capped by underwriting, so a closed vault means waiting for the next tranche rather than forcing entry.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count.`,
    `Screenshot the deposit receipt and the vault terms; exit by redeeming after a token announcement, or when the vault's yield drops below a plain RWA money-market rate.`,
  ],
  'bittensor-dtao': (f) => [
    `Buy ${money(capitalFor(f.tvl_usd))} of TAO and stake it to a dTAO subnet on Bittensor — budget $5–15 in fees — and hold 30–60 days; subnet rewards accrue to stakers by emission weight.`,
    `Pick the subnet by its emission share and validator quality, not by name: dTAO rewards follow the subnet's weight in the root network, and weights move every tempo.`,
    `Re-stake rewards weekly rather than compounding daily — Bittensor fees punish small frequent transactions, and the position is time-weighted anyway.`,
    `TAO already trades, so there is no separate dTAO token to farm — the upside here is TAO emission yield plus any subnet-token mechanics, not a fresh launch; treat the implied value as a ceiling, not a promise.`,
    `Record the stake transaction and the subnet id; unstake only after a subnet-token announcement, or when the subnet's emission share falls for two tempos in a row.`,
  ],
  veda: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Veda-powered vault (for example a BoringVault) on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; Veda is vault infrastructure, so the position sits in the underlying strategy.`,
    `Read the vault's strategy sheet before depositing: Veda vaults run everything from plain lending to basis trades, and the risk of the vault is the risk of the strategy, not of Veda itself.`,
    `Track the vault's net APY and drawdown weekly against the same strategy run directly; if Veda's fee exceeds the convenience for a month, exit to the underlying.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Keep the deposit receipt and the strategy sheet; exit after a token announcement, or when the vault's strategy underperforms its benchmark for 30 days.`,
  ],
  opentrade: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into an OpenTrade tokenised Treasury vault on ${firstChain(f)} — budget $10–20 in gas — and hold 30–60 days; RWA allocations weight deposited balance and duration.`,
    `Confirm the vault's underlying is a short-duration Treasury product and check the redemption window: OpenTrade yields track T-bills, so the farm is yield plus optionality, not a high-beta points play.`,
    `Compare the vault's net yield to a plain T-bill rate weekly; if the spread goes negative for two weeks, the position is paying for optionality it is not delivering.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count.`,
    `Screenshot the deposit and the redemption terms; redeem after a token announcement, or when the vault's yield trails T-bills for a full month.`,
  ],
  'plume-vaults': (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Plume Vault on Plume — budget $5–15 in gas — and hold 30–60 days; vaults hold tokenised real-world assets, so the position is RWA balance plus duration.`,
    `PLUME already trades, so this is not a fresh-launch farm: the value case is vault yield and any future vault-specific incentive, not a new token — size it as yield, not as a lottery ticket.`,
    `Check the vault's underlying asset and lock-up weekly; RWA vaults can gate redemptions around asset maturities, so know the next redemption window before you need the money.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Record the deposit hash and the vault's redemption schedule; exit at the next redemption window after an incentive announcement, or when the vault's yield trails a plain RWA money-market rate.`,
  ],
  symbiotic: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} of an accepted LST into a Symbiotic vault on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; restaking rewards accrue on time-weighted deposits.`,
    `Pick the vault by its operator set and slashing terms, not by headline APY: Symbiotic is permissionless restaking, so a vault's operators are the risk you are actually taking.`,
    `If a vault partner runs a points season, deposits made before the season's snapshot are the ones that usually count — verify the program on the partner's own channels first; no native Symbiotic points program is confirmed in the sealed snapshot.`,
    `Monitor the vault's operator performance and any slashing events weekly; a slashing event cuts principal, not just yield.`,
    `Keep the deposit receipt and the operator list; exit by withdrawing after a token announcement, or when the vault's operators change materially for the worse.`,
  ],
  'hive-protocol': (f) => [
    `Bridge ${money(capitalFor(f.tvl_usd))} to Hive and use its core apps weekly for 30–60 days — budget $10–30 in bridge and gas fees; chain-adjacent farms reward sustained activity, not a single deposit.`,
    `Do not treat this as a normal DeFi farm: Hive is chain-adjacent, so the token case (if any) follows chain-token logic, and the DeFi multiple on this row is a weak fit — size it small.`,
    `Use at least two different apps on the network each week so the activity reads as a real user, not a bridge-and-hold.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Keep a log of weekly transactions; exit by bridging back after a token announcement, or when weekly activity costs more in fees than the position's option value.`,
  ],
  lofty: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Lofty tokenised real-estate vault on ${firstChain(f)} — budget $10–20 in gas — and hold 30–60 days; RWA allocations weight deposited balance and duration.`,
    `Read the property sheet for the vault: Lofty vaults hold fractional real estate, so the position carries property-market and liquidity risk that a Treasury RWA does not.`,
    `Check the vault's rental yield and secondary-market depth weekly; thin secondary markets mean the exit is the redemption window, not an instant swap.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count.`,
    `Screenshot the deposit and the property sheet; exit at a redemption window after a token announcement, or when the vault's yield trails a plain RWA money-market rate.`,
  ],
  r25: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into an R25 RWA vault on ${firstChain(f)} — budget $10–20 in gas — and hold 30–60 days; RWA allocations weight deposited balance and duration.`,
    `Confirm the vault's underlying asset class and redemption terms before depositing: R25 vaults vary by asset, and the exit is the redemption window, not an instant swap.`,
    `Track the vault's reported yield weekly against a plain Treasury RWA; if it trails for a month, the position is paying for optionality it is not delivering.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count.`,
    `Keep the deposit receipt and the redemption schedule; exit at the next window after a token announcement, or when the vault's yield trails its benchmark for 30 days.`,
  ],
  'tori-finance': (f) => [
    `Open a ${money(capitalFor(f.tvl_usd))} delta-neutral basis position via Tori Finance on ${firstChain(f)} — budget $10–25 in gas and funding — and hold it 30–60 days through at least one funding cycle.`,
    `Watch the funding rate daily for the first week: basis trades earn when funding is positive and bleed when it flips negative, so a persistently negative rate is the exit signal, not a buying opportunity.`,
    `Keep the hedge ratio near 1:1 and check it after every large market move; an unhedged leg turns a basis farm into a directional bet.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage and funding income, not by chasing a program that may not exist.`,
    `Record entry prices for both legs; unwind both legs together after a token announcement, or immediately if funding stays negative for a week.`,
  ],
  upshift: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into an Upshift managed vault on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; Upshift is an on-chain capital allocator, so the position sits in the manager's chosen strategies.`,
    `Read the vault's strategy allocation before depositing: allocator vaults can rotate between lending, basis and LP strategies, and the risk of the vault is the risk of the current mix.`,
    `Track the vault's net APY and strategy changes weekly; a sudden rotation into a new strategy is a reason to re-underwrite, not to ignore.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Keep the deposit receipt and the strategy sheet; exit after a token announcement, or when the vault's net APY trails its stated benchmark for 30 days.`,
  ],
  axis: (f) => [
    `Open a ${money(capitalFor(f.tvl_usd))} delta-neutral basis position via Axis on ${firstChain(f)} — budget $10–25 in gas and funding — and hold it 30–60 days through at least one funding cycle.`,
    `Watch the funding rate daily for the first week: basis trades earn when funding is positive and bleed when it flips negative, so a persistently negative rate is the exit signal.`,
    `Keep the hedge ratio near 1:1 and re-check it after every large market move; an unhedged leg turns a basis farm into a directional bet.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage and funding income, not by chasing a program that may not exist.`,
    `Record entry prices for both legs; unwind both legs together after a token announcement, or immediately if funding stays negative for a week.`,
  ],
  'lightning-network': (f) => [
    `Open a ${money(capitalFor(f.tvl_usd))} Lightning channel on Bitcoin — budget $5–20 in on-chain fees — and keep it open 30–60 days, routing payments weekly so the channel reads as used, not parked.`,
    `This is a payments-network position, not a DeFi farm: there is no token-launch mechanism visible in the snapshot, so treat the implied value as a ceiling and size the position for routing fees, not for an airdrop.`,
    `Balance the channel both ways: a channel that only sends (or only receives) stops routing and stops earning fees.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm routing fees, not a program that may not exist.`,
    `Log channel opens, closes and routed volume; close the channel only after a token announcement, or when routing income trails the on-chain cost of keeping it open.`,
  ],
  ember: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into an Ember RWA vault on ${firstChain(f)} — budget $10–20 in gas — and hold 30–60 days; RWA allocations weight deposited balance and duration.`,
    `Confirm the vault's underlying asset and redemption window before depositing: RWA exits run through redemption windows, not instant swaps.`,
    `Track the vault's reported yield weekly against a plain Treasury RWA; if it trails for a month, the position is paying for optionality it is not delivering.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count.`,
    `Keep the deposit receipt and the redemption schedule; exit at the next window after a token announcement, or when the vault's yield trails its benchmark for 30 days.`,
  ],
  saturn: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Saturn stablecoin-wrapped position on ${firstChain(f)} — budget $5–15 in gas — and hold 30–60 days; the wrapped asset already trades, so the launch case is a governance token only.`,
    `Check the wrap/unwrap fee and the peg before depositing: stablecoin wrappers earn on the spread, and a de-peg costs more than the farm can ever return.`,
    `Monitor the peg and the wrapper's reserves weekly; a reserve shortfall is an exit signal, not a dip to buy.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Record the wrap transaction and the peg history; unwrap after a token announcement, or immediately if the peg breaks by more than 0.5%.`,
  ],
  'nonce-capital': (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Nonce Capital curated vault on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; curator vaults accrue on time-weighted deposits in underlying lending markets.`,
    `Read the vault's allocation report before depositing: you are farming the curator's fee share, so the underlying mix — not the curator's brand — is the position.`,
    `Track the vault's net APY against the underlying market weekly; if the curator fee eats the spread for two weeks running, rotate out.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Screenshot the vault dashboard at deposit and monthly; exit by withdrawing after a token announcement, or when the curator's fee exceeds the yield it adds.`,
  ],
  rockawayx: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a RockawayX curated vault on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; curator vaults accrue on time-weighted deposits in underlying lending markets.`,
    `Read the vault's allocation report before depositing: you are farming the curator's fee share, so the underlying mix — not the curator's brand — is the position.`,
    `Track the vault's net APY against the underlying market weekly; if the curator fee eats the spread for two weeks running, rotate out.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Screenshot the vault dashboard at deposit and monthly; exit by withdrawing after a token announcement, or when the curator's fee exceeds the yield it adds.`,
  ],
  hyperithm: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Hyperithm curated vault on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; curator vaults accrue on time-weighted deposits in underlying lending markets.`,
    `Read the vault's allocation report before depositing: you are farming the curator's fee share, so the underlying mix — not the curator's brand — is the position.`,
    `Track the vault's net APY against the underlying market weekly; if the curator fee eats the spread for two weeks running, rotate out.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Screenshot the vault dashboard at deposit and monthly; exit by withdrawing after a token announcement, or when the curator's fee exceeds the yield it adds.`,
  ],
  curvance: (f) => [
    `Supply ${money(capitalFor(f.tvl_usd))} of a blue-chip asset to Curvance lending on ${firstChain(f)} — budget $10–20 in gas — and leave it supplied 30–60 days; lending usage, not a one-off deposit, is what a future allocation would weight.`,
    `Borrow against the supply at under 50% loan-to-value and loop once if the borrow APY stays below the supply APY — looping doubles the usage footprint but also doubles liquidation risk, so size the loop small.`,
    `Check utilisation and borrow rates weekly; a market pinned at 100% utilisation means withdrawals can queue, so do not treat the position as instant cash.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count.`,
    `Record supply and borrow transaction hashes; unwind the loop and withdraw after a token announcement, or when borrow APY exceeds supply APY for two weeks.`,
  ],
  lagoon: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Lagoon managed vault on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; Lagoon is an on-chain capital allocator, so the position sits in the manager's chosen strategies.`,
    `Read the vault's strategy allocation before depositing: allocator vaults rotate between strategies, and the risk of the vault is the risk of the current mix.`,
    `Track the vault's net APY and strategy changes weekly; a sudden rotation into a new strategy is a reason to re-underwrite, not to ignore.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Keep the deposit receipt and the strategy sheet; exit after a token announcement, or when the vault's net APY trails its stated benchmark for 30 days.`,
  ],
  'k3-capital': (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a K3 Capital curated vault on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; curator vaults accrue on time-weighted deposits in underlying lending markets.`,
    `Read the vault's allocation report before depositing: you are farming the curator's fee share, so the underlying mix — not the curator's brand — is the position.`,
    `Track the vault's net APY against the underlying market weekly; if the curator fee eats the spread for two weeks running, rotate out.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Screenshot the vault dashboard at deposit and monthly; exit by withdrawing after a token announcement, or when the curator's fee exceeds the yield it adds.`,
  ],
  valos: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Valos RWA vault on ${firstChain(f)} — budget $10–20 in gas — and hold 30–60 days; RWA allocations weight deposited balance and duration.`,
    `Confirm the vault's underlying asset and redemption window before depositing: RWA exits run through redemption windows, not instant swaps, and Valos vaults vary by asset class.`,
    `Track the vault's reported yield weekly against a plain Treasury RWA; if it trails for a month, the position is paying for optionality it is not delivering.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage; if a points season opens, deposits made before the announcement are the ones that usually count.`,
    `Keep the deposit receipt and the redemption schedule; exit at the next window after a token announcement, or when the vault's yield trails its benchmark for 30 days.`,
  ],
  'doppler-finance': (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a Doppler Finance CeDeFi vault on ${firstChain(f)} — budget $10–25 in gas — and hold 30–60 days; CeDeFi vaults blend centralised custody with on-chain rails.`,
    `Read the custody arrangement before depositing: Doppler's yield depends on a centralised counterparty, so the position carries counterparty risk a pure DeFi vault does not — size it as a satellite.`,
    `Track the vault's reported yield and the custodian's disclosures weekly; a change in custodian or a withdrawal delay is an exit signal, not a detail.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Keep the deposit receipt and the custody terms; exit after a token announcement, or immediately if withdrawals slow or the custodian changes.`,
  ],
  'b14g': (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} of an accepted LST into a b14g restaking position on ${firstChain(f)} — budget $10–25 in gas — and hold 60–90 days; restaking rewards accrue on time-weighted deposits.`,
    `Pick the vault by its operator set and slashing terms, not by headline APY: b14g is Berachain restaking, so the operators securing the position are the risk you are actually taking.`,
    `If a vault partner runs a points season, deposits made before the season's snapshot are the ones that usually count — verify the program on the partner's own channels first; no native b14g points program is confirmed in the sealed snapshot.`,
    `Monitor operator performance and any slashing events weekly; a slashing event cuts principal, not just yield.`,
    `Keep the deposit receipt and the operator list; exit by withdrawing after a token announcement, or when the vault's operators change materially for the worse.`,
  ],
  noble: (f) => [
    `Bridge ${money(capitalFor(f.tvl_usd))} to Noble and use its native apps weekly for 30–60 days — budget $10–30 in bridge and gas fees; chain-adjacent farms reward sustained activity, not a single deposit.`,
    `Do not treat this as a normal DeFi farm: Noble is a Cosmos appchain, so any token case follows chain-token logic and the DeFi multiple on this row is a weak fit — size it small.`,
    `Use at least two different apps on the network each week so the activity reads as a real user, not a bridge-and-hold.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist.`,
    `Keep a log of weekly transactions; exit by bridging back after a token announcement, or when weekly activity costs more in fees than the position's option value.`,
  ],
  infinifi: (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into an infiniFi yield vault on ${firstChain(f)} — budget $10–20 in gas — and hold 30–60 days; yield vaults accrue on time-weighted deposits and auto-compound.`,
    `Read the vault's strategy sheet before depositing: infiniFi vaults run yield strategies whose risk is the strategy's risk, and the headline APY is not a promise.`,
    `Track the vault's net APY and drawdown weekly against the same strategy run directly; if the fee exceeds the convenience for a month, exit to the underlying.`,
    `Points-style farming is the norm for yield vaults, so if ${f.name} opens a season, deposits made before the season's snapshot are the ones that usually count — verify the program on the project's own channels first; no program is confirmed in the sealed snapshot.`,
    `Keep the deposit receipt and the strategy sheet; exit after a token announcement, or when the vault's strategy underperforms its benchmark for 30 days.`,
  ],
  'aegis-yusd': (f) => [
    `Open a ${money(capitalFor(f.tvl_usd))} delta-neutral basis position via Aegis YUSD on ${firstChain(f)} — budget $10–25 in gas and funding — and hold it 30–60 days through at least one funding cycle.`,
    `Watch the funding rate daily for the first week: basis trades earn when funding is positive and bleed when it flips negative, so a persistently negative rate is the exit signal, not a buying opportunity.`,
    `Keep the hedge ratio near 1:1 and check it after every large market move; an unhedged leg turns a basis farm into a directional bet, and YUSD is a yield-bearing stablecoin, so the long leg carries its own peg risk.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage and funding income, not by chasing a program that may not exist.`,
    `Record entry prices for both legs; unwind both legs together after a token announcement, or immediately if funding stays negative for a week.`,
  ],
  'apex-omni': (f) => [
    `Trade ${money(capitalFor(f.tvl_usd))} of perps volume through Apex Omni on ${firstChain(f)} over 30–60 days — budget $10–25 in fees — spreading the volume across at least four weeks so it reads as a real trader, not a wash.`,
    `Use limit orders where the venue rewards maker flow and keep positions small: perps allocations weight fee-paying volume and open interest held, not a single large trade.`,
    `Track funding and liquidation risk on every open position daily; a liquidation wipes the position and the usage history with it, so keep leverage under 3x.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by trading volume, not by chasing a program that may not exist.`,
    `Keep a log of weekly volume and fees paid; stop trading after a token announcement, or when the fees paid exceed the position's implied option value.`,
  ],
  // Re-admitted 2026-11-15 (verify.ts): nine genuine pre-token candidates the
  // house watchlist left out. Each override is written for that protocol's
  // actual mechanics, like the watchlist overrides above.
  'polymarket-international': (f) => [
    `Fund ${money(capitalFor(f.tvl_usd))} of USDC on Polygon and trade it across at least three live event markets on ${f.name} over 60–90 days — budget $5–15 in gas — spreading the trades across weeks so the volume reads as a real trader.`,
    `Leave some outcome shares open to expiry instead of flipping everything: prediction allocations weight resolved volume and shares held through settlement, not deposits parked in the account.`,
    `Trade both sides of markets you follow — buying YES and NO across different events — and avoid wash-trading your own orders; a judge of the venue's data can tell the difference, and a wash pattern is the fastest way to be filtered out.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by trading volume, not by chasing a program that may not exist; if a POLY token season opens, trading history from before the announcement is what usually counts.`,
    `Keep a log of weekly volume, fees and resolved positions; stop trading after a token announcement, or when the fees paid exceed the position's implied option value.`,
  ],
  'bitfi-basis': (f) => [
    `Open a ${money(capitalFor(f.tvl_usd))} delta-neutral basis position via ${f.name} on ${firstChain(f)} — budget $10–25 in gas and funding — and hold it 30–60 days through at least one funding cycle.`,
    `Watch the funding rate daily for the first week: basis trades earn when funding is positive and bleed when it flips negative, so a persistently negative rate is the exit signal, not a buying opportunity.`,
    `Keep the hedge ratio near 1:1 and re-check it after every large market move; an unhedged leg turns a basis farm into a directional bet, and BitFi's CeDeFi structure adds counterparty risk a pure on-chain vault does not.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage and funding income, not by chasing a program that may not exist.`,
    `Record entry prices for both legs; unwind both legs together after a token announcement, or immediately if funding stays negative for a week.`,
  ],
  'extended-perps': (f) => [
    `Trade ${money(capitalFor(f.tvl_usd))} of perps volume through Extended on ${firstChain(f)} over 30–60 days — budget $10–25 in fees — spreading the volume across at least four weeks so it reads as a real trader, not a wash.`,
    `Use limit orders where the venue rewards maker flow and keep positions small: perps allocations weight fee-paying volume and open interest held, not a single large trade.`,
    `Track funding and liquidation risk on every open position daily; a liquidation wipes the position and the usage history with it, so keep leverage under 3x.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by trading volume, not by chasing a program that may not exist.`,
    `Keep a log of weekly volume and fees paid; stop trading after a token announcement, or when the fees paid exceed the position's implied option value.`,
  ],
  'cian-yield-layer': (f) => [
    `Deposit ${money(capitalFor(f.tvl_usd))} into a CIAN yield-layer strategy on ${firstChain(f)} — budget $10–20 in gas — and hold 30–60 days; yield-layer allocations weight deposited balance and time held.`,
    `Read the strategy sheet before depositing: CIAN routes across lending and staking strategies, and the risk of the position is the risk of the underlying mix, not of the layer itself.`,
    `Track the strategy's net APY and drawdown weekly against the same strategies run directly; if the layer's fee exceeds the convenience for a month, exit to the underlying.`,
    `Points-style farming is the norm for yield aggregators, so if ${f.name} opens a season, deposits made before the season's snapshot are the ones that usually count — verify the program on the project's own channels first; no program is confirmed in the sealed snapshot.`,
    `Keep the deposit receipt and the strategy sheet; exit after a token announcement, or when the strategy underperforms its benchmark for 30 days.`,
  ],
  'defi-saver-asset-management': (f) => [
    `Open a ${money(capitalFor(f.tvl_usd))} managed CDP position through DeFi Saver on ${firstChain(f)} at 40–50% loan-to-value — budget $10–25 in gas — and hold it 30–60 days; CDP usage is measured by minted supply held over time.`,
    `Turn on DeFi Saver's automation (auto-repay and auto-boost) with conservative thresholds: the manager's value is keeping the position in range while you are away, and a liquidation wipes the position and its usage history.`,
    `Check the collateral ratio and the automation log weekly; if the ratio drifts under 150%, top up collateral rather than waiting for the automation to fire at the edge.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist; DeFi Saver has never issued a token, so treat the launch case as an option, not a promise.`,
    `Record the position id and every transaction hash; unwind only after a token announcement, or when the manager's fees exceed the automation value it adds.`,
  ],
  'arcus-perps': (f) => [
    `Trade ${money(capitalFor(f.tvl_usd))} of perps volume through Arcus on Robinhood Chain over 14–30 days — budget $10–25 in fees — spreading the volume across at least two weeks so it reads as a real trader, not a wash.`,
    `Bridge funds to Robinhood Chain first and keep a gas reserve on the new chain: a young chain's bridge and gas behaviour is the first thing that breaks a farm, and Arcus has only been live a few months.`,
    `Use limit orders where the venue rewards maker flow and keep leverage under 3x; a liquidation wipes the position and the usage history with it.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by trading volume, not by chasing a program that may not exist.`,
    `Keep a log of weekly volume and fees paid; stop trading after a token announcement, or when the fees paid exceed the position's implied option value.`,
  ],
  'azverse-perps': (f) => [
    `Trade ${money(capitalFor(f.tvl_usd))} of perps volume through AZverse on ${firstChain(f)} over 14–30 days — budget $10–25 in fees — spreading the volume across at least two weeks so it reads as a real trader, not a wash.`,
    `Use limit orders where the venue rewards maker flow and keep positions small: perps allocations weight fee-paying volume and open interest held, not a single large trade.`,
    `Track funding and liquidation risk on every open position daily; AZverse has only been live a few months, so treat the venue itself as the biggest risk — keep leverage under 3x and size it small.`,
    `No points program is confirmed in the sealed snapshot for ${f.name} — farm by trading volume, not by chasing a program that may not exist.`,
    `Keep a log of weekly volume and fees paid; stop trading after a token announcement, or when the fees paid exceed the position's implied option value.`,
  ],
};

/** The generic (templated) plan: built from real per-row facts only — name,
 *  first chain, category, TVL tier, age. Five steps, every one carrying a
 *  concrete cost or duration. */
function templateSteps(f: RowFacts): string[] {
  const cap = money(capitalFor(f.tvl_usd));
  const dur = durationFor(f.age_days);
  const chain = firstChain(f);
  const pts = pointsStatus(f.category);
  const pointsStep =
    pts === 'inferred'
      ? `Points-style farming is the norm for ${f.category}, so if ${f.name} opens a season, deposits made before the season's snapshot are the ones that usually count — verify the program on the project's own channels before adding capital; no program is confirmed in the sealed snapshot.`
      : `No points program is confirmed in the sealed snapshot for ${f.name} — farm by usage, not by chasing a program that may not exist; if a season opens later, positions open before the announcement are the ones that usually count.`;
  return [
    `Open ${f.name} on ${chain} with ${cap} plus $5–25 in gas for the first transactions, and use a fresh wallet so the position's history is clean and auditable.`,
    coreAction(f),
    `Hold the position for the full ${dur} window without withdrawing — time-weighted balances are what allocations reward, so an early exit resets the clock and the usage history.`,
    pointsStep,
    `Check the position weekly for TVL growth, yield changes and any token announcement; if your share of TVL falls while total TVL rises, top up ${cap} or accept the dilution — the expected airdrop value is ${money(
      Math.round(f.implied_base * 0.05),
    )}–${money(Math.round(f.implied_base * 0.25))} at a 5–25% community share of the ${money(
      f.implied_base,
    )} implied FDV, and points outstanding are unknown, so no per-user value can be promised.`,
    `Record every transaction hash and screenshot the dashboard at entry; exit only after a token announcement, or when the position's implied value per dollar falls below your entry cost.`,
  ];
}

/** Full farm plan for one board row. Overrides win where curated; everything
 *  else is templated from the row's own facts. */
export function farmPlanFor(f: RowFacts): FarmPlan {
  const override = OVERRIDES[f.slug];
  const steps = override !== undefined ? override(f) : templateSteps(f);
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

/** Slugs with a curated (hand-written, protocol-specific) farm plan. */
export function curatedSlugs(): string[] {
  return Object.keys(OVERRIDES).sort();
}
