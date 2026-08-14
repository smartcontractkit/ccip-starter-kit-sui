import { getLatestPackageId, PACKAGE_UPGRADE_CONFIGS } from './derive-latest-package-id';
import { getSuiClient, getSuiConfig, type SuiNetworkName } from './suiNetwork';

// The set of upgradeable CCIP package types is defined once, by the keys of
// PACKAGE_UPGRADE_CONFIGS (see helperConfig.ts). `'router'` is handled
// separately — it is never upgraded and is intentionally absent from that map.
type CcipPackageType = keyof typeof PACKAGE_UPGRADE_CONFIGS;

/**
 * Helper function to get the latest package ID for upgradeable CCIP packages.
 * Returns the original package ID for packages that don't track upgrades (like Router).
 *
 * Resolution order:
 *   1. Router → always return the original (Router is never upgraded).
 *   2. Config fast-path: if `helperConfig.<network>.knownLatestPackageIds[packageType]`
 *      is set, return it. This avoids the getOwnedObjects walk in
 *      `getStatePointerFromPackageId`, which fails on RPCs that don't index
 *      package-address-as-owner mappings (returns empty ⇒ StatePointer
 *      "not found" ⇒ fallback to original ⇒ downstream get_fee fails because
 *      the original package's FeeQuoter config predates newer dest chains).
 *   3. Full derivation walk (getStatePointer → derive state obj → read package_ids[]).
 *   4. On any exception in (3), warn and fall back to the original package ID.
 *
 * @param originalPackageId - The original package ID from config
 * @param packageType - Type of package: a key of PACKAGE_UPGRADE_CONFIGS ('ccip',
 *   'ccip_onramp', 'ccip_offramp') or 'router'
 * @returns The latest package ID if upgradeable, otherwise the original package ID
 */
export async function getLatestCcipPackageId(
    originalPackageId: string,
    packageType: CcipPackageType | 'router',
    networkName: SuiNetworkName = 'suiTestnet'
): Promise<string> {
    const suiClient = getSuiClient(networkName);

    // Router never upgrades, return original package ID
    if (packageType === 'router') {
        return originalPackageId;
    }

    // Fast path: hardcoded latest package IDs from helperConfig.
    const suiConfig = getSuiConfig(networkName);
    const knownLatestPackageIds = (suiConfig as {
        knownLatestPackageIds?: { [key: string]: string };
    }).knownLatestPackageIds;
    const knownLatest = knownLatestPackageIds?.[packageType];
    if (knownLatest) {
        console.log(
            `🔎 getLatestCcipPackageId: using hardcoded latest ${packageType} = ${knownLatest} from ${suiConfig.networkName} config (original ${originalPackageId} not queried)`
        );
        return knownLatest;
    }

    // For upgradeable packages, fetch the latest package ID
    const config = PACKAGE_UPGRADE_CONFIGS[packageType];
    if (!config) {
        throw new Error(`Unknown package type: ${packageType}`);
    }

    try {
        return await getLatestPackageId(suiClient, originalPackageId, config, false);
    } catch (error) {
        console.warn(`Failed to get latest package ID for ${packageType}, using original:`, error);
        return originalPackageId;
    }
}