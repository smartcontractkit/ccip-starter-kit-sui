import { deriveObjectIdWithVectorU8Key } from './deriveObjectId';
import { networkConfig } from '../../helperConfig';
import { getSuiClient, getSuiConfig, type SuiNetworkName } from './suiNetwork';

/**
* `getObjectFromPackage` attempts to find an object's ID within a package based on its name.
* 
* This is useful for finding the state object's ID via the state pointer object. The pointer object is always
* owned, however, the method includes a fallback of checking the most recent transaction's object
* changes to find an object within the specified package.
*
* Fast path (Strategy 0): if `targetObjectName` is present in
* `getSuiConfig(networkName).knownStateObjects`, the hardcoded object ID is
* returned immediately. This bypasses `getOwnedObjects` and the historical
* `getTransactionBlock` lookup, both of which can fail on pruning fullnodes.
*/
export async function getObjectFromPackage(
    packageId: string,
    targetObjectName: string,
    networkName: SuiNetworkName = 'suiTestnet'
) {
    const suiClient = getSuiClient(networkName);

    // Strategy 0: hardcoded singleton state-object shortcut (see helperConfig.ts
    // `knownStateObjects`). Only applies to the well-known CCIP singletons —
    // anything else (per-token pool state, per-package pointers, etc.) still
    // falls through to the discovery strategies below.
    const suiConfig = getSuiConfig(networkName);
    const knownStateObjects = (suiConfig as { knownStateObjects?: { [key: string]: string } })
        .knownStateObjects;
    const knownId = knownStateObjects?.[targetObjectName];
    if (knownId) {
        console.log(
            `🔎 getObjectFromPackage: using hardcoded ${targetObjectName} = ${knownId} from ${suiConfig.networkName} config (package ${packageId} not queried)`
        );
        return knownId;
    }

    // Strategy 1: Query objects owned by the package and derive shared objects from pointers
    let hasNextPage = true;
    let cursor: string | null | undefined = undefined;

    while (hasNextPage) {
        const ownedObjects = await suiClient.getOwnedObjects({
            owner: packageId,
            options: {
                showType: true,
                showContent: true,
            },
            cursor,
        });

        for (const obj of ownedObjects.data) {
            if (obj.data?.type) {
                const structName = obj.data.type.match(/::([^:]+)::([^<]+)/)?.[2];
                
                // Direct match - object is owned by package
                if (structName === targetObjectName) {
                    return obj.data.objectId;
                }
                
                // Try to derive from pointer object (for shared objects)
                if (structName?.endsWith('Pointer') && obj.data.content?.dataType === 'moveObject') {
                    const fields = obj.data.content.fields as any;
                    
                    // Look for a parent object field (common patterns)
                    const parentIdField = Object.keys(fields).find(key => 
                        key.includes('object_id') || key.includes('parent')
                    );
                    
                    if (parentIdField) {
                        const parentId = fields[parentIdField];
                        
                        // Derive the target state object using cryptographic derivation
                        try {
                            const stateKeyBytes = new Uint8Array(Buffer.from(targetObjectName, 'utf-8'));
                            const derivedId = deriveObjectIdWithVectorU8Key(parentId, stateKeyBytes);
                            
                            // Verify it exists by checking its type
                            const derivedObj = await suiClient.getObject({
                                id: derivedId,
                                options: { showType: true },
                            });
                            
                            if (derivedObj.data?.type) {
                                const derivedStructName = derivedObj.data.type.match(/::([^:]+)::([^<]+)/)?.[2];
                                if (derivedStructName === targetObjectName) {
                                    return derivedId;
                                }
                            }
                        } catch (e) {
                            // Derivation failed, continue searching
                            continue;
                        }
                    }
                }
            }
        }

        hasNextPage = ownedObjects.hasNextPage;
        cursor = ownedObjects.nextCursor;
    }

    // Strategy 2: Fallback to initial package publish transaction
    // Only use this if package version is 1 (initial publish) to ensure reliability
    // This catches objects that can't be found via Strategy 1 (owned/derived):
    // - Objects transferred to addresses (e.g., ccip_message_receiver::dummy_receiver::OwnerCap transferred to deployer)
    // - Shared objects without pointer objects (e.g., ccip_message_receiver::dummy_receiver::CCIPReceiverState with no pointer to derive from)
    const packageObject = await suiClient.getObject({
        id: packageId,
        options: {
            showPreviousTransaction: true,
        },
    });

    if (String(packageObject.data?.version) === '1' && packageObject.data?.previousTransaction) {
        const txBlock = await suiClient.getTransactionBlock({
            digest: packageObject.data.previousTransaction,
            options: {
                showEffects: true,
                showObjectChanges: true,
            },
        });

        const created = txBlock.effects?.created || [];

        for (const obj of created) {
            const objectDetails = await suiClient.getObject({
                id: obj.reference.objectId,
                options: {
                    showType: true,
                    showOwner: true,
                },
            });

            if (objectDetails.data?.type) {
                const structName = objectDetails.data.type.match(/::([^:]+)::([^<]+)/)?.[2];

                if (structName === targetObjectName) {
                    return obj.reference.objectId;
                }
            }
        }
    }

    /// Strategy 3: Special fallback for specific state objects - check initialize function calls
    // This catches state objects created by calling the initialize function after deployment
    const initializeConfigs: Record<string, string> =
        networkName === networkConfig.suiMainnet.networkName
            ? {}
            : {
                  FaucetState: networkConfig.sui.faucetModuleName,
                  TokenState: networkConfig.sui.managedTokenModuleName,
              };

    const moduleName = initializeConfigs[targetObjectName];
    
    if (moduleName) {
        try {
            const txResponse = await suiClient.queryTransactionBlocks({
                filter: {
                    MoveFunction: {
                        package: packageId,
                        module: moduleName,
                        function: 'initialize',
                    }
                },
                options: {
                    showEffects: true,
                    showObjectChanges: true,
                },
                limit: 50,
            });

            for (const tx of txResponse.data) {
                const created = tx.effects?.created || [];
                
                for (const obj of created) {
                    const objectDetails = await suiClient.getObject({
                        id: obj.reference.objectId,
                        options: {
                            showType: true,
                            showOwner: true,
                        },
                    });

                    if (objectDetails.data?.type) {
                        const structName = objectDetails.data.type.match(/::([^:]+)::([^<]+)/)?.[2];
                        
                        if (structName === targetObjectName) {
                            return obj.reference.objectId;
                        }
                    }
                }
            }
        } catch (e) {
            // Could not query initialize transactions, continue to error
        }
    }

    throw new Error(`Object '${targetObjectName}' not found`);
}