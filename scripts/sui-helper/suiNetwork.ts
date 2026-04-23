import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { networkConfig } from '../../helperConfig';

export type SuiNetworkName = 'suiTestnet' | 'suiMainnet';
export type SuiNetworkSelection = SuiNetworkName | 'auto';

export const getSuiConfig = (networkName: SuiNetworkName = 'suiTestnet') =>
  networkName === networkConfig.suiMainnet.networkName ? networkConfig.suiMainnet : networkConfig.sui;

export const getSuiClient = (networkName: SuiNetworkName = 'suiTestnet') =>
  new SuiClient({
    url: getFullnodeUrl(networkName === networkConfig.suiMainnet.networkName ? 'mainnet' : 'testnet'),
  });

export const resolveSuiNetworkName = (
  selection: SuiNetworkSelection,
  destChainNetworkName: string
): SuiNetworkName => {
  if (selection === 'suiTestnet' || selection === 'suiMainnet') {
    return selection;
  }

  return destChainNetworkName.includes('Mainnet') ? 'suiMainnet' : 'suiTestnet';
};
