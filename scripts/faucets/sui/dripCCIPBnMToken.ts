import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { networkConfig } from '../../../helperConfig';
import { getObjectFromPackage } from '../../sui-helper/getObjectFromPackage';
import { getCoinDetails } from '../../sui-helper/getCoinDetails';
import { getSuiClient } from '../../sui-helper/suiNetwork';
import dotenv from 'dotenv';

dotenv.config();

const privateKey = process.env.SUI_PRIVATE_KEY;
if (!privateKey) {
    throw new Error('SUI_PRIVATE_KEY is not set in the .env file.');
}

const keypair = Ed25519Keypair.fromSecretKey(privateKey);
const senderAddress = keypair.getPublicKey().toSuiAddress();
// Use the env-aware client (SUI_TESTNET_RPC_URL) so tx build/execute goes to the
// same RPC as getCoinDetails/getObjectFromPackage. The public fullnode
// (getFullnodeUrl('testnet')) 404s on sui_getNormalizedMoveFunction during build.
const suiClient = getSuiClient('suiTestnet');

/**
 * Drips CCIP-BnM tokens from the faucet to the caller's address
 */
async function dripCCIPBnMToken() {
    console.log(`\nCalling drip_and_send(${senderAddress}) on faucet ${networkConfig.sui.faucetPackageId}...`);

    try {
        // Get coin metadata for CCIP-BnM token
        const tokenDetails = await getCoinDetails(networkConfig.sui.ccipBnMCoinMetadataId);
        const metadata = {
            id: networkConfig.sui.ccipBnMCoinMetadataId,
            decimals: tokenDetails.decimals,
            symbol: tokenDetails.symbol
        };

        // Get FaucetState object
        const faucetState = await getObjectFromPackage(
            networkConfig.sui.faucetPackageId,
            'FaucetState'
        );

        // Get TokenState object
        const tokenState = await getObjectFromPackage(
            networkConfig.sui.managedTokenPackageId,
            'TokenState'
        );

        const tx = new Transaction();

        tx.moveCall({
            package: networkConfig.sui.faucetPackageId,
            module: networkConfig.sui.faucetModuleName,
            function: 'drip_and_send',
            typeArguments: [tokenDetails.coinType],
            arguments: [
                tx.object(metadata.id),
                tx.object(faucetState),
                tx.object(tokenState),
                tx.object(networkConfig.sui.denyListObjectId),
                tx.pure.address(senderAddress),
            ],
        });

        const result = await suiClient.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
        });

        console.log(`✅ Transaction sent: ${result.digest}`);
        console.log('\nWaiting for confirmation...');

        // Wait for transaction to be indexed
        await suiClient.waitForTransaction({
            digest: result.digest,
        });

        console.log(`🌎 View on explorer: https://suiscan.xyz/testnet/tx/${result.digest}`);
        console.log(`💰 1 ${metadata.symbol} token has been dripped to ${senderAddress}`);
    } catch (error) {
        console.error('\n❌ Drip failed:', error);
        throw error;
    }
}

dripCCIPBnMToken();