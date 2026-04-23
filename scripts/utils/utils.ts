import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { networkConfig, supportedEvmChains } from '../../helperConfig';
import { ethers, getAddress, Interface, zeroPadValue } from "ethers";
import { SuiClient } from '@mysten/sui/client';
import { normalizeSuiAddress, toHex } from '@mysten/sui/utils';

// Decode Sui private key and convert it to base64
export function bech32ToBase64(bech32PrivateKey: string): string {
  const { scheme, secretKey: rawBytes } = decodeSuiPrivateKey(bech32PrivateKey);
  console.log('Schema for Sui private key:', scheme);  // eg: 'ED25519'

  const base64PrivateKey = Buffer.from(rawBytes).toString('base64');
  return base64PrivateKey;
}

export interface EvmChainConfig {
  networkName: string;
  chainSelector: string;
  ccipRouterAddress: string;
  ccipOnrampAddress: string;
  linkTokenAddress: string;
  explorerUrl: string;
  rpcUrlEnv: string;
  ccipOfframpAddress: string;
  ccipBnMTokenAddress: string;
}

// Define an interface for Sui chain configurations to ensure type safety
export interface SuiChainConfig {
  networkName: string;
  chainSelector: string;
  ccipPackageId: string;
  ccipRouterModuleName: string;
  ccipRouterPackageId: string;
  ccipOfframpModuleName: string;
  ccipOfframpPackageId: string;
  ccipOnrampModuleName: string;
  ccipBnMCoinMetadataId: string;
  feeTokenNameLink: string;
  feeTokenNameNative: string;
  linkCoinMetadataId: string;
  suiCoinMetadataId: string;
  ccipReceiverPackageName: string;
  ccipReceiverModuleName: string;
  destChains: { [key: string]: string };
}

export type ChainConfig = EvmChainConfig | SuiChainConfig;

/**
 * Enum for CCIP message execution states
 * Matches the Internal.MessageExecutionState enum used in CCIP OffRamp contracts
 */
export enum MessageExecutionState {
  UNTOUCHED = 0,
  IN_PROGRESS = 1,
  SUCCESS = 2,
  FAILURE = 3,
}

// Type guard to check if a config is an EVM chain configuration.
function isEvmChainConfig(config: unknown): config is EvmChainConfig {
  return (
    typeof config === 'object' &&
    config !== null &&
    'ccipRouterAddress' in config &&
    'ccipOnrampAddress' in config &&
    'rpcUrlEnv' in config
  );
}

/**
 * Retrieves the EVM chain configuration for a given source chain.
 * @param sourceChain The name of the source chain (e.g., 'sepolia', 'arbitrumSepolia').
 * @returns The EVM chain configuration object.
 * @throws Error if the source chain is invalid or not supported.
 */
export function getEvmChainConfig(sourceChain: string): EvmChainConfig {
  const chainConfig = Object.values(networkConfig).find(
    (config): config is EvmChainConfig =>
      isEvmChainConfig(config) && config.networkName === sourceChain
  );

  if (!chainConfig) {
    throw new Error(
      `Invalid destination chain specified: ${sourceChain}. Please specify a valid destination chain from ${supportedEvmChains.join(', ')}.`
    );
  }

  return chainConfig;
}

// export function parseVecU8(input: string | undefined): Uint8Array {
//   if (!input || input.length === 0) return new Uint8Array()
//   const s = input.trim()
//   if (s.startsWith('0x')) return Uint8Array.from(Buffer.from(s.slice(2), 'hex'))
//   return Uint8Array.from(Buffer.from(s, 'base64'))
// }

export function parseVecU8(input: string | undefined): Uint8Array {
  if (!input || input.length === 0) return new Uint8Array()
  const s = input.trim()
  // Use ethers for hex conversion
  if (s.startsWith('0x')) return ethers.getBytes(s)
  return Uint8Array.from(Buffer.from(s, 'base64'))
}

/**
 * Converts an array of addresses to vector<address> format
 * Uses Sui SDK's normalizeSuiAddress for proper address handling
 * @param addresses - Array of Sui addresses
 * @returns Array of normalized 32-byte Sui addresses
 * 
 * @example
 * parseVecAddress(["0x123", "0x456"]) // Returns normalized addresses
 */
