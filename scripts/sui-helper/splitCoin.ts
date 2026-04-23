import { Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import { getCoinDetails } from './getCoinDetails';
import { getSuiClient, type SuiNetworkName } from './suiNetwork';

/**
 * Get all coins of a specific type owned by an address
 */
export async function getOwnedCoins(
    coinType: string,
    owner: string,
    networkName: SuiNetworkName = 'suiTestnet'
) {
    const suiClient = getSuiClient(networkName);
    const coins = await suiClient.getCoins({
        owner: owner,
        coinType: coinType,
    });
    
    return coins.data;
}

/**
 * Get a single coin object with enough balance, or throw an error
 */
export async function getCoinWithBalance(
    coinMetadataId: string,
    minBalance: bigint,
    owner: string,
    networkName: SuiNetworkName = 'suiTestnet'
) {
    // Get coin details to extract coin type
    const coinType = (await getCoinDetails(coinMetadataId, networkName)).coinType;
    const coins = await getOwnedCoins(coinType, owner, networkName);
    
    if (coins.length === 0) {
        throw new Error(`No ${coinType} coins found for address ${owner}`);
    }
    
    const suitable = coins.find(coin => BigInt(coin.balance) >= minBalance);
    
    if (!suitable) {
        const totalBalance = coins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
        throw new Error(
            `No ${coinType} coin found with balance >= ${minBalance}. ` +
            `Total balance: ${totalBalance}. Available coins: ${coins.length}`
        );
    }
    
    return suitable.coinObjectId;
}

/**
 * Splits a specific amount from a coin and returns the new split coin.
 * 
 * How splitCoins works:
 * - Takes a source coin and splits off the specified amount into a NEW coin
 * - The source coin is modified in place (keeps the remainder after splitting)
 * - The source coin automatically returns to the sender (Sui's ownership system)
 * 
 * @param tx - The transaction object to add commands to
 * @param coinType - The type of coin to split (e.g., "0x2::sui::SUI")
 * @param amount - The amount to split into the new coin (in smallest units)
 * @param senderAddress - The address of the sender
 * @returns The newly created coin containing exactly `amount` units
 */
export async function splitCoin(
    tx: Transaction,
    coinMetadataId: string,
    amount: bigint,
    senderAddress: string,
    networkName: SuiNetworkName = 'suiTestnet'
): Promise<TransactionArgument> {
    // Get a coin with sufficient balance
    const sourceCoinId = await getCoinWithBalance(
        coinMetadataId,
        amount,
        senderAddress,
        networkName
    );

    // Create the source coin reference and split off the exact amount
    const sourceCoin = tx.object(sourceCoinId);
    const splitCoin = tx.splitCoins(sourceCoin, [tx.pure.u64(amount)])[0];
    
    // Return only the split coin - source coin automatically returns to sender
    return splitCoin;
}