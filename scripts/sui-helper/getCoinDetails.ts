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
 * Reads everything from the CoinMetadata object itself. suix_getCoinMetadata is intentionally
 * avoided: it derives a deterministic object ID from the coin type and only finds metadata
 * created via sui::coin::create_currency. Managed-token CoinMetadata (e.g. CCIP BnM) is minted
 * with a fresh UID at a non-deterministic address, so that RPC returns null for it even though
 * the object exists at the given ID.
 *
 * @param coinMetadataId - The object ID of the CoinMetadata<T> object
 * @returns CoinDetails containing the full coin type, package ID, decimals, and symbol
 * @throws Error if the object is not found, type extraction fails, or content is unavailable
 */
export async function getCoinDetails(
    coinMetadataId: string,
    networkName: SuiNetworkName = 'suiTestnet'
): Promise<CoinDetails> {
    const suiClient = getSuiClient(networkName);

    const obj = await suiClient.getObject({
        id: coinMetadataId,
        options: { showType: true, showContent: true },
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

    // Read decimals/symbol directly from the CoinMetadata object content.
    const content = obj.data.content;
    if (!content || content.dataType !== 'moveObject' || !content.fields) {
        throw new Error(`CoinMetadata object ${coinMetadataId} has no readable content`);
    }
    const fields = content.fields as { decimals?: number; symbol?: string };

    if (fields.decimals === undefined || fields.symbol === undefined) {
        throw new Error(`CoinMetadata object ${coinMetadataId} is missing decimals or symbol`);
    }

    // Extract package ID from coin type (e.g., 0x2::sui::SUI -> 0x2)
    const packageId = coinType.split('::')[0];

    return {
        coinType,
        packageId,
        decimals: fields.decimals,
        symbol: fields.symbol,
    };
}