export function parseVecAddress(addresses: string[]): string[] {
  if (!addresses || addresses.length === 0) return []
  return addresses.map(addr => normalizeSuiAddress(addr.trim()))
}

/**
 * Converts an array of numbers to vector<u64> format
 * Uses ethers.getBigInt for safe BigInt conversion
 * @param numbers - Array of numbers or number strings
 * @returns Array of bigints
 * 
 * @example
 * parseVecU64([123, "456", 789]) // Returns [123n, 456n, 789n]
 */
export function parseVecU64(numbers: (string | number | bigint)[]): bigint[] {
  if (!numbers || numbers.length === 0) return []
  return numbers.map(num => ethers.getBigInt(num.toString().trim()))
}

/**
 * Validates if a string is a valid Sui address.
 * A valid Sui address is a 32-byte hex string (64 hex characters) prefixed with 0x.
 * @param address The address string to validate
 * @returns true if the address is valid, false otherwise
 */
export function isValidSuiAddress(address: string): boolean {
  // Check if address starts with 0x and has exactly 64 hex characters after it
  const suiAddressRegex = /^0x[a-fA-F0-9]{64}$/;
  return suiAddressRegex.test(address);
}

/**
 * Validates if a string is a valid EVM address.
 * Uses ethers.js getAddress to check if the address is valid and properly checksummed.
 * @param address The address string to validate
 * @returns true if the address is valid, false otherwise
 */
export function isValidEvmAddress(address: string): boolean {
  try {
    getAddress(address);
    return true;
  } catch {
    return false;
  }
}

export function evmAddressToBytes32(address: string): `0x${string}` {
  // Validate and normalize the address
  const checksummed = getAddress(address);
  // Pad to 32 bytes (left/leading zeroes)
  return zeroPadValue(checksummed, 32) as `0x${string}`;
}

export async function handleError(
  interfaces: { name: string; iface: Interface }[],
  err: any
) {

  console.log(err)
  const data = err.data ?? err.error?.data;

  if (!data || typeof data !== "string" || !data.startsWith("0x")) {
    console.error("No valid revert data.");
    return;
  }

  const selector = data.slice(0, 10);

  if (selector == "0x08c379a0") {
    // Error(string)
    try {
      const fallbackInterface = interfaces[0].iface; // pick any to decode standard error
      const reason = fallbackInterface.decodeErrorResult("Error(string)", data);
      console.log("Require/Revert with string: ", reason[0]);
    } catch {
      console.log("Failed to decode standard error.");
    }
  } else if (selector == "0x4e487b71") {
    // Panic(uint256)
    const code = parseInt(data.slice(10, 74), 16);
    console.log("Panic with code: ", code);
  } else {
    // Try parsing with each interface
    let matched = false;
    for (const { iface } of interfaces) {
      try {
        const decoded = iface.parseError(data);
        console.log("Custom Error: ", decoded!.name);

        if (decoded!.args.length > 0) {
          const namedArgs: { [key: string]: any } = {};
          decoded!.fragment.inputs.forEach((input, index) => {
            namedArgs[input.name] = decoded!.args[index]
          });
          console.log({ args: namedArgs });
        }

        matched = true;
        break;
      } catch {
        continue;
      }
    }
    if (!matched) {
      console.log("Unknown error format or not found in any interface.");
    }
  }
}

/**
 * Fetches the CCIP Message ID from a Sui transaction by parsing the CCIPMessageSent event
 * @param txHash - The transaction hash/digest
 * @param client - The Sui client instance
 * @returns The message ID as a hex string (0x...)
 */
export async function fetchEventsByTxHash(txHash: string, client: SuiClient): Promise<string> {
  try {
    const transaction = await client.getTransactionBlock({
      digest: txHash,
      options: { showEvents: true }
    });

    if (!transaction.events || transaction.events.length === 0) {
      throw new Error('No events found in transaction.');
    }

    // Find the CCIPMessageSent event
    const ccipSendEvent = transaction.events.find((event) =>
      event.type.includes('onramp::CCIPMessageSent')
    );

    if (!ccipSendEvent) {
      throw new Error('CCIPMessageSent event not found in transaction.');
    }

    // Extract message_id from event data
    // The event structure has a nested message object with header.message_id
    const eventData = ccipSendEvent.parsedJson as any;

    // Navigate through the nested structure: message -> header -> message_id
    const messageIdBytes = eventData?.message?.header?.message_id;

    if (!messageIdBytes) {
      // Debug: log the actual structure if format is unexpected
      console.error('Event data structure:', JSON.stringify(eventData, null, 2));
      throw new Error('Invalid message_id format in event data.');
    }

    // Convert the byte array to a hex string using Sui SDK's toHex utility
    // Note: toHex returns without 0x prefix, so we add it
    return '0x' + toHex(Uint8Array.from(Object.values(messageIdBytes)));
  } catch (error) {
    throw new Error(`Error fetching transaction events: ${error}`);
  }
}

