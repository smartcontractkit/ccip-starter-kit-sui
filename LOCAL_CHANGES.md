# Local changes vs `origin/main`

**Branch:** `improve-scripts` (1 commit ahead: `0af196e improve scripts for token handling`) + uncommitted working-tree edits.
**Baseline:** `origin/main` (`a3ebf2e`).
**Scope:** Sui↔EVM CCIP scripts and the `ccip_message_receiver` Move package. Solana work is present in the tree but **Work-In-Progress and not functional** — see the last section.

This document describes what changed locally and the new features / new behaviors it introduces. It is not a commit message; it is a map for anyone (including future-you) reviewing the working tree before it lands on `main`.

---

## TL;DR

1. **Sui mainnet** is now a first-class network alongside testnet — every Sui script is network-aware.
2. **Latest-package-id resolution** is centralized in `helperConfig.ts` with a single source of truth, replacing scattered on-chain derivation walks.
3. **RPC resolution is consistent** across all Sui scripts (one env-aware client factory, retrying fetch, no more ad-hoc `new SuiClient({ url: getFullnodeUrl(...) })`).
4. **EVM receiver deploys are fire-and-forget** — they print the tx hash + deterministic contract address and exit, instead of blocking up to 300s waiting for mining.
5. **OP-Stack broken-`estimateGas`** RPC endpoints are worked around so sends/approves/faucets don't fail opaquely.
6. **Sui→EVM sends surface real Move aborts**, handle fee-coin leftovers, and can target the original OnRamp.
7. **Receiver Move package repinned** to a durable chainlink-sui commit and republished on Sui mainnet.
8. **Solana integration is scaffolded but WIP — nothing Solana-bound is functional end-to-end.**

---

## 1. Sui mainnet support (new)

`helperConfig.ts` gains a `suiMainnet` config block (chain selector, clock/deny-list object IDs, CCIP/router/onramp/offramp package IDs, LINK/SUI/BnM coin metadata IDs, `knownStateObjects`, `knownLatestPackageIds`, receiver name/module). These are sourced from `chainlink-deployments/domains/ccip/mainnet/addresses.json`.

- `SuiNetworkName = 'suiTestnet' | 'suiMainnet'` is the type threaded through every Sui helper.
- `getSuiConfig(networkName)` returns the `sui` or `suiMainnet` block.
- The receiver's package ID is **not** hardcoded — only its package/module names are. The ID is supplied at runtime via CLI (`--suiReceiver` / `--receiver`), so republishing the receiver never desyncs the config.

**Behavior:** scripts that were implicitly testnet-only now accept `--network` with choices `['suiTestnet', 'suiMainnet']`, defaulting to `suiTestnet` (so existing testnet invocations are unchanged). Suiscan explorer links are built from the resolved network.

---

## 2. Centralized latest-package-id resolution (new mechanism)

Upgradeable Sui CCIP packages (onramp / offramp / the `ccip` state package) get new package IDs on each upgrade. Resolving "the latest one" used to require an on-chain `getOwnedObjects` derivation walk that returns empty on RPCs which don't index package-address-as-owner mappings.

Now the derivation metadata lives in one place — `helperConfig.ts`:

```ts
export const PACKAGE_UPGRADE_CONFIGS: Record<string, PackageUpgradeConfig> = {
  ccip_onramp:  { moduleName: 'onramp',       statePointerType: 'OnRampStatePointer',  ... },
  ccip_offramp: { moduleName: 'offramp',      statePointerType: 'OffRampStatePointer', ... },
  ccip:         { moduleName: 'state_object', statePointerType: 'CCIPObjectRefPointer', ... },
};
```

`getLatestCcipPackageId()` (`scripts/sui-helper/getLatestCcipPackageId.ts`) is a 4-stage resolver:

1. Router bypass — `router` package type is never upgraded, returned as-is.
2. `knownLatestPackageIds[packageType]` fast-path — hardcoded latest IDs per network (the same data `addresses.json` exposes as `SuiLatestCCIPPackageID` etc.), avoiding the broken derivation walk entirely.
3. On-chain derivation via `PACKAGE_UPGRADE_CONFIGS` (when no known ID).
4. Original-package fallback.

