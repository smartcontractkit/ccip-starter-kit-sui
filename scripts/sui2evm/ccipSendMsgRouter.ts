import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { AbiCoder } from 'ethers';
import { networkConfig, supportedEvmChains } from "../../helperConfig";
import { getEvmChainConfig, fetchEventsByTxHash, encodeGenericExtraArgsV2 } from '../utils/utils';
import { calculateAndPrepareFees } from './core/handleFees';
import { prepareCcipObjects, prepareReceiver, prepareMessageData } from './core/prepareCcipMessage';
import { buildMessageOnlyPTB, type MessageArgs } from './core/buildCcipSendPTB';
import {
    getSuiClient,
    getSuiConfig,
    resolveSuiNetworkName,
    type SuiNetworkName,
    type SuiNetworkSelection,
} from '../sui-helper/suiNetwork';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';

dotenv.config();

const argv = yargs(hideBin(process.argv))
    .option('feeToken', {
        type: 'string',
        description: 'Specify the fee token (link or native)',
        demandOption: true,
        choices: [
            networkConfig.sui.feeTokenNameLink,
            networkConfig.sui.feeTokenNameNative,
        ],
    })
    .option('destChain', {
        type: 'string',
        description: 'Specify the destination chain where the message will be sent',
        demandOption: true,
        choices: supportedEvmChains,
    })
    .option('msgString', {
        type: 'string',
        description: 'Specify the message string to send',
        demandOption: true,
    })
    .option('evmReceiver', {
        type: 'string',
        description: 'Specify the EVM Receiver Address',
        demandOption: true,
    })
    .option('network', {
        type: 'string',
        description: 'Specify the Sui network to use, or auto-detect from --destChain',
        choices: [networkConfig.sui.networkName, networkConfig.suiMainnet.networkName, 'auto'],
        default: 'auto',
    })
    .parseSync();

const privateKey = process.env.SUI_PRIVATE_KEY;
if (!privateKey) {
    throw new Error('SUI_PRIVATE_KEY is not set in the .env file.');
}

const keypair = Ed25519Keypair.fromSecretKey(privateKey);

async function sendMessageFromSuiToEvm(messageString: string) {
    try {
        const tx = new Transaction();
        const senderAddress = keypair.getPublicKey().toSuiAddress();

        // Get chain configuration
        const chainConfig = getEvmChainConfig(argv.destChain);
        const networkName = resolveSuiNetworkName(argv.network as SuiNetworkSelection, chainConfig.networkName);
        const suiConfig = getSuiConfig(networkName);
        const suiClient = getSuiClient(networkName);
        const suiExplorerNetwork = networkName === 'suiMainnet' ? 'mainnet' : 'testnet';
        const destChainSelector = BigInt(chainConfig.chainSelector);

        // Prepare receiver address
        const receiver = prepareReceiver(argv.evmReceiver);

        // ABI-encode the message string (to match abi.decode in the receiver contract)
        const abiCoder = AbiCoder.defaultAbiCoder();
        const encodedMessage = abiCoder.encode(['string'], [messageString]);
        const data = prepareMessageData(encodedMessage);

        // Prepare extra args (non-zero gas limit for message transfer)
        const extraArgs = encodeGenericExtraArgsV2(100_000n, true);

        // Prepare CCIP objects
        const { ccipObjectRef, latestCcipPackageId, latestOnRampPackageId, onrampState } = await prepareCcipObjects(
            chainConfig.chainSelector,
            networkName
        );

        // Calculate fees and prepare fee token (no tokens being transferred)
        const useLinkForFees = argv.feeToken === suiConfig.feeTokenNameLink;
        const feeResult = await calculateAndPrepareFees({
            tx,
            onRampPackageId: latestOnRampPackageId,
            ccipObjectRef,
            chainSelector: chainConfig.chainSelector,
            receiver,
            data,
            tokenAddresses: [], // No tokens
            tokenAmounts: [],   // No tokens
            extraArgs,
            useLinkForFees,
            senderAddress,
            networkName
        });

        console.log(`📧 Sending message: "${messageString}"`);

        // Build the transaction
        const buildArgs: MessageArgs = {
            ccipPkg: latestCcipPackageId,
            onrampPkg: latestOnRampPackageId,
            ccipObjectRef,
            onrampState,
            feeToken: feeResult.feeToken,
            feeTokenType: feeResult.feeTokenType,
            feeTokenMetadata: feeResult.feeTokenMetadata,
            destChainSelector,
            receiver,
            data,
            extraArgs,
            clockObjectId: suiConfig.clockObjectId,
            denyListObjectId: suiConfig.denyListObjectId
        };

        buildMessageOnlyPTB(tx, buildArgs);

        // ccip_send borrows the fee coin by &mut and only withdraws the actual on-chain fee,
        // so the split-off native fee coin has a leftover balance that must be handed back.
        if (!useLinkForFees) {
            tx.transferObjects([feeResult.feeToken as TransactionObjectArgument], senderAddress);
        }

        // Execute transaction
        const result = await suiClient.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
            options: { showEffects: true, showEvents: true },
        });
        console.log(`Digest: ${result.digest} (https://suiscan.xyz/${suiExplorerNetwork}/tx/${result.digest})`);

        // Surface Move aborts instead of masquerading as "No events found in transaction"
        const status = result.effects?.status;
        if (status?.status !== 'success') {
            throw new Error(`ccip_send failed on-chain: ${status?.error ?? 'unknown error'}`);
        }

        await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } });

        // Fetch and display CCIP Message ID
        const messageId = await fetchEventsByTxHash(result.digest, suiClient);

        console.log(`✅ Transaction successful: https://suiscan.xyz/${suiExplorerNetwork}/tx/${result.digest}`);
        console.log(`🆔 CCIP Message ID: ${messageId}`);
        console.log(`🔗 CCIP Explorer URL: https://ccip.chain.link/#/side-drawer/msg/${messageId}`);

    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

sendMessageFromSuiToEvm(argv.msgString);