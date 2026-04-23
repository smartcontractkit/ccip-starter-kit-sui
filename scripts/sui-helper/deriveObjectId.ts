import { normalizeSuiAddress } from '@mysten/sui/utils'
import { BLAKE2b } from '@noble/hashes/blake2'
import { bcs } from '@mysten/sui/bcs'

const HASHING_INTENT_SCOPE_CHILD_OBJECT_ID = 0xf0
const SUI_FRAMEWORK_ADDRESS = '0x2'

/**
 * Derives a dynamic field ID from parent address and key bytes.
 * This mirrors the Sui Rust implementation from sui-types/src/dynamic_field.rs:derive_dynamic_field_id()
 * 
 * Algorithm:
 *   hash = Blake2b256(
 *       0xf0 +                          // HashingIntentScope::ChildObjectId
 *       parent_address +                // 32 bytes
 *       len(key_bytes) as little-endian + // 8 bytes
 *       key_bytes +                     // BCS-serialized key
 *       bcs(key_type_tag)              // BCS-serialized TypeTag
 *   )
 *   result = hash[0:32]  // First 32 bytes = ObjectID
 */
export function deriveDynamicFieldIdFromBytes(
    parentAddress: string,
    bcsKeyBytes: Uint8Array,
    bcsKeyTypeTagBytes: Uint8Array
): string {
    // Normalize parent address to 32 bytes
    const normalizedParent = normalizeSuiAddress(parentAddress)
    const parentBytes = new Uint8Array(Buffer.from(normalizedParent.slice(2), 'hex'))

    if (parentBytes.length !== 32) {
        throw new Error(`Invalid parent address length: expected 32 bytes, got ${parentBytes.length}`)
    }

    // Create hasher (32 bytes = 256 bits)
    const hash = new BLAKE2b({ dkLen: 32 })

    // Hash: intent_scope || parent || len(key) || key || key_type_tag
    hash.update(new Uint8Array([HASHING_INTENT_SCOPE_CHILD_OBJECT_ID]))
    hash.update(parentBytes)

    // Encode key length as little-endian 64-bit integer
    const keyLenBytes = new Uint8Array(8)
    const keyLen = BigInt(bcsKeyBytes.length)
    for (let i = 0; i < 8; i++) {
        keyLenBytes[i] = Number((keyLen >> BigInt(i * 8)) & BigInt(0xff))
    }
    hash.update(keyLenBytes)

    hash.update(bcsKeyBytes)
    hash.update(bcsKeyTypeTagBytes)

    const digest = hash.digest()

    // Convert hash to address (0x + hex)
    return '0x' + Buffer.from(digest).toString('hex')
}

/**
 * Derives object ID with vector<u8> key.
 * This constructs the BCS bytes for DerivedObjectKey<vector<u8>> TypeTag.
 * keyBytes should be the raw vector<u8> value - this function will BCS-serialize it.
 */
export function deriveObjectIdWithVectorU8Key(
    parentAddress: string,
    keyBytes: Uint8Array
): string {
    // BCS-serialize the key value (vector<u8> = length prefix + bytes)
    const bcsKeyBytes = bcs.vector(bcs.u8()).serialize(Array.from(keyBytes)).toBytes()

    // Get Sui framework address bytes
    const suiFrameworkNormalized = normalizeSuiAddress(SUI_FRAMEWORK_ADDRESS)
    const suiFrameworkBytes = new Uint8Array(Buffer.from(suiFrameworkNormalized.slice(2), 'hex'))

    // Manually construct BCS bytes for: TypeTag::Struct(DerivedObjectKey<vector<u8>>)
    // This avoids the SDK's BCS encoder bug with nested TypeTag enums.
    //
    // BCS format breakdown:
    //   0x07                        - TypeTag::Struct variant
    //   [32 bytes]                  - address (0x2)
    //   0x0e + "derived_object"     - module name with length prefix
    //   0x10 + "DerivedObjectKey"   - struct name with length prefix
    //   0x01                        - type params count: 1
    //   0x06 + 0x01                 - TypeTag::Vector(TypeTag::U8)

    const typeTagBytes: number[] = []
    typeTagBytes.push(0x07) // TypeTag::Struct
    typeTagBytes.push(...suiFrameworkBytes) // address (32 bytes)
    typeTagBytes.push(0x0e) // module name length (14 bytes)
    typeTagBytes.push(...Buffer.from('derived_object', 'utf-8')) // module name
    typeTagBytes.push(0x10) // struct name length (16 bytes)
    typeTagBytes.push(...Buffer.from('DerivedObjectKey', 'utf-8')) // struct name
    typeTagBytes.push(0x01) // type params count: 1
    typeTagBytes.push(0x06) // TypeTag::Vector
    typeTagBytes.push(0x01) // TypeTag::U8

    return deriveDynamicFieldIdFromBytes(
        parentAddress,
        bcsKeyBytes,
        new Uint8Array(typeTagBytes)
    )
}