`CcipPackageType` is now derived as `keyof typeof PACKAGE_UPGRADE_CONFIGS`, so adding a package is a one-line config edit. `getObjectFromPackage()` mirrors this with a `knownStateObjects` fast-path. The thin re-export in `scripts/sui-helper/derive-latest-package-id/config.ts` keeps the existing import graph working while `helperConfig.ts` remains the single source of truth (co-located with `knownLatestPackageIds` / `knownStateObjects`).

---

## 3. Consistent, env-aware Sui RPC resolution (new behavior)

Before: scripts constructed their own `new SuiClient({ url: getFullnodeUrl('testnet') })`, so RPC was hardcoded to the public testnet fullnode — which 404s on `sui_getNormalizedMoveFunction` during transaction build, and couldn't reach mainnet.

Now there is one factory — `getSuiClient(networkName)` in `scripts/sui-helper/suiNetwork.ts`:

- Reads `SUI_MAINNET_RPC_URL` / `SUI_TESTNET_RPC_URL` from env, falling back to `getFullnodeUrl(...)`.
- Wraps `fetch` with a retrying wrapper (`scripts/sui-helper/retryingFetch.ts`, new) — retries 404/408/425/429/5xx and network errors with exponential backoff, since some Sui fullnodes intermittently flake on individual batched RPC calls and would otherwise fail the whole `Transaction` build. Configurable via `SUI_RPC_RETRY_MAX_ATTEMPTS` / `SUI_RPC_RETRY_BASE_DELAY_MS`.
- Logs a banner so it's visible which RPC a run is hitting.

Every Sui script now goes through this factory. Files routed onto it:

- `scripts/evm2sui/checkMsgExecutionStateOnSui.ts`
- `scripts/evm2sui/getLatestMessageOnSui.ts`
- `scripts/evm2sui/getTokenBalance.ts`
- `scripts/withdrawTokensFromReceiver.ts`
- `scripts/deploy/sui/registerReceiver.ts`
- `scripts/faucets/sui/dripCCIPBnMToken.ts`

and the helpers they call (`getCoinDetails`, `getFee`, `getObjectFromPackage`, `getOnRampFromRouter`) now accept and propagate a `networkName` argument (default `'suiTestnet'`, so unchanged for existing callers).

**Behavior:** RPC URLs are resolved identically everywhere (env var → default fullnode), mainnet works, and transient RPC flakiness is absorbed instead of surfacing as build failures.

---

## 4. EVM receiver deploy: fire-and-forget + sane fee strategy (new behavior)

`scripts/deploy/evm/deployReceiver.ts` previously blocked up to 300s racing `contract.waitForDeployment()` against a `--timeoutMs` deadline — pointless on mainnet where a deploy can take minutes to confirm.

Now it:

- Broadcasts the deploy tx (awaited, to get the hash).
- Prints the tx hash + explorer link.
- Prints the **deterministic** contract address via `contract.getAddress()` (ethers v6 computes the CREATE address from `{ from, nonce }` of the sent tx the moment `deploy()` resolves — no receipt/mining needed).
- **Exits.** No mining wait, no 300s hang.

It also builds a real fee strategy instead of the old flat 25-gwei fallback:

- **EIP-1559 chains:** `maxFeePerGas` anchored on `eth_gasPrice` ×2 headroom (some RPCs misreport `maxFeePerGas` low, which previously let the floored priority tip exceed the cap and abort); `maxPriorityFeePerGas` floored at `--priorityFeeGwei` (default 1), clamped to ≤ half the cap.
- **Legacy chains:** gasPrice bumped by `--gasPriceBumpPct` (default 10%) over the RPC-reported price, so the tx is competitive instead of landing below base fee and sitting pending forever.

Removed: `--timeoutMs`. Kept: `--gasLimit` (default 3,000,000), `--priorityFeeGwei`, `--gasPriceBumpPct`.

---

## 5. OP-Stack broken-`estimateGas` workaround (new)

Some OP-Stack RPC endpoints return `"intrinsic gas too high"` with **no revert data** for writes that estimate fine on healthy nodes (`eth_call` succeeds) — and they do this for *every* write, not just `ccipSend` (ERC20 `approve`, faucet drips, etc.). ethers skips gas estimation when an explicit `gasLimit` is supplied.

New in `scripts/utils/utils.ts`:

