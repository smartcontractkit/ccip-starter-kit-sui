import { SuiClient } from '@mysten/sui/client';
import { PackageUpgradeConfig } from '../../../helperConfig';

/**
 * Finds the StatePointer object owned by a package.
 * The StatePointer contains a reference to the parent object used for derivation.
 */
export async function getStatePointerFromPackageId(
    client: SuiClient,
    packageId: string,
    config: PackageUpgradeConfig
): Promise<string> {
    let hasNextPage = true;
    let cursor: string | null | undefined = undefined;
    let statePointerObjectId: string | null = null;

    const fullStatePointerType = `${packageId}::${config.moduleName}::${config.statePointerType}`;

    while (hasNextPage && !statePointerObjectId) {
        const ownedObjects = await client.getOwnedObjects({
            owner: packageId,
            options: {
                showType: true,
                showContent: true,
            },
            cursor,
        });

        for (const obj of ownedObjects.data) {
            if (obj.data?.type === fullStatePointerType) {
                statePointerObjectId = obj.data.objectId;
                break;
            }
        }

        hasNextPage = ownedObjects.hasNextPage;
        cursor = ownedObjects.nextCursor;
    }

    if (!statePointerObjectId) {
        throw new Error(`StatePointer object not found for type: ${fullStatePointerType}`);
    }

    return statePointerObjectId;
}
