import { ethers, Interface } from "ethers";
import { supportedEvmChains } from "../../../helperConfig";
import yargs from "yargs";
import { hideBin } from "yargs/helpers"
import { getEvmChainConfig, handleError } from "../../utils/utils";
import ERC20_ABI from "../../config/abi/ERC20";

import * as dotenv from "dotenv";
dotenv.config();

// ABI for the drip function
const ABI = [
  ...ERC20_ABI, 
  "function drip(address to) external"
];

const argv = yargs(hideBin(process.argv))
  .option('network', {
    type: 'string',
    description: 'Specify the network to connect to',
    demandOption: true,
    choices: supportedEvmChains,
  })
  .parseSync();

async function dripCCIPBnMToken() {
  const chainConfig = getEvmChainConfig(argv.network);

  const {
    explorerUrl,
    rpcUrlEnv,
    ccipBnMTokenAddress,
  } = chainConfig;

  const rpcUrl = process.env[rpcUrlEnv];

  if (!rpcUrl) {
    throw new Error(`Please set environment variable ${rpcUrlEnv}`)
  }

  const privateKey = process.env.EVM_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('Please set the environment variable EVM_PRIVATE_KEY.');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey as string, provider);

  const contract = new ethers.Contract(ccipBnMTokenAddress, ABI, wallet);

  console.log(`\nCalling drip(${wallet.address}) on contract ${ccipBnMTokenAddress}...`);

  try {
    const tokenName = await contract.name();
    const tx = await contract.drip(wallet.address);
    console.log(`✅ Transaction sent: ${tx.hash}`);
    console.log("\nWaiting for confirmation...");
    const receipt = await tx.wait(3); // Wait for 3 confirmations
    console.log(`🌎 View on explorer: ${explorerUrl}/tx/${tx.hash}`);
    console.log(`💰 1 ${tokenName} token has been dripped to ${wallet.address}`);
  } catch (error) {
    handleError(
      [
        { name: 'ERC20Interface', iface: new Interface(ERC20_ABI) }
      ],
      error
    );
  }
}

dripCCIPBnMToken();