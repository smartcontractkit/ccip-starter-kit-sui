# Derive Latest Package ID

This directory contains utilities for deriving and retrieving the latest package IDs for upgradeable Sui packages using cryptographic derivation.

## Overview

When a Sui package is upgraded, a new package ID is created. The upgrade history is tracked in a shared state object that contains an array of all package IDs. These utilities use the **StatePointer pattern** with **BLAKE2b cryptographic derivation** to find the state object and retrieve the latest package ID from the upgrade history.

## Architecture

The system uses a **StatePointer pattern**:

1. **StatePointer** - An object owned by the package that contains a reference to a parent object
2. **Parent Object** - Used for cryptographic derivation
3. **State Object** - A shared object (derived from parent) that contains the `package_ids` array
4. **Latest Package ID** - The last element in the `package_ids` array

## Key Files

**In this directory:**
- `config.ts` - Package configuration interfaces and predefined configs for CCIP packages
- `stateFetcher.ts` - Finds the StatePointer object owned by a package
- `packageFetcher.ts` - Main logic to derive and retrieve the latest package ID
- `index.ts` - Clean exports for easy importing

**In parent directory (`../`):**
- `getLatestCcipPackageId.ts` - Wrapper with graceful fallback for CCIP packages


## Usage

### Getting Latest Package ID

```typescript
import { getLatestCcipPackageId } from './sui-helper/getLatestCcipPackageId';

// For upgradeable packages (CCIP, OnRamp, OffRamp)
const latestCcipPkg = await getLatestCcipPackageId(
  networkConfig.sui.ccipPackageId,
  'ccip'
);

// For Router (never upgrades, returns original)
const routerPkg = await getLatestCcipPackageId(
  networkConfig.sui.ccipRouterPackageId,
  'router'
);
```

## Important: When to Use Latest vs Original Package IDs

### Use LATEST Package ID for:
- **Transactions / PTBs** - All function calls in transactions
- **moveCall operations** - Any interaction with package functions

### Use ORIGINAL Package ID for:
- **Event queries** - Events are always emitted with original package ID
- **Event type construction** - `${originalPackageId}::module::EventType`
- **Object queries** - `getObjectFromPackage(originalPackageId, objectName)` - objects are associated with original package
- **Historical data** - Looking up past transactions/events

## Example: Correct Usage Pattern

```typescript
// ✅ CORRECT: getObjectFromPackage uses original, moveCall uses latest, events use original

// Get original package ID from config
const originalOfframpPkg = networkConfig.sui.ccipOfframpPackageId;

// Get objects - use ORIGINAL
const offrampState = await getObjectFromPackage(
  originalOfframpPkg,  // ✅ Original
  'OffRampState'
);

// Get latest for transaction
const latestOfframpPkg = await getLatestCcipPackageId(originalOfframpPkg, 'ccip_offramp');

// Transaction - use LATEST
tx.moveCall({
  package: latestOfframpPkg,  // ✅ Latest
  module: 'offramp',
  function: 'execute',
  arguments: [
    tx.object(offrampState),  // Object ID obtained using original package
  ]
});

// Event query - use ORIGINAL
const eventType = `${originalOfframpPkg}::offramp::ExecutionStateChanged`;  // ✅ Original
const events = await client.queryEvents({
  query: { MoveEventType: eventType }
});
```

## Supported Packages

Currently configured for CCIP packages:
- `ccip` - Main CCIP package (containing modules like `fee_quoter`, `onramp_state_helper`, `receiver_registry`, `token_admin_registry`, etc.)
- `ccip_onramp` - OnRamp package (retrieved from Router, handles outgoing cross-chain messages)
- `ccip_offramp` - OffRamp package (handles incoming cross-chain messages)
- `router` - Router package (never upgrades, routes messages to appropriate onramp)

## Adding New Package Types

To add support for a new upgradeable package:

1. Add configuration to `PACKAGE_UPGRADE_CONFIGS` in `config.ts`:

```typescript
export const PACKAGE_UPGRADE_CONFIGS: Record<string, PackageUpgradeConfig> = {
  'my_package': {
    moduleName: 'my_module',
    statePointerType: 'MyStatePointer',
    parentObjectFieldName: 'my_parent_id',
    stateObjectName: 'MyState',
    packageIdsFieldName: 'package_ids',  // Optional, defaults to 'package_ids'
  },
  // ... existing configs
};
```

2. Update `getLatestCcipPackageId.ts` to support the new type:

```typescript
export async function getLatestCcipPackageId(
  originalPackageId: string,
  packageType: 'ccip' | 'ccip_onramp' | 'ccip_offramp' | 'router' | 'my_package'
): Promise<string> {
  // ...
}
```

## Dependencies

- `@mysten/sui/client` - Sui SDK for blockchain queries
- `../deriveObjectId.ts` - Cryptographic derivation utilities (BLAKE2b)

## Error Handling

The `getLatestCcipPackageId()` function ([getLatestCcipPackageId.ts](../getLatestCcipPackageId.ts)) implements **graceful fallback**:
- If upgrade tracking is unavailable (StatePointer not found), returns the original package ID
- Logs a warning with error details for debugging
- Never throws errors - always returns a valid package ID

This ensures your application continues to work even if:
- Upgrade tracking hasn't been initialized for a package
- Network issues prevent fetching the state object
- The package structure changes

## Testing

Test suite includes:
- **Unit tests** (`tests/unit/`) - Cryptographic derivation validation
- **Integration tests** (`tests/integration/`) - Network-based validation against Sui testnet

Run tests with: `npm test`