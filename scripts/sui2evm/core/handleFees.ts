import { Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import { getCoinDetails } from '../../sui-helper/getCoinDetails';
import { getCoinWithBalance } from '../../sui-helper/splitCoin';
import { getFee } from '../../sui-helper/getFee';
import { getSuiConfig, type SuiNetworkName } from '../../sui-helper/suiNetwork';
import { parseVecAddress, parseVecU64, convertFromBaseUnit } from '../../utils/utils';

export interface CoinMetadata {
  id: string;
  decimals: number;
  symbol: string;
}

export interface FeeResult {
  feeToken: TransactionArgument;
  feeTokenType: string;
  feeTokenMetadata: CoinMetadata;
  baseFee: bigint;
  feeWithBuffer: bigint;
}

export interface FeeCalculationParams {
  tx: Transaction;
  onRampPackageId: string;  // Latest OnRamp package ID
  ccipObjectRef: string;
  chainSelector: string;
  receiver: Uint8Array;
  data: Uint8Array;
  tokenAddresses?: string[]; // Optional for message-only transfers
  tokenAmounts?: bigint[];   // Optional for message-only transfers
  extraArgs: Uint8Array;
  useLinkForFees: boolean;
  senderAddress: string;
  networkName: SuiNetworkName;
}

/**
 * Calculates CCIP fees and prepares the appropriate fee token for the transaction
 * Handles both LINK and native (SUI) fee tokens
 * 
 * @param params - Fee calculation parameters
 * @returns FeeResult containing prepared fee token and fee amounts
 */
export async function calculateAndPrepareFees(
  params: FeeCalculationParams
): Promise<FeeResult> {
  const {
    tx,
    onRampPackageId: latestOnRampPackageId,
    ccipObjectRef,
    chainSelector,
    receiver,
    data,
    tokenAddresses = [],
    tokenAmounts = [],
    extraArgs,
    useLinkForFees,
    senderAddress,
    networkName
  } = params;

  const suiConfig = getSuiConfig(networkName);

  // Determine fee token metadata ID
  const feeTokenMetadataId = useLinkForFees
    ? suiConfig.linkCoinMetadataId
    : suiConfig.suiCoinMetadataId;

  // Get fee token details 
  const feeTokenDetails = await getCoinDetails(feeTokenMetadataId, networkName);
  const feeTokenType = feeTokenDetails.coinType;

  const feeTokenMetadata = {
    id: feeTokenMetadataId,
    decimals: feeTokenDetails.decimals,
    symbol: feeTokenDetails.symbol
  };

  // Prepare token addresses and amounts for fee calculation
  const tokenAddressesForFee = parseVecAddress(tokenAddresses);
  const tokenAmountsForFee = parseVecU64(tokenAmounts);

  // Calculate base fee
  const baseFee = BigInt(await getFee(
    latestOnRampPackageId,
    ccipObjectRef,
    chainSelector,
    receiver,
    data,
    tokenAddressesForFee,
    tokenAmountsForFee,
    feeTokenType,
    feeTokenMetadata.id,
    extraArgs,
    networkName
  ));

  // Add 20% buffer to handle fee fluctuations
  const margin = baseFee / 5n; // 20% of base fee
  const feeWithBuffer = baseFee + margin;

  let feeToken: TransactionArgument;

  if (useLinkForFees) {
    // Using LINK for fees
    console.log('⬡ Using LINK for fees');
    console.log(`Base Fee (in LINK JUELS): ${baseFee.toString()} (${convertFromBaseUnit(baseFee, feeTokenMetadata.decimals)} LINK)`);
    console.log(`Fee with 20% buffer (in LINK JUELS): ${feeWithBuffer.toString()} (${convertFromBaseUnit(feeWithBuffer, feeTokenMetadata.decimals)} LINK)`);

    // Get a coin with sufficient LINK balance
    const linkCoinId = await getCoinWithBalance(
      feeTokenMetadataId,
      feeWithBuffer,
      senderAddress,
      networkName
    );

    feeToken = tx.object(linkCoinId);
  } else {
    // Using SUI (native token) for fees via tx.gas
    console.log('💧 Using SUI for fees');
    console.log(`Base Fee (in MIST): ${baseFee.toString()} (${convertFromBaseUnit(baseFee, feeTokenMetadata.decimals)} SUI)`);
    console.log(`Fee with 20% buffer (in MIST): ${feeWithBuffer.toString()} (${convertFromBaseUnit(feeWithBuffer, feeTokenMetadata.decimals)} SUI)`);

    feeToken = tx.gas;
  }

  return {
    feeToken,
    feeTokenType,
    feeTokenMetadata,
    baseFee,
    feeWithBuffer
  };
}