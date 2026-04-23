import { SuiClient } from '@mysten/sui/client';
import { PackageUpgradeConfig } from './config';
import { deriveObjectIdWithVectorU8Key } from '../deriveObjectId';
import { getStatePointerFromPackageId } from './stateFetcher';

/**
 * Gets the latest package ID for an upgradeable package.
 * 
 * @param client - Sui client instance
 * @param originalPackageId - The original package ID
 * @param config - Package upgrade configuration
 * @param strict - If true, throws error if package_ids field not found. If false, returns original package ID as fallback.
 * @returns The latest package ID
 */
export async function getLatestPackageId(
    client: SuiClient,
    originalPackageId: string,
    config: PackageUpgradeConfig,
    strict = true
): Promise<string> {
    // Step 1: Find StatePointer object owned by the package
    const statePointerObjectId = await getStatePointerFromPackageId(client, originalPackageId, config);

    // Step 2: Read parent object ID from StatePointer
    const statePointerObject = await client.getObject({
        id: statePointerObjectId,
        options: {
            showContent: true,
        },
    });

    const content = statePointerObject.data?.content;
    if (content?.dataType !== 'moveObject') {
        throw new Error('StatePointer is not a Move object');
    }

    const parentObjectId = (content.fields as any)[config.parentObjectFieldName];
    if (!parentObjectId) {
        throw new Error(`Field "${config.parentObjectFieldName}" not found in StatePointer`);
    }

    // Step 3: Derive state object ID from parent object
    const stateObjectKeyBytes = new Uint8Array(Buffer.from(config.stateObjectName, 'utf-8'));
    const stateObjectId = deriveObjectIdWithVectorU8Key(parentObjectId, stateObjectKeyBytes);

    // Step 4: Read package_ids array from State object
    const stateObject = await client.getObject({
        id: stateObjectId,
        options: {
            showContent: true,
        },
    });

    const stateContent = stateObject.data?.content;
    if (stateContent?.dataType !== 'moveObject') {
        throw new Error('State object is not a Move object');
    }

    const packageIdsFieldName = config.packageIdsFieldName || 'package_ids';
    const packageIdsField = (stateContent.fields as any)[packageIdsFieldName];

    if (!packageIdsField) {
        if (strict) {
            throw new Error(`${packageIdsFieldName} field not found in State object`);
        }
        return originalPackageId;
    }

    if (!Array.isArray(packageIdsField)) {
        throw new Error(`${packageIdsFieldName} field must be an array`);
    }

    const packageIds: string[] = packageIdsField;

    if (packageIds.length === 0) {
        throw new Error('package_ids array is empty');
    }

    return packageIds[packageIds.length - 1]!;
}