- `sendCcipWithGasFallback(...)` — estimates normally; if estimation fails **with** revert data, rethrows (real revert → `handleError` decodes it); if it fails **without** revert data (opaque), retries the `ccipSend` with a generous explicit `gasLimit` (default 3,000,000, a cap — unused gas is refunded, and far under OP's 40M block limit).
- `applyGasEstimateFallback(provider)` — patches the provider's `estimateGas` to fall back the same way, covering **all** writes from scripts using that provider (approves, drips, etc.).

All `evm2sui/ccipSend*Router.ts` scripts call `applyGasEstimateFallback(provider)` up front and `sendCcipWithGasFallback(...)` for the `ccipSend` call. The opaque-failure warning also tells the user to switch `<chain>_RPC_URL` to a healthy endpoint (e.g. `https://sepolia.optimism.io`).

---

## 6. Sui→EVM send robustness (new behaviors)

`scripts/sui2evm/ccipSend*Router.ts` and `scripts/sui2evm/core/*`:

- **Real aborts surfaced.** `signAndExecuteTransaction` now requests `showEffects`/`showEvents` and checks `effects.status`; a Move abort is thrown as `ccip_send failed on-chain: <error>` instead of masquerading as "No events found in transaction".
- **Native fee-coin handling fixed.** `handleFees.ts` splits a dedicated fee coin off `tx.gas` (rather than using `tx.gas` directly), so the balance assertion is independent of the auto-selected gas budget — avoids `EUnexpectedWithdrawAmount` when `balance(tx.gas) - gas_budget` dips below the on-chain fee. For native-fee sends the leftover fee coin is transferred back to the sender (`ccip_send` borrows it by `&mut` and only withdraws the actual fee).
- **`--useOriginalOnramp` flag.** `prepareCcipMessage.ts` / `buildCcipSendPTB.ts` can target the *original* (non-upgraded) Sui OnRamp package instead of deriving the latest. The original stays callable (Sui packages are immutable and live after upgrade) but its FeeQuoter config may predate newer dest chains, so sends to recently-added chains can abort with this enabled — it's opt-in for exercising the original deployment only.
- **Gas limit bump.** `ccipSendMsgRouter` default gas limit `100_000 → 150_000`.
- **`messageReceiver` support** in `buildCcipSendPTB.ts` (defaults to `receiver` for EVM back-compat) — groundwork for SVM destinations where the CCIP `message.receiver` differs from the token recipient. EVM callers are unaffected.

---

## 7. Receiver Move package: durable repin + mainnet republish

`modules/ccip_message_receiver/`:

- **`Move.toml`** — `ccip` dependency repinned from the deletable `add-chain-selectors` branch to durable commit `1239126e21ed0257fa190aa87893f14730ef7e04` (the tip of chainlink-sui's `develop`, merged via PR #478). No more "branch could be deleted" risk.
- **`Move.lock`** — `pinned.mainnet.*` group re-resolved to `1239126e…` (ccip, fast_mcms, mcms). The `pinned.testnet.*` group still carries the pre-repin commit and will self-heal to `1239126e…` on the next testnet-targeted build (Move re-resolves on `Move.toml` rev ≠ lock rev). Not a correctness issue.
- **`Published.toml`** — receiver republished on **Sui mainnet** against the new commit: `published-at`/`original-id` → `0x99550482305f047ecd8035e0d88a18b7717b83d008b92c5abc08266622985821`, `toolchain-version` `1.68.1 → 1.76.0`, new `upgrade-capability`. The old published address has zero references in tracked source.

The receiver module itself is `ccip_message_receiver::dummy_receiver`, `version()` → `"DummyReceiver 1.6.0"` — an older snapshot of upstream `ccip_dummy_receiver`.

---

## 8. Housekeeping

- **Deleted** `scripts/evm2sui/_diag_sui_src_tx.ts` — an orphaned one-off diagnostic script (hardcoded digest, no yargs, no importers/docs).
- **`getTokenBalance.ts`** retained — it's an undocumented-but-active CLI utility, now routed through the env-aware client.
- `.env.example`, `package.json`, `package-lock.json` updated to match the above (new deps for Solana scaffolding — see below — and env-var documentation).

---

## 9. Solana — ⚠️ WORK IN PROGRESS, NOT FUNCTIONAL

A Solana Devnet integration has been **scaffolded** in the tree but is **not functional end-to-end**. Treat all Solana-related code as in-progress: it compiles/imports but has **not** been verified to send or receive a CCIP message on Solana Devnet, and the Solana → Sui direction is not implemented at all.

Present (untracked / new):

- `helperConfig.ts` → `solanaDevnet` config + `supportedSolanaChains` (Router/OffRamp/FeeQuoter/RMN/CCIP-BnM/LINK/WSOL/USDC addresses for Solana Devnet, selector `16423721717087811551`).
- `scripts/solana-helper/` — `solanaAddress.ts` (base58 decode, SDK-free), `svmExtraArgs.ts` (`SVMExtraArgsV1` BCS encoder matching the Sui Move `encode_svm_extra_args_v1`), `solanaConfig.ts`, `solanaPda.ts` (SDK-free PDA derivation), `deriveReceiverPdas.ts`, `resolveReceiverAccounts.ts`, `solanaAccountKind.ts`.
- `scripts/sui2solana/` — `ccipSendMsgRouter.ts`, `ccipSendTokenRouter.ts`, `ccipSendMsgAndTokenRouter.ts` (Sui → Solana Devnet send scripts).
- `scripts/deploy/solana/setupReceiver.ts` — receiver `initialize(router)` + `approve_sender(...)` (the one place that signs on Solana and pulls in `@solana/web3.js`).
- `SOLANA.md` — design notes for the Sui → Solana Devnet direction.

Caveats (from `SOLANA.md` + current state):

- **Sui → Solana** send scripts exist but are **unverified / WIP**.
- **Solana → Sui is not implemented** — it requires the full Chainlink CCIP Solana Anchor client (IDLs), `@solana/web3.js` + `@solana/spl-token`, per-token `TokenPoolLookupTable` accounts, and Borsh instruction encoding. That is a net-new SDK layer, not a config addition.
- The SVM extra-args / `messageReceiver` plumbing in `buildCcipSendPTB.ts` (Section 6) is groundwork for this and should not be considered a working SVM path yet.

**Bottom line for Solana:** the directory structure, config, and BCS/PDA helpers are in place, but nothing Solana-bound is functional. Do not rely on it.

---

## Files changed (vs `origin/main`)

Tracked (32 files, +1691 / −170):

| Area | File |
| --- | --- |
| Config (centralization + mainnet + solana scaffold) | `helperConfig.ts` |
| Receiver Move package | `modules/ccip_message_receiver/{Move.toml,Move.lock,Published.toml}` |
| Deps / env | `.env.example`, `package.json`, `package-lock.json` |
| EVM deploy | `scripts/deploy/evm/deployReceiver.ts` |
| Sui deploy / faucet | `scripts/deploy/sui/registerReceiver.ts`, `scripts/faucets/sui/dripCCIPBnMToken.ts` |
| EVM→Sui sends + workaround | `scripts/evm2sui/ccipSendMsgRouter.ts`, `ccipSendMsgAndTokenRouter.ts`, `ccipSendTokenRouter.ts`, `scripts/utils/utils.ts` |
| EVM→Sui queries (network-aware) | `scripts/evm2sui/checkMsgExecutionStateOnSui.ts`, `getLatestMessageOnSui.ts`, `getTokenBalance.ts` |
| Sui→EVM sends + core | `scripts/sui2evm/ccipSendMsgRouter.ts`, `ccipSendMsgAndTokenRouter.ts`, `ccipSendTokenRouter.ts`, `core/buildCcipSendPTB.ts`, `core/prepareCcipMessage.ts`, `core/handleFees.ts` |
| Sui helpers | `scripts/sui-helper/suiNetwork.ts`, `getCoinDetails.ts`, `getFee.ts`, `getLatestCcipPackageId.ts`, `getObjectFromPackage.ts`, `getOnRampFromRouter.ts`, `derive-latest-package-id/{config.ts,README.md}` |
| Withdraw | `scripts/withdrawTokensFromReceiver.ts` |

Untracked (new, not yet committed):

| Area | Path |
| --- | --- |
| Solana sends (WIP) | `scripts/sui2solana/{ccipSendMsgRouter,ccipSendTokenRouter,ccipSendMsgAndTokenRouter}.ts` |
| Solana helpers (WIP) | `scripts/solana-helper/*.ts` |
| Solana deploy (WIP) | `scripts/deploy/solana/setupReceiver.ts` |
| Sui RPC resilience | `scripts/sui-helper/retryingFetch.ts` |
| Notes | `SOLANA.md` |

> `retryingFetch.ts` and the Solana files are **untracked** — they exist on disk but are not yet in `git` history. Run `git status` and review with `git diff origin/main` before staging.
