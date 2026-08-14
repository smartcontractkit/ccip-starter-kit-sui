import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { ethers } from 'ethers';
import { getObjectFromPackage } from './getObjectFromPackage';
import { getSuiClient, getSuiConfig, type SuiNetworkName } from './suiNetwork';

export async function getOnRampFromRouter(
    destChainSelector: string,
    networkName: SuiNetworkName = 'suiTestnet'
) {
    const suiConfig = getSuiConfig(networkName);
    const suiClient = getSuiClient(networkName);

    console.log(
        `\n📖 Reading OnRamp for chain selector: ${destChainSelector} on ${suiConfig.networkName}`
    );

    const tx = new Transaction();

    tx.moveCall({
        package: suiConfig.ccipRouterPackageId,
        module: suiConfig.ccipRouterModuleName,
        function: 'get_on_ramp',
        typeArguments: [],
        arguments: [
            tx.object(await getObjectFromPackage(suiConfig.ccipRouterPackageId, 'RouterState', networkName)),
            tx.pure.u64(destChainSelector)
        ],
    });

    // Use devInspectTransactionBlock for read-only calls (no gas cost, no signer needed)
    const result = await suiClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: ethers.ZeroHash,
    });

    if (result.results && result.results[0]?.returnValues && result.results[0].returnValues[0]) {
        const returnValue = result.results[0].returnValues[0];
        // The return value is an address (32 bytes)
        return bcs.Address.parse(new Uint8Array(returnValue[0]));
    }

    // See getFee.ts for the same diagnostic pattern — surface `result.error`
    // (Move abort) instead of throwing a generic "unsupported chain" string.
    console.error('--- get_on_ramp devInspect failure ---');
    console.error('destChainSelector:', destChainSelector);
    console.error('ccipRouterPackageId:', suiConfig.ccipRouterPackageId);
    console.error('devInspect result:', JSON.stringify(result, null, 2));
    console.error('--- end diagnostic ---');

    if (result.error) {
        throw new Error(`get_on_ramp aborted: ${result.error}`);
    }
    throw new Error('No return value from get_on_ramp call, possibly unsupported chain.');
} 