import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { ethers } from "ethers";
import { getObjectFromPackage } from './getObjectFromPackage';
import { getLatestCcipPackageId } from './getLatestCcipPackageId';
import { getSuiClient, getSuiConfig, type SuiNetworkName } from './suiNetwork';

/**
 * Gets token configuration from CCIP Token Admin Registry
 * @param coinMetadataId - Coin metadata object ID
 * @returns Token configuration including pool info and addresses
 */
export async function getTokenConfig(
    coinMetadataId: string,
    networkName: SuiNetworkName = 'suiTestnet'
) {
    const suiConfig = getSuiConfig(networkName);
    const suiClient = getSuiClient(networkName);

    // Use original package ID for getObjectFromPackage
    const ccipObjectRef = await getObjectFromPackage(suiConfig.ccipPackageId, 'CCIPObjectRef', networkName);
    
    // Get latest CCIP package ID for transaction
    const latestCcipPackageId = await getLatestCcipPackageId(suiConfig.ccipPackageId, 'ccip', networkName);

    const tx = new Transaction();

    tx.moveCall({
        package: latestCcipPackageId,
        module: 'token_admin_registry',
        function: 'get_token_config_struct',
        arguments: [
            tx.object(ccipObjectRef),
            tx.pure.address(coinMetadataId),
        ]
    });

    const result = await suiClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: ethers.ZeroHash
    });

    if (result.results && result.results[0]?.returnValues) {
        const returnValue = result.results[0].returnValues[0];
        if (returnValue && Array.isArray(returnValue[0])) {
            const bytes = new Uint8Array(returnValue[0] as number[]);

            const isZeroAddress = bytes.slice(0, 32).every(b => b === 0);

            if (isZeroAddress) {
                console.log('⚠️  Token NOT Registered');
                return;
            }

            const TokenConfigStruct = bcs.struct('TokenConfig', {
                token_pool_package_id: bcs.Address,
                token_pool_module: bcs.String,
                token_type: bcs.String,
                administrator: bcs.Address,
                pending_administrator: bcs.Address,
                token_pool_type_proof: bcs.String,
                lock_or_burn_params: bcs.vector(bcs.Address),
                release_or_mint_params: bcs.vector(bcs.Address),
            });

            const tokenConfig = TokenConfigStruct.parse(bytes);

            let tokenPoolStateAddress: string | undefined;
            let tokenStateAddress: string | undefined;

            if (tokenConfig.token_pool_module === 'managed_token_pool') {
                tokenPoolStateAddress = tokenConfig.lock_or_burn_params.length > 3
                    ? tokenConfig.lock_or_burn_params[3]
                    : tokenConfig.release_or_mint_params.length > 3
                        ? tokenConfig.release_or_mint_params[3]
                        : undefined;
                tokenStateAddress = tokenConfig.lock_or_burn_params.length > 2
                    ? tokenConfig.lock_or_burn_params[2]
                    : tokenConfig.release_or_mint_params.length > 2
                        ? tokenConfig.release_or_mint_params[2]
                        : undefined;
            } else {
                tokenPoolStateAddress = tokenConfig.lock_or_burn_params.length > 1
                    ? tokenConfig.lock_or_burn_params[1]
                    : tokenConfig.release_or_mint_params.length > 1
                        ? tokenConfig.release_or_mint_params[1]
                        : undefined;
            }

            return {
                tokenPoolPackageId: tokenConfig.token_pool_package_id,
                tokenPoolModule: tokenConfig.token_pool_module,
                tokenType: tokenConfig.token_type,
                administrator: tokenConfig.administrator,
                pendingAdministrator: tokenConfig.pending_administrator,
                tokenPoolTypeProof: tokenConfig.token_pool_type_proof,
                lockOrBurnParams: tokenConfig.lock_or_burn_params,
                releaseOrMintParams: tokenConfig.release_or_mint_params,
                tokenPoolStateAddress: tokenPoolStateAddress,
                tokenStateAddress: tokenStateAddress
            };
        }
    }
}