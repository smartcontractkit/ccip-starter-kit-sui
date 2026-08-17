import { toHex } from '@mysten/sui/utils';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { MessageExecutionState } from '../utils/utils';
import { getSuiClient, getSuiConfig, type SuiNetworkName } from '../sui-helper/suiNetwork';

const argv = yargs(hideBin(process.argv))
    .option('network', {
        type: 'string',
        description: 'Sui network to query (defaults to suiTestnet)',
        default: 'suiTestnet',
        choices: ['suiTestnet', 'suiMainnet'],
    })
    .option('msgId', {
        type: 'string',
        description: 'Specify the CCIP Message Id (with or without 0x prefix)',
        demandOption: true,
    })
    .parseSync();

const networkName: SuiNetworkName = argv.network as SuiNetworkName;
const suiClient = getSuiClient(networkName);
const suiConfig = getSuiConfig(networkName);

// Use original package ID for event queries (not latest)
// Events are always emitted with the original package ID
const ccipOfframpPackageId = suiConfig.ccipOfframpPackageId;
const ccipOfframpModuleName = suiConfig.ccipOfframpModuleName;
const eventType = `${ccipOfframpPackageId}::${ccipOfframpModuleName}::ExecutionStateChanged`;
const suiExplorerNetwork = networkName === 'suiMainnet' ? 'mainnet' : 'testnet';

async function getModuleEvents() {
    try {
        // Get message Id from user input and normalize it
        let msgId = argv.msgId;
        
        // Remove 0x prefix if present
        if (msgId.startsWith('0x')) {
            msgId = msgId.slice(2);
        }
        
        // Validate message ID length (should be 64 hex characters = 32 bytes)
        if (msgId.length !== 64) {
            console.error(`❌ Invalid message ID length. Expected 64 hex characters, got ${msgId.length}`);
            return;
        }

        console.log(`🔍 Searching for message ID: 0x${msgId}`);
        console.log(`📡 Querying events from package: ${ccipOfframpPackageId}, module: ${ccipOfframpModuleName}`);
        console.log(`   Event type: ${eventType}\n`);

        // Query events from the OffRamp module
        const events = await suiClient.queryEvents({
            query: {
                MoveEventType: eventType,
            },
            order: 'descending',
        });

        if (!events.data || events.data.length === 0) {
            console.log('⚠️  No ExecutionStateChanged events found in the OffRamp module.');
            return;
        }

        console.log(`🔎 Searching for matching message ID...\n`);

        // Find the event with matching message_id
        const selectedEvent = events.data.filter((event) => {
            const eventData = event.parsedJson as any;
            
            // The message_id in the event is stored as a byte array
            // We need to convert it to hex string for comparison
            if (eventData.message_id) {
                // Convert the byte array to hex string using Sui SDK utility
                // Note: toHex returns without 0x prefix
                const messageIdHex = toHex(Uint8Array.from(Object.values(eventData.message_id)));
                return messageIdHex === msgId;
            }
            return false;
        });

        if (selectedEvent.length === 0) {
            console.log(
                `⚠️  CCIP message with ID 0x${msgId} was not found in the ExecutionStateChanged events.`
            );
            console.log('    Please verify the message ID or wait for the transaction to be processed.');
        } else {
            const event = selectedEvent[0];
            if (!event || !event.parsedJson) {
                console.log('⚠️  Event found but data is missing');
                return;
            }
            
            const eventData = event.parsedJson as any;
            const state = eventData.state;
            const txDigest = event.id.txDigest;
            
            console.log('✅ Message found!');
            console.log(`   Transaction: https://suiscan.xyz/${suiExplorerNetwork}/tx/${txDigest}`);
            console.log(`   Sequence Number: ${eventData.sequence_number}`);
            console.log(`   Source Chain Selector: ${eventData.source_chain_selector}`);
            
            if (state === MessageExecutionState.UNTOUCHED) {
                console.log(`   📊 Execution state: UNTOUCHED (${state})`);
            } else if (state === MessageExecutionState.IN_PROGRESS) {
                console.log(`   📊 Execution state: IN_PROGRESS (${state}) ⌛️`);
            } else if (state === MessageExecutionState.SUCCESS) {
                console.log(`   📊 Execution state: SUCCESS (${state}) ✅`);
            } else if (state === MessageExecutionState.FAILURE) {
                console.log(`   📊 Execution state: FAILURE (${state}) ❌`);
            } else {
                console.log(`   📊 Execution state: UNKNOWN (${state})`);
            }
        }
    } catch (error) {
        console.error('❌ Error fetching module events:', error);
    }
}

getModuleEvents().catch(console.error);