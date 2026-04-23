import { ethers, hexlify, Interface, toUtf8Bytes } from "ethers";
import RouterABI from "../config/abi/Router";
import ERC20_ABI from "../config/abi/ERC20";
import OnRamp_1_6 from "../config/abi/OnRamp_1_6";
import FeeQuoter_1_6_ABI from "../config/abi/FeeQuoter_1_6";
import { networkConfig, supportedEvmChains } from "../../helperConfig";
import yargs from "yargs";
import { hideBin } from "yargs/helpers"
import { getEvmChainConfig, handleError, isValidSuiAddress, encodeSuiExtraArgsV1, suiObjectIdToBytes32 } from "../utils/utils";

import dotenv from "dotenv";
import { getObjectFromPackage } from "../sui-helper/getObjectFromPackage";
import { getSuiConfig, resolveSuiNetworkName, type SuiNetworkName } from "../sui-helper/suiNetwork";
dotenv.config()

const argv = yargs(hideBin(process.argv))
    .option("feeToken", {
        type: "string",
        description: "Specify the fee token (link or native)",
        demandOption: true,
        choices: [
            networkConfig.sui.feeTokenNameLink,
            networkConfig.sui.feeTokenNameNative,
        ],
    })
    .option("sourceChain", {
        type: "string",
        description: "Specify the source chain from where the token will be sent",
        demandOption: true,
        choices: supportedEvmChains
    })
    .option('msgString', {
        type: 'string',
        description: 'Specify the message string to send',
        demandOption: true
    })
    .option("amount", {
        type: "number",
        description: "Specify the amount of token to send",
        demandOption: true,
    })
    .option("suiReceiver", {
        type: "string",
        description: "Specify the Sui Receiver address (Package ID of the Receiver intended to receive message and token)",
        demandOption: true,
    })
    .parseSync();

const privateKey = process.env.EVM_PRIVATE_KEY;
if (!privateKey) {
    throw new Error('Please set the environment variable EVM_PRIVATE_KEY.');
}

/**
 * Parses a human-readable token amount into the appropriate BigInt
 * based on the token's decimals.
 */
async function parseTokenAmount(
    tokenAddress: string,
    amount: number,
    provider: ethers.Provider
): Promise<bigint> {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const decimals: number = await tokenContract.decimals();
    return ethers.parseUnits(amount.toString(), decimals);
}

async function approveToken(
    wallet: ethers.Wallet,
    ccipRouterAddress: string,
    tokenAddress: string,
    amount: bigint
) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const currentAllowance: bigint = await tokenContract.allowance(
        wallet.address,
        ccipRouterAddress
    );

    console.log(
        `Current Allowance of ${await tokenContract.symbol()} token: `,
        currentAllowance.toString()
    );

    // return if current allowance is greater than the amount needed
    if (currentAllowance >= amount) {
        console.log("Sufficient allowance granted. ")
        return;
    }

    // approve more amount to router address if current allowance is insufficient
    const tx = await tokenContract.approve(ccipRouterAddress, amount);
    console.log("Approval tx sent: ", tx.hash);
    const confirmationsToWait = 3;
    const receipt = await tx.wait(confirmationsToWait);

    console.log(
        `Approval transaction confirmed in block ${receipt.blockNumber} after ${confirmationsToWait} confirmations.`
    );

    console.log(
        `Router contract approved spend ${amount} of ${await tokenContract.symbol()} token from your account.`
    );
}

function buildCCIPMessage(
    recipient: string,
    data: string,
    token: string,
    amount: bigint,
    feeToken: string,
    extraArgs: string
): Array<any> {
    return [recipient, data, [{ token, amount }], feeToken, extraArgs];
}

async function extractCCIPMessageId(
    ccipOnrampContract: ethers.Contract,
    receipt: ethers.TransactionReceipt
): Promise<string | null> {
    for (const log of receipt.logs) {
        try {
            const parsedLog = ccipOnrampContract.interface.parseLog(log);

            if (parsedLog?.name === "CCIPMessageSent") {
                const message = parsedLog.args.message;
                const messageId: string = message.header.messageId;

                console.log('🆔 CCIP Message ID:', messageId);
                console.log(`🔗 CCIP Explorer URL: https://ccip.chain.link/#/side-drawer/msg/${messageId}`);
                return messageId;
            }
        } catch {
            continue;
        }
    }

    console.warn("❌ CCIPMessageSent event not found.");
    return null;
}