/**
 * Convert a token amount to its base unit representation
 * @param amount - The human-readable amount (e.g., 1.5)
 * @param decimals - The number of decimals for the token
 * @returns The amount in base units as a bigint
 * 
 * @example
 * convertToBaseUnit(1.5, 9) // Returns 1500000000n (1.5 * 10^9)
 * convertToBaseUnit(0.001, 9) // Returns 1000000n (0.001 * 10^9)
 */
export function convertToBaseUnit(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * Convert a token amount from base units to human-readable format
 * @param amount - The amount in base units (bigint)
 * @param decimals - The number of decimals for the token
 * @returns The human-readable amount as a number
 * 
 * @example
 * convertFromBaseUnit(1500000000n, 9) // Returns 1.5
 * convertFromBaseUnit(1000000n, 9) // Returns 0.001
 */
export function convertFromBaseUnit(amount: bigint, decimals: number): number {
  return Number(amount) / Math.pow(10, decimals);
}

/**
 * refer to the https://github.com/smartcontractkit/chainlink-ccip/blob/main/chains/evm/contracts/libraries/Client.sol#L98
 * to check SuiExtraArgsV1. TokenReceiver and receiverObjectIds have to be added to the extraArgs
*/

const SUI_EXTRA_ARGS_V1_TAG = '0x21ea4ca9';

export interface SuiExtraArgsV1 {
  gasLimit: bigint;
  allowOutOfOrderExecution: boolean;
  tokenReceiver: string;
  receiverObjectIds: string[];
}

export function encodeSuiExtraArgsV1({
  gasLimit,
  allowOutOfOrderExecution,
  tokenReceiver,
  receiverObjectIds
}: SuiExtraArgsV1): string {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  const encodedArgs = abiCoder.encode(
    ["tuple(uint256, bool, bytes32, bytes32[])"],
    [[gasLimit, allowOutOfOrderExecution, tokenReceiver, receiverObjectIds]]
  )
  return ethers.concat([SUI_EXTRA_ARGS_V1_TAG, encodedArgs]);
}

/**
 * Converts a Sui object ID to bytes32 format (0x-prefixed, 64 hex characters)
 * @param objectId - The Sui object ID (e.g., "0x6" for clock)
 * @returns The object ID padded to 32 bytes in hex format
 */
export function suiObjectIdToBytes32(objectId: string): string {
  // Ensure the objectId has proper hex format (even length)
  const hex = objectId.startsWith('0x') ? objectId.slice(2) : objectId;
  const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
  return zeroPadValue('0x' + paddedHex, 32);
}

const GENERIC_EXTRA_ARGS_V2_TAG = '0x181dcf10';

export function encodeGenericExtraArgsV2(gasLimit: bigint, allowOutOfOrderExecution: boolean): Uint8Array {
    // Encode gasLimit (u256) as 32 bytes in little-endian
    const gasLimitBytes = new Uint8Array(bigIntToBytes(gasLimit));
    
    // Encode allowOutOfOrderExecution (boolean) as bytes
    const boolBytes = new Uint8Array([allowOutOfOrderExecution ? 1 : 0]);

    // Concatenate tag + gasLimit + bool
    const encoded = ethers.concat([
        GENERIC_EXTRA_ARGS_V2_TAG,
        gasLimitBytes,
        boolBytes
    ]);

    return ethers.getBytes(encoded);
}

// Helper function to convert BigInt to bytes
function bigIntToBytes(value: bigint): number[] {
    // Assuming little-endian encoding for u256 (32 bytes)
    const bytes = new Array<number>(32).fill(0);
    let val = value;
    for (let i = 0; i < 32 && val > 0; i++) {
        bytes[i] = Number(val & BigInt(0xff));
        val >>= BigInt(8);
    }
    return bytes;
}