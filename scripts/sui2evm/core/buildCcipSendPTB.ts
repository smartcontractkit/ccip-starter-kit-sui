import { Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import { networkConfig } from '../../../helperConfig';
import type { CoinMetadata } from './handleFees';

/**
 * Common arguments for CCIP send call
 * NOTE: All package IDs should be LATEST versions (from getLatestCcipPackageId)
 * for transactions/PTBs. Original package IDs are only used for event queries.
 */
interface CcipSendCallArgs {
  ccipPkg: string;       // Latest CCIP package ID
  onrampPkg: string;     // Latest OnRamp package ID
  ccipObjectRef: string;
  onrampState: string;
  destChainSelector: bigint;
  receiver: Uint8Array;
  data: Uint8Array;
  tokenParams: TransactionArgument;
  feeToken: TransactionArgument;
  feeTokenType: string;
  feeTokenMetadata: CoinMetadata;
  extraArgs: Uint8Array;
  clockObjectId?: string;
  denyListObjectId?: string;
}

/**
 * Arguments for token-only transfer PTB
 * NOTE: ccipPkg, onrampPkg, and poolPkg should all be LATEST versions
 *
 * Receiver fields:
 *   - `receiver` is the token recipient: it is passed to
 *     `create_token_transfer_params` and becomes `token_params.token_receiver`,
 *     which the Sui OnRamp requires to equal `SVMExtraArgsV1.tokenReceiver` and to
 *     be non-zero for SVM token sends (onramp.move:818-827).
 *   - `messageReceiver` is the CCIP `message.receiver` passed to `ccip_send`. For
 *     EVM destinations it equals the token recipient (EVM has no separate
 *     tokenReceiver), so it defaults to `receiver` when omitted. For SVM
 *     token-only sends it must be the 32-byte zero address so the Solana OffRamp
 *     does not try to CPI into a receiver program; for SVM message+token sends it
 *     is the receiver PROGRAM the OffRamp CPIs into while tokens go to `receiver`.
 */
export interface TokenTransferArgs {
  ccipPkg: string;       // Latest CCIP package ID
  onrampPkg: string;     // Latest OnRamp package ID
  poolPkg: string;       // Latest pool package ID
  coinType: string;
  ccipObjectRef: string;
  onrampState: string;
  tokenMetadata: string;
  tokenCoin: TransactionArgument;
  tokenPoolState: string;
  tokenState: string;
  poolKind: 'burn_mint' | 'lock_release' | 'managed_pool';
  feeToken: TransactionArgument;
  feeTokenType: string;
  feeTokenMetadata: CoinMetadata;
  destChainSelector: bigint;
  receiver: Uint8Array;
  /** CCIP message.receiver; defaults to `receiver` (EVM). Set to 32 zero bytes for SVM token-only, or the receiver program for SVM message+token. */
  messageReceiver?: Uint8Array;
  data: Uint8Array;
  extraArgs: Uint8Array;
  clockObjectId?: string;
  denyListObjectId?: string;
}

/**
 * Arguments for message-only PTB
 * NOTE: ccipPkg and onrampPkg should be LATEST versions
 */
export interface MessageArgs {
  ccipPkg: string;       // Latest CCIP package ID
  onrampPkg: string;     // Latest OnRamp package ID
  ccipObjectRef: string;
  onrampState: string;
  feeToken: TransactionArgument;
  feeTokenType: string;
  feeTokenMetadata: CoinMetadata;
  destChainSelector: bigint;
  receiver: Uint8Array;
  data: Uint8Array;
  extraArgs: Uint8Array;
  clockObjectId?: string;
  denyListObjectId?: string;
}

/**
 * Adds the token pool call (lock_or_burn) to the transaction
 */
function addTokenPoolCall(
  tx: Transaction,
  args: {
    poolPkg: string;
    poolKind: 'burn_mint' | 'lock_release' | 'managed_pool';
    coinType: string;
    ccipObjectRef: string;
    tokenParams: TransactionArgument;
    tokenCoin: TransactionArgument;
    destChainSelector: bigint;
    tokenPoolState: string;
    tokenState: string;
    clockObjectId?: string;
    denyListObjectId?: string;
  }
): void {
  const { poolPkg, poolKind, coinType, ccipObjectRef, tokenParams, tokenCoin, destChainSelector, tokenPoolState, tokenState } = args;
  const clockObjectId = args.clockObjectId ?? networkConfig.sui.clockObjectId;
  const denyListObjectId = args.denyListObjectId ?? networkConfig.sui.denyListObjectId;

  const tokenCoinArg = typeof tokenCoin === 'string' ? tx.object(tokenCoin) : tokenCoin;

  switch (poolKind) {
    case 'burn_mint':
      console.log('🔥 Calling burn_mint_token_pool');
      tx.moveCall({
        package: poolPkg,
        module: 'burn_mint_token_pool',
        function: 'lock_or_burn',
        typeArguments: [coinType],
        arguments: [
          tx.object(ccipObjectRef),
          tokenParams,
          tokenCoinArg,
          tx.pure.u64(destChainSelector),
          tx.object(clockObjectId),
          tx.object(tokenPoolState)
        ]
      });
      break;
    case 'lock_release':
      console.log('🔒 Calling lock_release_token_pool');
      tx.moveCall({
        package: poolPkg,
        module: 'lock_release_token_pool',
        function: 'lock_or_burn',
        typeArguments: [coinType],
        arguments: [
          tx.object(ccipObjectRef),
          tokenParams,
          tokenCoinArg,
          tx.pure.u64(destChainSelector),
          tx.object(clockObjectId),
          tx.object(tokenPoolState)
        ]
      });
      break;
    case 'managed_pool':
      console.log('🛠️ Calling managed_token_pool');
      tx.moveCall({
        package: poolPkg,
        module: 'managed_token_pool',
        function: 'lock_or_burn',
        typeArguments: [coinType],
        arguments: [
          tx.object(ccipObjectRef),
          tokenParams,
          tokenCoinArg,
          tx.pure.u64(destChainSelector),
          tx.object(clockObjectId),
          tx.object(denyListObjectId),
          tx.object(tokenState),
          tx.object(tokenPoolState)
        ]
      });
      break;
  }
}

/**
 * Adds the CCIP send call to the transaction
 */
function addCcipSendCall(tx: Transaction, args: CcipSendCallArgs): void {
  const feeTokenArg = typeof args.feeToken === 'string' ? tx.object(args.feeToken) : args.feeToken;
  const clockObjectId = args.clockObjectId ?? networkConfig.sui.clockObjectId;

  tx.moveCall({
    package: args.onrampPkg,
    module: 'onramp',
    function: 'ccip_send',
    typeArguments: [args.feeTokenType],
    arguments: [
      tx.object(args.ccipObjectRef),
      tx.object(args.onrampState),
      tx.object(clockObjectId),
      tx.pure.u64(args.destChainSelector),
      tx.pure.vector('u8', args.receiver),
      tx.pure.vector('u8', args.data),
      args.tokenParams,
      tx.object(args.feeTokenMetadata.id),
      feeTokenArg,
      tx.pure.vector('u8', args.extraArgs)
    ]
  });
}

/**
 * Builds a PTB for token transfer (with pool interaction)
 * Used by ccipSendTokenRouter.ts
 */
export function buildTokenTransferPTB(tx: Transaction, args: TokenTransferArgs): Transaction {
  // `message.receiver` (ccip_send receiver arg). For EVM this equals the token
  // recipient; for SVM token-only it is the 32-byte zero address (no program CPI)
  // and for SVM message+token it is the receiver program. Defaults to `receiver`
  // for back-compat with EVM callers that don't set messageReceiver.
  const messageReceiver = args.messageReceiver ?? args.receiver;

  // Create token transfer params — `receiver` is the token recipient
  // (token_params.token_receiver), which the Sui OnRamp requires to equal
  // SVMExtraArgsV1.tokenReceiver and to be non-zero for SVM token sends.
  const tokenParams = tx.moveCall({
    package: args.ccipPkg,
    module: 'onramp_state_helper',
    function: 'create_token_transfer_params',
    arguments: [tx.pure.vector('u8', args.receiver)]
  });

  // Add token pool call (lock_or_burn)
  addTokenPoolCall(tx, {
    poolPkg: args.poolPkg,
    poolKind: args.poolKind,
    coinType: args.coinType,
    ccipObjectRef: args.ccipObjectRef,
    tokenParams,
    tokenCoin: args.tokenCoin,
    destChainSelector: args.destChainSelector,
    tokenPoolState: args.tokenPoolState,
    tokenState: args.tokenState,
    clockObjectId: args.clockObjectId,
    denyListObjectId: args.denyListObjectId
  });

  // Add CCIP send call
  addCcipSendCall(tx, {
    ccipPkg: args.ccipPkg,
    onrampPkg: args.onrampPkg,
    ccipObjectRef: args.ccipObjectRef,
    onrampState: args.onrampState,
    destChainSelector: args.destChainSelector,
    receiver: messageReceiver,
    data: args.data,
    tokenParams,
    feeToken: args.feeToken,
    feeTokenType: args.feeTokenType,
    feeTokenMetadata: args.feeTokenMetadata,
    extraArgs: args.extraArgs,
    clockObjectId: args.clockObjectId
  });

  return tx;
}

/**
 * Builds a PTB for message-only transfer (no tokens)
 * Used by ccipSendMsgRouter.ts
 */
export function buildMessageOnlyPTB(tx: Transaction, args: MessageArgs): Transaction {
  // Create empty token transfer params (no tokens)
  const tokenParams = tx.moveCall({
    package: args.ccipPkg,
    module: 'onramp_state_helper',
    function: 'create_token_transfer_params',
    arguments: [tx.pure.vector('u8', new Uint8Array())]
  });

  // Add CCIP send call (no pool interaction)
  addCcipSendCall(tx, {
    ccipPkg: args.ccipPkg,
    onrampPkg: args.onrampPkg,
    ccipObjectRef: args.ccipObjectRef,
    onrampState: args.onrampState,
    destChainSelector: args.destChainSelector,
    receiver: args.receiver,
    data: args.data,
    tokenParams,
    feeToken: args.feeToken,
    feeTokenType: args.feeTokenType,
    feeTokenMetadata: args.feeTokenMetadata,
    extraArgs: args.extraArgs,
    clockObjectId: args.clockObjectId,
    denyListObjectId: args.denyListObjectId
  });

  return tx;
}

/**
 * Builds a PTB for message + token transfer
 * Used by ccipSendMsgAndTokenRouter.ts
 */
export function buildMessageAndTokenPTB(tx: Transaction, args: TokenTransferArgs): Transaction {
  // Same as token transfer but with non-empty message data
  return buildTokenTransferPTB(tx, args);
}