import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { AbiCoder } from 'ethers';
import { networkConfig, supportedEvmChains } from "../../helperConfig";
import { splitCoin } from '../sui-helper/splitCoin';
import { getCoinDetails } from '../sui-helper/getCoinDetails';
import { getEvmChainConfig, fetchEventsByTxHash, convertToBaseUnit, encodeGenericExtraArgsV2 } from '../utils/utils';
import { calculateAndPrepareFees } from './core/handleFees';
import { prepareCcipObjects, prepareReceiver, prepareTokenTransfer, prepareMessageData } from './core/prepareCcipMessage';
import { buildMessageAndTokenPTB, type TokenTransferArgs } from './core/buildCcipSendPTB';
import {
    getSuiClient,
    getSuiConfig,
    resolveSuiNetworkName,
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
        description: 'Specify the destination chain where the token and message will be sent',
        demandOption: true,
        choices: supportedEvmChains,
    })
    .option('amount', {
        type: 'number',
        description: 'Amount of token to send',
        demandOption: true,
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

async function sendMessageAndTokenFromSuiToEvm(tokenAmount: number, messageString: string) {
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

        // Prepare extra args (non-zero gas limit for token + message transfer)
        const extraArgs = encodeGenericExtraArgsV2(100_000n, true);

        // Prepare CCIP objects
        const { ccipObjectRef, latestCcipPackageId, latestOnRampPackageId, onrampState } = await prepareCcipObjects(
            chainConfig.chainSelector,
            networkName
        );

        // Prepare token transfer info
        const { tokenConfig, tokenMetadata, poolKind } = await prepareTokenTransfer(
            suiConfig.ccipBnMCoinMetadataId,
            networkName
        );

        // Convert token amount to base units
        const tokenAmountBigInt = convertToBaseUnit(tokenAmount, tokenMetadata.decimals);
        console.log(`📦 Sending ${tokenAmount} tokens (${tokenAmountBigInt} in smallest units with ${tokenMetadata.decimals} decimals)`);
        console.log(`📧 With message: "${messageString}"`);

        // Split the exact amount to send - the pool will consume the entire coin object
        const tokenCoinToSend = await splitCoin(
            tx,
            suiConfig.ccipBnMCoinMetadataId,
            tokenAmountBigInt,
            senderAddress,
            networkName
        );

        // Calculate fees and prepare fee token
        const useLinkForFees = argv.feeToken === suiConfig.feeTokenNameLink;
        const ccipBnMTokenDetails = await getCoinDetails(suiConfig.ccipBnMCoinMetadataId, networkName);
        const feeResult = await calculateAndPrepareFees({
            tx,
            onRampPackageId: latestOnRampPackageId,
            ccipObjectRef,
            chainSelector: chainConfig.chainSelector,
            receiver,
            data,
            tokenAddresses: [ccipBnMTokenDetails.packageId],
            tokenAmounts: [tokenAmountBigInt],
            extraArgs,
            useLinkForFees,
            senderAddress,
            networkName
        });

        // Build the transaction
        const buildArgs: TokenTransferArgs = {
            ccipPkg: latestCcipPackageId,
            onrampPkg: latestOnRampPackageId,
            poolPkg: tokenConfig.tokenPoolPackageId,
            coinType: ccipBnMTokenDetails.coinType,
            ccipObjectRef,
            onrampState,
            tokenMetadata: tokenMetadata.id,
            tokenCoin: tokenCoinToSend,
            tokenPoolState: tokenConfig.tokenPoolStateAddress!,
            tokenState: tokenConfig.tokenStateAddress!,
            feeToken: feeResult.feeToken,
            feeTokenType: feeResult.feeTokenType,
            feeTokenMetadata: feeResult.feeTokenMetadata,
            destChainSelector,
            receiver,
            data,
            extraArgs,
            poolKind,
            clockObjectId: suiConfig.clockObjectId,
            denyListObjectId: suiConfig.denyListObjectId
        };

        buildMessageAndTokenPTB(tx, buildArgs);

        // Execute transaction
        const result = await suiClient.signAndExecuteTransaction({ signer: keypair, transaction: tx });
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

sendMessageAndTokenFromSuiToEvm(argv.amount, argv.msgString);