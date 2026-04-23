import { getSuiClient, type SuiNetworkName } from './suiNetwork';

export interface CoinDetails {
    coinType: string;
    packageId: string;
    decimals: number;
    symbol: string;
}

/**
 * Get coin details (coin type, package ID, decimals, and symbol) from a CoinMetadata object ID.
 * 
 * This function takes a CoinMetadata object ID, extracts the coin type from the object's type parameter,
 * and retrieves the associated metadata to provide complete coin information.
 * 
 * @param coinMetadataId - The object ID of the CoinMetadata<T> object
 * @returns CoinDetails containing the full coin type, package ID, decimals, and symbol
 * @throws Error if the object is not found, type extraction fails, or metadata is unavailable
 */
export async function getCoinDetails(
    coinMetadataId: string,
    networkName: SuiNetworkName = 'suiTestnet'
): Promise<CoinDetails> {
    const suiClient = getSuiClient(networkName);

    // Fetch the CoinMetadata object to extract its type parameter
    const obj = await suiClient.getObject({
        id: coinMetadataId,
        options: { showType: true },
    });

    if (!obj.data) {
        throw new Error(`Object not found with ID: ${coinMetadataId}`);
    }

    if (!obj.data.type) {
        throw new Error(`Object ${coinMetadataId} does not have a type field`);
    }

    // Extract the coin type from the type parameter (e.g., 0x2::coin::CoinMetadata<0x2::sui::SUI> -> 0x2::sui::SUI)
    const match = obj.data.type.match(/<([^>]+)>/);
    
    if (!match?.[1]) {
        throw new Error(
            `Failed to extract coin type from object type: ${obj.data.type}. ` +
            `Expected format: 0x2::coin::CoinMetadata<COIN_TYPE>`
        );
    }
    
    const coinType = match[1];
    
    // Retrieve the coin metadata for decimals and symbol
    const metadata = await suiClient.getCoinMetadata({ coinType });

    if (!metadata) {
        throw new Error(`Coin metadata not found for coin type: ${coinType}`);
    }

    // Extract package ID from coin type (e.g., 0x2::sui::SUI -> 0x2)
    const packageId = coinType.split('::')[0];

    return { 
        coinType,
        packageId,
        decimals: metadata.decimals,
        symbol: metadata.symbol
    };
}