import { ethers } from "ethers";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getEvmChainConfig } from "../utils/utils";
import { supportedEvmChains } from "../../helperConfig";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const argv = yargs(hideBin(process.argv))
  .option('evmChain', {
    type: 'string',
    description: 'Specify the EVM chain to query',
    demandOption: true,
    choices: supportedEvmChains
  })
  .option('evmReceiver', {
    type: 'string',
    description: 'Specify the EVM Receiver contract address',
    demandOption: true,
  })
  .parseSync();

const chainConfig = getEvmChainConfig(argv.evmChain);
const { rpcUrlEnv, explorerUrl } = chainConfig;
const rpcUrl = process.env[rpcUrlEnv];

if (!rpcUrl) {
  throw new Error(`Please set the environment variable ${rpcUrlEnv}.`);
}

let dirname = path.resolve(path.dirname(''), 'scripts/sui2evm');
// Load the contract ABI
const contractData = JSON.parse(fs.readFileSync(path.join(dirname, "receiver", "receiver.json"), "utf8"));
const ABI = contractData.abi;

async function getLatestReceivedMessage() {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(argv.evmReceiver, ABI, provider);

    // Verify contract exists
    const code = await provider.getCode(argv.evmReceiver);
    if (code === '0x') {
      console.log(`❌ No contract found at address ${argv.evmReceiver}`);
      return;
    }

    console.log(`📋 Querying contract state: ${argv.evmReceiver} on ${argv.evmChain}\n`);

    // Fetch the stored values from the contract
    const [lastMessageId, lastText] = await contract.getLastReceivedMessageDetails();
    const sender = await contract.s_sender();
    
    // Check if any message has been received
    if (lastMessageId === ethers.ZeroHash) {
      console.log("No messages received yet. If you've already sent a CCIP message, please wait for the transaction to be processed.");
      return;
    }

    console.log('✅ Latest message received on EVM:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 Contract: ${argv.evmReceiver}`);
    console.log(`🆔 Message ID: ${lastMessageId}`);
    console.log(`📧 Text: "${lastText}"`);
    console.log(`👤 Sender: ${sender}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}

getLatestReceivedMessage().catch(console.error);
