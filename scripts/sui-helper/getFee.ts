import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { ethers } from 'ethers';
import { getSuiClient, getSuiConfig, type SuiNetworkName } from './suiNetwork';

/**
 * Calculates CCIP fee for a cross-chain message
 * @param latestOnRampPackageId - Latest OnRamp package ID for the transaction
 */
export async function getFee(
    latestOnRampPackageId: string,
    ccipObjectRef: string,
    destChainSelector: string,
    receiver: Uint8Array,
    data: Uint8Array,
    tokenAddresses: string[],
    tokenAmounts: bigint[],
    feeTokenType: string,
    feeTokenMetadataId: string,
    extraArgs: Uint8Array,
    networkName: SuiNetworkName = 'suiTestnet'
) {
    const suiConfig = getSuiConfig(networkName);
    const suiClient = getSuiClient(networkName);
    
    const tx = new Transaction();

    tx.moveCall({
        package: latestOnRampPackageId,
        module: suiConfig.ccipOnrampModuleName,
        function: 'get_fee',
        typeArguments: [feeTokenType],
        arguments: [
            tx.object(ccipObjectRef),
            tx.object(suiConfig.clockObjectId),
            tx.pure.u64(destChainSelector),
            tx.pure.vector('u8', receiver),
            tx.pure.vector('u8', data),
            tx.pure.vector('address', tokenAddresses),
            tx.pure.vector('u64', tokenAmounts),
            tx.object(feeTokenMetadataId),
            tx.pure.vector('u8', extraArgs),
        ],
    });

    // Use devInspectTransactionBlock for read-only calls (no gas cost, no signer needed)
    const result = await suiClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: ethers.ZeroHash,
    });

    if (result.results && result.results[0]?.returnValues && result.results[0].returnValues[0]) {
        const returnValue = result.results[0].returnValues[0];
        return bcs.u64().parse(new Uint8Array(returnValue[0]));
    } else {
        throw new Error('No return value from get_fee call, possibly unsupported chain.');
    }
} 