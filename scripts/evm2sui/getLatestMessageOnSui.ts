import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { toHex } from '@mysten/sui/utils';
import { getSuiClient, getSuiConfig, type SuiNetworkName } from '../sui-helper/suiNetwork';

const argv = yargs(hideBin(process.argv))
  .option('network', {
    type: 'string',
    description: 'Sui network to query (defaults to suiTestnet)',
    default: 'suiTestnet',
    choices: ['suiTestnet', 'suiMainnet'],
  })
  .option('suiReceiver', {
    type: 'string',
    description: 'Specify the Sui Receiver Address (package ID where the receiver module is deployed)',
    demandOption: true,
  })
  .parseSync();

const networkName: SuiNetworkName = argv.network as SuiNetworkName;
const suiClient = getSuiClient(networkName);
const suiConfig = getSuiConfig(networkName);
const suiExplorerNetwork = networkName === 'suiMainnet' ? 'mainnet' : 'testnet';

async function getLatestReceivedMessage() {
  try {
    // Query events for the ReceivedMessage event type
    const eventType = `${argv.suiReceiver}::${suiConfig.ccipReceiverModuleName}::ReceivedMessage`;
    
    console.log(`Querying events for: ${eventType}`);
    
    const events = await suiClient.queryEvents({
      query: { MoveEventType: eventType },
      limit: 100,
      order: 'descending',
    });

    if (!events.data || events.data.length === 0) {
      console.log(
        "No messages received yet. If you've already sent a CCIP message, please wait for the transaction to be processed."
      );
      return;
    }

    // Get the latest event (first in descending order)
    const latestEvent = events.data[0];
    const eventData = latestEvent.parsedJson as any;

    console.log('\n✅ Latest message received on Sui:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 Package ID: ${argv.suiReceiver}`);
    console.log(`🔗 Transaction: https://suiscan.xyz/${suiExplorerNetwork}/tx/${latestEvent.id.txDigest}`);
    console.log(`📅 Timestamp: ${latestEvent.timestampMs ? new Date(Number(latestEvent.timestampMs)).toISOString() : 'N/A'}`);
    
    // Process and display message data
    if (eventData.data) {
      // Convert data array to Uint8Array then to hex
      const dataBytes = Uint8Array.from(Object.values(eventData.data));
      const hexData = '0x' + toHex(dataBytes);
      
      console.log('\n📨 Message Data:');
      console.log(`  Bytes: [${Array.from(dataBytes).join(', ')}]`);
      console.log(`  Hex: ${hexData}`);
      
      // Attempt to convert to string
      try {
        // Try to decode as UTF-8 string
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const messageString = decoder.decode(dataBytes);
        
        // Check if the string contains only printable characters
        const isPrintable = /^[\x20-\x7E\s]*$/.test(messageString);
        
        if (isPrintable && messageString.trim().length > 0) {
          console.log(`  String: "${messageString}"`);
        } else {
          console.log('  String: (Message data cannot be converted to a readable string)');
        }
      } catch {
        console.log('  String: (Message data cannot be converted to a readable string)');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}

getLatestReceivedMessage().catch(console.error);
