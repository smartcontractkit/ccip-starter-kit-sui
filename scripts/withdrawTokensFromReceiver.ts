import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { ethers, Interface } from "ethers";
import fs from "fs";
import path from "path";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { networkConfig, supportedEvmChains } from "../helperConfig";
import ERC20_ABI from './config/abi/ERC20';
import { getEvmChainConfig, handleError, isValidSuiAddress, isValidEvmAddress } from "./utils/utils";
import { getObjectFromPackage } from './sui-helper/getObjectFromPackage';
import { getCoinWithBalance } from './sui-helper/splitCoin';
import { getCoinDetails } from './sui-helper/getCoinDetails';
import { getSuiClient, getSuiConfig, type SuiNetworkName } from './sui-helper/suiNetwork';
import dotenv from 'dotenv';

dotenv.config();

__dirname = path.resolve(__dirname, './sui2evm');
const contractData = JSON.parse(fs.readFileSync(path.join(__dirname, "receiver", "receiver.json"), "utf8"));
const CCIPReceiver_ABI = contractData.abi;

const argv = yargs(hideBin(process.argv))
    .option('network', {
        type: 'string',
        description: 'Specify the network to connect to (Sui: suiTestnet/suiMainnet, or a supported EVM chain)',
        demandOption: true,
        choices: [networkConfig.sui.networkName, networkConfig.suiMainnet.networkName, ...supportedEvmChains]
    })
    .option('receiver', {
        type: 'string',
        description: 'Specify the receiver address (package ID in case of Sui and contract address in case of EVM) to withdraw the token from',
        demandOption: true,
    })
    .option('to', {
        type: 'string',
        description: 'Specify the wallet address to withdraw the token to',
        demandOption: true,
    })
    .parseSync();

async function withdrawTokenFromReceiverOnSui(receiver: string, to: string, networkName: SuiNetworkName) {
    if (!isValidSuiAddress(receiver)) {
        throw new Error(`Invalid Sui receiver address: ${receiver}`);
    }
    if (!isValidSuiAddress(to)) {
        throw new Error(`Invalid Sui to address: ${to}`);
    }

    const privateKey = process.env.SUI_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY is not set in the .env file.');
    }

    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const senderAddress = keypair.getPublicKey().toSuiAddress();
    const suiClient = getSuiClient(networkName);
    const suiConfig = getSuiConfig(networkName);
    const suiExplorerNetwork = networkName === 'suiMainnet' ? 'mainnet' : 'testnet';

    console.log(`🚀 Executing transaction from address: ${senderAddress} on ${suiConfig.networkName}`);

    console.log(`\nAttempting to withdraw token from receiver...`);

    try {
        const tx = new Transaction();

        const ccipReceiverState = await getObjectFromPackage(receiver, 'CCIPReceiverState', networkName);

        // Get coin details to extract coin type
        const coinType = (await getCoinDetails(suiConfig.ccipBnMCoinMetadataId, networkName)).coinType;

        tx.moveCall({
            package: receiver,
            module: suiConfig.ccipReceiverModuleName,
            function: 'receive_and_send_coin',
            typeArguments: [coinType],
            arguments: [
                tx.object(ccipReceiverState),
                tx.object(await getObjectFromPackage(receiver, 'OwnerCap', networkName)),
                tx.object(await getCoinWithBalance(suiConfig.ccipBnMCoinMetadataId, 1n, ccipReceiverState, networkName)),
                tx.pure.address(to)
            ],
        });

        console.log('📡 Submitting transaction to the network...');
        const result = await suiClient.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
        });

        console.log(`✅ Transaction successful: https://suiscan.xyz/${suiExplorerNetwork}/tx/${result.digest}`);
        console.log(`Tokens have been successfully withdrawn to ${to}`);

    } catch (error) {
        console.error('❌ Transaction failed:', error);
        throw error;
    }
}

async function withdrawTokenFromReceiverOnEvm(evmChainRpcUrl: string, explorerUrl: string, receiver: string, to: string, tokenAddress: string) {
    if (!isValidEvmAddress(receiver)) {
        throw new Error(`Invalid EVM receiver address: ${receiver}`);
    }
    if (!isValidEvmAddress(to)) {
        throw new Error(`Invalid EVM to address: ${to}`);
    }

    const privateKey = process.env.EVM_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Please set the environment variable EVM_PRIVATE_KEY.");
    }

    const provider = new ethers.JsonRpcProvider(evmChainRpcUrl);
    const wallet = new ethers.Wallet(privateKey as string, provider);

    const ccipReceiverContract = new ethers.Contract(receiver, CCIPReceiver_ABI, wallet);

    try {
        // Check token balance before withdrawal
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const balance = await tokenContract.balanceOf(receiver);
        const tokenSymbol = await tokenContract.symbol();

        if (balance === 0n) {
            throw new Error(
                `No ${tokenSymbol} tokens available in receiver ${receiver}.`
            );
        }

        const tx = await ccipReceiverContract.withdrawToken(to, tokenAddress);
        console.log("Transaction sent:", tx.hash);
        console.log("Waiting for transaction confirmation...");
        const confirmationsToWait = 3;
        const receipt = await tx.wait(confirmationsToWait);
        console.log(`Transaction confirmed in block ${receipt.blockNumber} after ${confirmationsToWait} confirmations.`);
        console.log("✅ Transaction successful:", `${explorerUrl}/tx/${tx.hash}`);
        console.log(`Tokens have been successfully withdrawn to ${to}`);
    } catch (error) {
        handleError([
            { name: "CCIPReceiverInterface", iface: ccipReceiverContract.interface },
            { name: "ERC20Interface", iface: new Interface(ERC20_ABI) },
        ], error);
    }
}

async function withdrawTokenFromReceiver() {

    if (argv.network === networkConfig.sui.networkName || argv.network === networkConfig.suiMainnet.networkName) {
        await withdrawTokenFromReceiverOnSui(argv.receiver, argv.to, argv.network as SuiNetworkName);
    }
    else {
        const chainConfig = getEvmChainConfig(argv.network);
        const { explorerUrl, rpcUrlEnv, ccipBnMTokenAddress } = chainConfig;
        const rpcUrl = process.env[rpcUrlEnv];
        if (!rpcUrl) {
            throw new Error(`Please set the environment variable ${rpcUrlEnv}.`);
        }
        await withdrawTokenFromReceiverOnEvm(rpcUrl, explorerUrl, argv.receiver, argv.to, ccipBnMTokenAddress);
    }
}

withdrawTokenFromReceiver();