import { ethers } from 'ethers';
import OffRamp_1_6_ABI from '../config/abi/OffRamp_1_6';
import { supportedEvmChains } from "../../helperConfig";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getEvmChainConfig, MessageExecutionState } from '../utils/utils';
import dotenv from 'dotenv';

dotenv.config();

const argv = yargs(hideBin(process.argv))
  .option('msgId', {
    type: 'string',
    description: 'Specify the CCIP Message Id',
    demandOption: true,
  })
  .option('destChain', {
    type: 'string',
    description: 'Specify the destination chain where the token will be sent',
    demandOption: true,
    choices: supportedEvmChains,
  })
  .parseSync();

const chainConfig = getEvmChainConfig(argv.destChain);

const { ccipOfframpAddress, rpcUrlEnv } = chainConfig;

const rpcUrl = process.env[rpcUrlEnv];
if (!rpcUrl) {
  throw new Error(`Please set the environment variable ${rpcUrlEnv}.`);
}

const provider = new ethers.JsonRpcProvider(rpcUrl);

async function findExecutionStateChangeByMessageId() {
  try {
    // Normalize message ID for comparison
    const normalizedMsgId = argv.msgId.toLowerCase();

    console.log(`🔍 Searching for message ID: ${argv.msgId}`);
    console.log(`📡 Querying events from OffRamp: ${ccipOfframpAddress}`);
    console.log(`   Chain: ${chainConfig.networkName}\n`);

    // Check the status on EVM based on the messageId
    const iface = new ethers.Interface(OffRamp_1_6_ABI);
    const eventTopic = iface.getEvent('ExecutionStateChanged')!.topicHash;
    const latestBlock = await provider.getBlockNumber();

    // Batch queries to work within free tier limits (10 block range per request)
    const BLOCKS_PER_REQUEST = 10;
    const TOTAL_BLOCKS_TO_SEARCH = 500; // Search last 500 blocks total
    const NUM_BATCHES = Math.ceil(TOTAL_BLOCKS_TO_SEARCH / BLOCKS_PER_REQUEST);

    console.log(`🔎 Searching last ${TOTAL_BLOCKS_TO_SEARCH} blocks in ${NUM_BATCHES} batches...\n`);

    let allLogs: ethers.Log[] = [];

    // Query in batches from newest to oldest
    for (let i = 0; i < NUM_BATCHES; i++) {
      const toBlock = latestBlock - (i * BLOCKS_PER_REQUEST);
      const fromBlock = Math.max(toBlock - BLOCKS_PER_REQUEST + 1, 0);

      try {
        const logs = await provider.getLogs({
          address: ccipOfframpAddress,
          fromBlock,
          toBlock,
          topics: [eventTopic],
        });

        allLogs = allLogs.concat(logs);

        // If we found logs, check if our message is in this batch before continuing
        if (logs.length > 0) {
          for (const log of logs) {
            try {
              const parsed = iface.parseLog(log);
              const messageId = parsed?.args.messageId as string;
              if (messageId.toLowerCase() === normalizedMsgId) {
                // Found it! Process immediately
                const tx = await provider.getTransaction(log.transactionHash);
                const executeSighash = iface.getFunction('execute')!.selector;

                if (tx?.data.startsWith(executeSighash)) {
                  const stateValue = Number(parsed?.args.state);
                  const sequenceNumber = parsed?.args.sequenceNumber;

                  console.log('✅ Message found!');
                  console.log(`   Transaction: ${chainConfig.explorerUrl}/tx/${log.transactionHash}`);
                  console.log(`   Sequence Number: ${sequenceNumber}`);

                  // Use the numeric value for comparison
                  if (stateValue === MessageExecutionState.UNTOUCHED) {
                    console.log(`   📊 Execution state: UNTOUCHED (${stateValue})`);
                  } else if (stateValue === MessageExecutionState.IN_PROGRESS) {
                    console.log(`   📊 Execution state: IN_PROGRESS (${stateValue}) ⌛️`);
                  } else if (stateValue === MessageExecutionState.SUCCESS) {
                    console.log(`   📊 Execution state: SUCCESS (${stateValue}) ✅`);
                  } else if (stateValue === MessageExecutionState.FAILURE) {
                    console.log(`   📊 Execution state: FAILURE (${stateValue}) ❌`);
                  } else {
                    console.log(`   📊 Execution state: UNKNOWN (${stateValue})`);
                  }

                  return;
                }
              }
            } catch {
              continue;
            }
          }
        }

        // Small delay to avoid rate limiting
        if (i < NUM_BATCHES - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (err: any) {
        if (err.code === 'UNKNOWN_ERROR' && err.error?.message?.includes('block range')) {
          console.error(`❌ Block range error at blocks ${fromBlock}-${toBlock}. Stopping search.`);
          break;
        }
        throw err;
      }
    }

    console.log(`⚠️  CCIP message with ID ${argv.msgId} was not found in the last ${TOTAL_BLOCKS_TO_SEARCH} blocks.`);
    console.log('    Please verify the message ID or wait for the transaction to be processed.');
  } catch (error) {
    console.error('❌ Error fetching events:', error);
  }
}

findExecutionStateChangeByMessageId();