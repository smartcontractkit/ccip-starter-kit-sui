import { getObjectFromPackage } from '../../sui-helper/getObjectFromPackage';
import { getTokenConfig } from '../../sui-helper/getTokenConfig';
import { getOnRampFromRouter } from '../../sui-helper/getOnRampFromRouter';
import { getCoinDetails } from '../../sui-helper/getCoinDetails';
import { getLatestCcipPackageId } from '../../sui-helper/getLatestCcipPackageId';
import { getSuiConfig, type SuiNetworkName } from '../../sui-helper/suiNetwork';
import { evmAddressToBytes32, parseVecU8 } from '../../utils/utils';

export interface TokenConfig {
  tokenPoolPackageId: string;
  tokenPoolModule: string;
  tokenPoolStateAddress?: string;
  tokenStateAddress?: string;
}

export interface CoinMetadata {
  id: string;
  decimals: number;
  symbol: string;
}

export interface CcipObjects {
  ccipObjectRef: string;
  latestCcipPackageId: string;    // Latest CCIP package ID for transactions
  latestOnRampPackageId: string;  // Latest OnRamp package ID for transactions
  onrampState: string;
}

export interface TokenTransferInfo {
  tokenConfig: TokenConfig;
  tokenMetadata: CoinMetadata;
  poolKind: 'burn_mint' | 'lock_release' | 'managed_pool';
}

/**
 * Prepares common CCIP objects needed for any CCIP transaction
 * @param chainSelector - Destination chain selector
 * @returns CCIP objects (CCIPObjectRef, OnRamp package ID, OnRamp state)
 */
export async function prepareCcipObjects(
  chainSelector: string,
  networkName: SuiNetworkName = 'suiTestnet'
): Promise<CcipObjects> {
  const suiConfig = getSuiConfig(networkName);

  // Use original CCIP package ID for getObjectFromPackage
  const ccipObjectRef = await getObjectFromPackage(
    suiConfig.ccipPackageId,
    'CCIPObjectRef',
    networkName
  );

  // Get latest CCIP package ID for transactions
  const latestCcipPackageId = await getLatestCcipPackageId(
    suiConfig.ccipPackageId,
    'ccip',
    networkName
  );

  // Get original OnRamp package ID from Router
  const originalOnRampPackageId = await getOnRampFromRouter(chainSelector, networkName);

  // Use original OnRamp package ID for getObjectFromPackage
  const onrampState = await getObjectFromPackage(
    originalOnRampPackageId,
    'OnRampState',
    networkName
  );

  // Get latest OnRamp package ID for transactions
  const latestOnRampPackageId = await getLatestCcipPackageId(
    originalOnRampPackageId,
    'ccip_onramp',
    networkName
  );

  return {
    ccipObjectRef,
    latestCcipPackageId,
    latestOnRampPackageId,
    onrampState
  };
}

/**
 * Converts an EVM address to bytes for use in CCIP messages
 * @param evmAddress - EVM address (0x...)
 * @returns Uint8Array representing the address in bytes32 format
 */
export function prepareReceiver(evmAddress: string): Uint8Array {
  const receiverBytes32 = evmAddressToBytes32(evmAddress);
  return parseVecU8(receiverBytes32);
}

/**
 * Prepares token transfer information including config and metadata
 * @param coinMetadataId - Coin metadata ID (e.g., "0x...")
 * @returns Token configuration and metadata
 */
export async function prepareTokenTransfer(
  coinMetadataId: string,
  networkName: SuiNetworkName = 'suiTestnet'
): Promise<TokenTransferInfo> {
  // Get the token config from CCIP Token Admin Registry
  const tokenConfig = await getTokenConfig(coinMetadataId, networkName);
  if (!tokenConfig) {
    throw new Error(`Token with Coin Metadata ID as ${coinMetadataId} is not registered in the CCIP Token Admin Registry.`);
  }
  if (!tokenConfig.tokenPoolStateAddress) {
    throw new Error('Token pool state address is undefined.');
  }

  // Get token metadata for decimals and other info
  const tokenDetails = await getCoinDetails(coinMetadataId, networkName);
  const tokenMetadata = {
    id: coinMetadataId,
    decimals: tokenDetails.decimals,
    symbol: tokenDetails.symbol
  };

  // Determine pool kind from module name
  const poolKind = tokenConfig.tokenPoolModule.includes('burn_mint')
    ? 'burn_mint'
    : tokenConfig.tokenPoolModule.includes('lock_release')
      ? 'lock_release'
      : 'managed_pool';

  return {
    tokenConfig,
    tokenMetadata,
    poolKind
  };
}

/**
 * Parses message data from string or hex
 * @param input - Message data as string or hex
 * @returns Uint8Array representation
 */
export function prepareMessageData(input: string): Uint8Array {
  return parseVecU8(input);
}