async function sendMessageAndTokenPayLink(
    wallet: ethers.Wallet,
    ccipRouterContract: ethers.Contract,
    ccipOnRampContract: ethers.Contract,
    recipient: string,
    messageString: string,
    tokenAddress: string,
    tokenAmount: bigint,
    feeTokenAddress: string,
    explorerUrl: string,
    suiNetworkName: SuiNetworkName
) {
    try {
        const suiConfig = getSuiConfig(suiNetworkName);
        const ccipReceiverState = await getObjectFromPackage(recipient, 'CCIPReceiverState', suiNetworkName);
        const ccipMessage = buildCCIPMessage(
            recipient,
            hexlify(toUtf8Bytes(messageString)), // test data, can be any valid hex string
            tokenAddress,
            tokenAmount,
            feeTokenAddress,
            encodeSuiExtraArgsV1({
                gasLimit: 100_000n,
                allowOutOfOrderExecution: true,
                tokenReceiver: ccipReceiverState,
                receiverObjectIds: [
                    suiObjectIdToBytes32(suiConfig.clockObjectId), // Clock object ID (0x6 padded to 32 bytes)
                    ccipReceiverState
                ]
            })
        )

        const baseFee: bigint = await ccipRouterContract.getFee(
            suiConfig.chainSelector,
            ccipMessage
        );

        // Add 20% margin
        const margin = baseFee / 5n; // 20% of base fee
        const feeWithBuffer = baseFee + margin;

        console.log("Base Fee (in LINK JUELS): ", baseFee.toString());
        console.log(
            "Fee with 20% buffer (in LINK JUELS): ",
            feeWithBuffer.toString()
        );

        // approve the token transfer
        await approveToken(
            wallet,
            await ccipRouterContract.getAddress(),
            tokenAddress,
            tokenAmount
        );

        // approve the fee token transfer
        await approveToken(
            wallet,
            await ccipRouterContract.getAddress(),
            feeTokenAddress,
            feeWithBuffer
        )
        console.log("Proceeding with the token transfer...");

        // call ccipSend function on Router contract
        const tx = await ccipRouterContract.ccipSend(
            suiConfig.chainSelector,
            ccipMessage
        )
        console.log(`Transaction sent: ${tx.hash}`);
        console.log("Waiting for transaction confirmation...");

        // wait for ccipSend tx confirmed in 3 blocks
        const confirmationToWait = 3;
        const receipt = await tx.wait(confirmationToWait);
        console.log(
            `Transaction confirmed in block ${receipt.blockNumber} after ${confirmationToWait} confirmations.`
        )
        console.log('✅ Transaction successful:', `${explorerUrl}/tx/${tx.hash}`);

        await extractCCIPMessageId(ccipOnRampContract, receipt);
    } catch (error) {
        handleError(
            [
                { name: "CCIPRouterInterface", iface: ccipRouterContract.interface },
                { name: 'CCIPOnRampInterface', iface: ccipOnRampContract.interface },
                { name: 'ERC20Interface', iface: new Interface(ERC20_ABI) },
                { name: 'FeeQuoterInterface', iface: new Interface(FeeQuoter_1_6_ABI) },
            ],
            error
        );
    }
}

