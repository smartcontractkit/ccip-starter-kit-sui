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
    }

    // Move call aborted or returned no result. Surface the real diagnostic
    // instead of the historic "possibly unsupported chain" guess.
    //
    // When devInspect hits a Move abort, `result.error` holds the abort string
    // (e.g. "MoveAbort(MoveLocation { module: ModuleId { address: 0x…,
    // name: Identifier(\"fee_quoter\") }, function: 12, instruction: 45,
    // function_name: Some(\"get_validated_fee\") }, 3)"). The trailing integer
    // is the on-chain error constant defined in the aborting module; look it
    // up in chainlink-sui/contracts/ccip/ccip/sources/{fee_quoter,onramp}.move.
    console.error('--- get_fee devInspect failure ---');
    console.error('destChainSelector:', destChainSelector);
    console.error('latestOnRampPackageId:', latestOnRampPackageId);
    console.error('ccipObjectRef:', ccipObjectRef);
    console.error('feeTokenType:', feeTokenType);
    console.error('feeTokenMetadataId:', feeTokenMetadataId);
    console.error('receiver (hex):', '0x' + Buffer.from(receiver).toString('hex'));
    console.error('extraArgs (hex):', '0x' + Buffer.from(extraArgs).toString('hex'));
    console.error('tokenAddresses:', tokenAddresses);
    console.error('tokenAmounts:', tokenAmounts.map((a) => a.toString()));
    console.error('devInspect result:', JSON.stringify(result, null, 2));
    console.error('--- end diagnostic ---');

    if (result.error) {
        throw new Error(`get_fee aborted: ${result.error}`);
    }
    throw new Error('No return value from get_fee call, possibly unsupported chain.');
} 