import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getObjectFromPackage } from '../sui-helper/getObjectFromPackage';
import { getCoinDetails } from '../sui-helper/getCoinDetails';
import { getSuiClient, getSuiConfig, type SuiNetworkName } from '../sui-helper/suiNetwork';

const argv = yargs(hideBin(process.argv))
  .option('network', {
    type: 'string',
    description: 'Sui network to query (defaults to suiTestnet)',
    default: 'suiTestnet',
    choices: ['suiTestnet', 'suiMainnet'],
  })
  .option('address', {
    type: 'string',
    description: 'Specify the Sui address or package ID to check CCIP-BnM token balance',
    demandOption: true,
  })
  .option('isEOA', {
    type: 'boolean',
    description: 'Specify if the address is an EOA (true) or a package ID (false)',
    demandOption: true,
  })
  .parseSync();

const networkName: SuiNetworkName = argv.network as SuiNetworkName;
const suiClient = getSuiClient(networkName);
const suiConfig = getSuiConfig(networkName);

async function getTokenBalance() {
  try {
    // Determine the actual address to query
    const ownerAddress = argv.isEOA 
      ? argv.address
      : await getObjectFromPackage(argv.address, 'CCIPReceiverState', networkName);

    console.log(`\n🔍 Fetching CCIP-BnM token balance for ${argv.isEOA ? 'EOA' : 'package'}: ${argv.address}`);
    if (!argv.isEOA) {
      console.log(`📍 CCIPReceiverState object ID: ${ownerAddress}`);
    }
    const coinType = (await getCoinDetails(suiConfig.ccipBnMCoinMetadataId, networkName)).coinType;
    console.log(`Token type: ${coinType}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Get all coins of CCIP-BnM token type owned by the address
    const balance = await suiClient.getBalance({
      owner: ownerAddress,
      coinType,
    });

    // Get coin metadata for formatting
    const metadata = await suiClient.getCoinMetadata({
      coinType,
    });

    if (!metadata) {
      throw new Error('Failed to fetch CCIP-BnM token metadata');
    }

    // Convert balance from smallest unit to human-readable format
    const decimals = metadata.decimals;
    const balanceInUnits = Number(balance.totalBalance) / Math.pow(10, decimals);

    console.log('\n✅ Token Balance:');
    console.log(`  Raw Balance: ${balance.totalBalance} (smallest unit)`);
    console.log(`  Formatted Balance: ${balanceInUnits} ${metadata.symbol}`);
    console.log(`  Decimals: ${decimals}`);
    console.log(`  Coin Count: ${balance.coinObjectCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error fetching token balance:', error);
    throw error;
  }
}

getTokenBalance().catch(console.error);