import { getLatestPackageId, PACKAGE_UPGRADE_CONFIGS } from './derive-latest-package-id';
import { getSuiClient, type SuiNetworkName } from './suiNetwork';

/**
 * Helper function to get the latest package ID for upgradeable CCIP packages.
 * Returns the original package ID for packages that don't track upgrades (like Router).
 * 
 * @param originalPackageId - The original package ID from config
 * @param packageType - Type of package: 'ccip', 'ccip_onramp', 'ccip_offramp', or 'router'
 * @returns The latest package ID if upgradeable, otherwise the original package ID
 */
export async function getLatestCcipPackageId(
    originalPackageId: string,
    packageType: 'ccip' | 'ccip_onramp' | 'ccip_offramp' | 'router',
    networkName: SuiNetworkName = 'suiTestnet'
): Promise<string> {
    const suiClient = getSuiClient(networkName);

    // Router never upgrades, return original package ID
    if (packageType === 'router') {
        return originalPackageId;
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