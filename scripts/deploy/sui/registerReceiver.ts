import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { networkConfig } from '../../../helperConfig';
import { getObjectFromPackage } from '../../sui-helper/getObjectFromPackage';
import { getSuiClient, type SuiNetworkName } from '../../sui-helper/suiNetwork';
import yargs from "yargs";
import { hideBin } from "yargs/helpers"
import dotenv from 'dotenv';

dotenv.config();

const argv = yargs(hideBin(process.argv))
    .option("network", {
        type: "string",
        description: "Specify the Sui network to use",
        choices: [networkConfig.sui.networkName, networkConfig.suiMainnet.networkName],
        default: networkConfig.sui.networkName,
    })
    .option("suiReceiver", {
        type: "string",
        description: "Specify the Sui Receiver package ID to register",
        demandOption: true,
    })
    .parseSync();

const suiNetworkName = argv.network as SuiNetworkName;
const isMainnet = suiNetworkName === networkConfig.suiMainnet.networkName;
const suiExplorerNetwork = isMainnet ? 'mainnet' : 'testnet';
const suiConfig = isMainnet ? networkConfig.suiMainnet : networkConfig.sui;
const suiClient = getSuiClient(suiNetworkName);
const ccipPackageId = suiConfig.ccipPackageId;
const ccipReceiverPackageId = argv.suiReceiver;
const ccipReceiverModuleName = suiConfig.ccipReceiverModuleName;
const functionName = 'register_receiver';

const privateKey = process.env.SUI_PRIVATE_KEY;
if (!privateKey) {
    throw new Error('SUI_PRIVATE_KEY is not set in the .env file.');
}

const keypair = Ed25519Keypair.fromSecretKey(privateKey);
const senderAddress = keypair.getPublicKey().toSuiAddress();

/**
 * Registers the receiver in the Receiver Registry so that the Executing DON
 * can call the ccip_receive function of the dummy_receiver module.
 */
async function registerReceiver() {
    console.log(`--- Starting Receiver Registration Process ---`);
    console.log(`Network:             ${suiConfig.networkName}`);
    console.log(`Sender Address:       ${senderAddress}`);
    console.log(`Receiver Package ID:  ${ccipReceiverPackageId}`);
    console.log(`Module Name:          ${ccipReceiverModuleName}`);

    try {
        console.log(`\n--- Fetching necessary objects for registration ---`);
        // Fetch the Owner Cap object
        const ownerCap = await getObjectFromPackage(ccipReceiverPackageId, 'OwnerCap', suiNetworkName);
        console.log(`Owner Cap Object ID:   ${ownerCap}`);
        // Fetch the CCIP Object Ref (use original CCIP package ID)
        const ccipObjectRef = await getObjectFromPackage(ccipPackageId, 'CCIPObjectRef', suiNetworkName);
        console.log(`CCIP Object Ref ID:    ${ccipObjectRef}`);

        console.log('\n📝 Building transaction...');
        const tx = new Transaction();

        tx.moveCall({
            package: ccipReceiverPackageId,
            module: ccipReceiverModuleName,
            function: functionName,
            typeArguments: [],
            arguments: [
                tx.object(ownerCap),
                tx.object(ccipObjectRef),
            ],
        });

        console.log('📡 Submitting transaction to the network...');
        const result = await suiClient.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
        });

        console.log('\n✅ Receiver registered successfully!');
        console.log(`Transaction Digest: ${result.digest}`);
        console.log(
            `\nView transaction at: https://suiscan.xyz/${suiExplorerNetwork}/tx/${result.digest}`
        );
    } catch (error) {
        console.error('\n❌ Registration failed:', error);
        throw error;
    }
}

async function main() {
    try {
        await registerReceiver();
    } catch (error) {
        console.error('\n❌ Register receiver script failed:', error);
        process.exit(1);
    }
}

main();
