import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { SuiHTTPTransport } from '@mysten/sui/client';
import { networkConfig } from '../../helperConfig';
import { retryingFetch } from './retryingFetch';

export type SuiNetworkName = 'suiTestnet' | 'suiMainnet';
export type SuiNetworkSelection = SuiNetworkName | 'auto';

export const getSuiConfig = (networkName: SuiNetworkName = 'suiTestnet') =>
  networkName === networkConfig.suiMainnet.networkName ? networkConfig.suiMainnet : networkConfig.sui;

// Track already-logged (network, url) pairs so a script that calls getSuiClient
// many times only prints the RPC banner once per unique endpoint per run.
const _loggedRpcs = new Set<string>();

export const getSuiClient = (networkName: SuiNetworkName = 'suiTestnet') => {
  // Allow overriding the Sui fullnode via env, mirroring the EVM chains'
  // `rpcUrlEnv` pattern in helperConfig.ts. The public Sui fullnodes
  // (getFullnodeUrl(...)) are aggressively rate-limited and periodically 404
  // on suix_* methods, so private/proxy RPCs are recommended for anything
  // beyond a one-off test.
  const envUrl =
    networkName === networkConfig.suiMainnet.networkName
      ? process.env.SUI_MAINNET_RPC_URL
      : process.env.SUI_TESTNET_RPC_URL;

  const isFromEnv = !!(envUrl && envUrl.length > 0);
  const url = isFromEnv
    ? envUrl!
    : getFullnodeUrl(
        networkName === networkConfig.suiMainnet.networkName ? 'mainnet' : 'testnet'
      );

  const bannerKey = `${networkName}::${url}`;
  if (!_loggedRpcs.has(bannerKey)) {
    _loggedRpcs.add(bannerKey);
    const source = isFromEnv
      ? `env ${networkName === 'suiMainnet' ? 'SUI_MAINNET_RPC_URL' : 'SUI_TESTNET_RPC_URL'}`
      : 'public fallback (getFullnodeUrl)';
    console.log(`🌐 Sui RPC [${networkName}]: ${url}  (source: ${source})`);
  }

  // Wrap the transport with a retrying fetch so transient 4xx/5xx/network
  // errors from flaky fullnodes don't fail whole transactions. See
  // scripts/sui-helper/retryingFetch.ts for retry policy + env-var knobs.
  return new SuiClient({
    transport: new SuiHTTPTransport({ url, fetch: retryingFetch }),
  });
};

export const resolveSuiNetworkName = (
  selection: SuiNetworkSelection,
  destChainNetworkName: string
): SuiNetworkName => {
  if (selection === 'suiTestnet' || selection === 'suiMainnet') {
    return selection;
  }

  return destChainNetworkName.includes('Mainnet') ? 'suiMainnet' : 'suiTestnet';
};