async function sendMessageAndTokenPayNative(
    wallet: ethers.Wallet,
    ccipRouterContract: ethers.Contract,
    ccipOnRampContract: ethers.Contract,
    recipient: string,
    messageString: string,
    tokenAddress: string,
    tokenAmount: bigint,
    explorerUrl: string,
    suiNetworkName: SuiNetworkName
) {
    try {
        const suiConfig = getSuiConfig(suiNetworkName);
        const ccipReceiverState = await getObjectFromPackage(recipient, 'CCIPReceiverState', suiNetworkName);
        const ccipMessage = buildCCIPMessage(
            recipient,
            hexlify(toUtf8Bytes(messageString)), // test data, can be any valid hex string
            tokenAddress,
            tokenAmount,
            ethers.ZeroAddress, // Fee token is set to zero address (in case of using native token as fee)
            encodeSuiExtraArgsV1({
                gasLimit: 100_000n,
                allowOutOfOrderExecution: true,
                tokenReceiver: ccipReceiverState,
                receiverObjectIds: [
                    suiObjectIdToBytes32(suiConfig.clockObjectId), // Clock object ID (0x6 padded to 32 bytes)
                    ccipReceiverState
                ]
            })
        );

        const baseFee: bigint = await ccipRouterContract.getFee(
            suiConfig.chainSelector,
            ccipMessage
        );

        // Add 20% margin
        const margin = baseFee / 5n; // 20% of base fee
        const feeWithBuffer = baseFee + margin;

        console.log("Base Fee (in WEI): ", baseFee.toString());
        console.log("Fee with 20% buffer (in WEI): ", feeWithBuffer.toString());

        // approve the token transfer
        await approveToken(
            wallet,
            await ccipRouterContract.getAddress(),
            tokenAddress,
            tokenAmount
        );
        console.log("Proceeding with the token transfer...");

        // send ccipSend transaction paying native token
        const tx = await ccipRouterContract.ccipSend(
            suiConfig.chainSelector,
            ccipMessage,
            {
                value: feeWithBuffer, // Send the fee in native currency (eg. Sepolia ETH)
            }
        )

        // wait for 3 confirmations for ccipSend tx.
        console.log("Transaction sent: ", tx.hash);
        console.log("Waiting for transaction confirmations..");
        const confirmationsToWait = 3;
        const receipt = await tx.wait(confirmationsToWait);
        console.log(
            `Transaction confirmed in block ${receipt.blockNumber} after ${confirmationsToWait} confirmations.`
        );
        console.log('✅ Transaction successful:', `${explorerUrl}/tx/${tx.hash}`);
        await extractCCIPMessageId(ccipOnRampContract, receipt);
    } catch (error) {
        handleError(
            [
                { name: "CCIPRouterInterface", iface: ccipRouterContract.interface },
                { name: 'CCIPOnRampInterface', iface: ccipOnRampContract.interface },
                { name: 'ERC20Interface', iface: new Interface(ERC20_ABI) },
                { name: 'FeeQuoterInterface', iface: new Interface(FeeQuoter_1_6_ABI) },
            ],
            error
        );
    }
}

async function sendMessageAndTokenFromEvmToSui(messageString: string, tokenAmount: number) {
    const recipient = argv.suiReceiver;

    // Validate Sui recipient address
    if (!isValidSuiAddress(recipient)) {
        throw new Error(
            `Invalid Sui address: ${recipient}. A valid Sui address must be a 32-byte hex string (0x followed by 64 hex characters).`
        );
    }

    const chainConfig = getEvmChainConfig(argv.sourceChain);
    const suiNetworkName = resolveSuiNetworkName('auto', argv.sourceChain);
    const suiConfig = getSuiConfig(suiNetworkName);

    const {
        ccipRouterAddress,
        ccipOnrampAddress,
        linkTokenAddress,
        explorerUrl,
        rpcUrlEnv,
        ccipBnMTokenAddress,
    } = chainConfig;

    const rpcUrl = process.env[rpcUrlEnv];
    if (!rpcUrl) {
        throw new Error(`Please set environment variable ${rpcUrlEnv}`)
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey as string, provider);

    const ccipRouterContract = new ethers.Contract(
        ccipRouterAddress,
        RouterABI,
        wallet
    );

    const ccipOnRampContract = new ethers.Contract(
        ccipOnrampAddress,
        OnRamp_1_6,
        wallet
    );

    const parsedTokenAmount = await parseTokenAmount(
        ccipBnMTokenAddress,
        tokenAmount,
        wallet.provider as ethers.Provider
    );

    if (argv.feeToken == networkConfig.sui.feeTokenNameLink) {
        sendMessageAndTokenPayLink(
            wallet,
            ccipRouterContract,
            ccipOnRampContract,
            recipient,
            messageString,
            ccipBnMTokenAddress,
            parsedTokenAmount,
            linkTokenAddress,
            explorerUrl,
            suiNetworkName
        );
    } else if (argv.feeToken == networkConfig.sui.feeTokenNameNative) {
        sendMessageAndTokenPayNative(
            wallet,
            ccipRouterContract,
            ccipOnRampContract,
            recipient,
            messageString,
            ccipBnMTokenAddress,
            parsedTokenAmount,
            explorerUrl,
            suiNetworkName
        );
    } else {
        throw new Error(
            "Invalid fee token specified. Please specify fee token use --feeToken link or --feeToken native."
        );
    }
}

sendMessageAndTokenFromEvmToSui(argv.msgString, argv.amount);