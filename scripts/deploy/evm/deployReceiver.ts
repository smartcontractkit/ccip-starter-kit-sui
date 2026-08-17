import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { supportedEvmChains } from "../../../helperConfig";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getEvmChainConfig } from "../../utils/utils";

import dotenv from "dotenv";
dotenv.config();

const argv = yargs(hideBin(process.argv))
  .option('evmChain', {
    type: 'string',
    description: 'Specify the EVM chain to deploy the receiver contract to',
    demandOption: true,
    choices: supportedEvmChains
  })
  .option('gasLimit', {
    type: 'number',
    description: 'Gas limit for the deploy transaction (default: 3000000). Bump this if the deploy runs out of gas.',
    default: 3000000,
  })
  .option('priorityFeeGwei', {
    type: 'number',
    description: 'Max priority fee (tip) in gwei for EIP-1559 chains. Floored against the RPC-reported value so the tx is competitive without overpaying (default: 1).',
    default: 1,
  })
  .option('gasPriceBumpPct', {
    type: 'number',
    description: 'Percentage to bump the RPC-reported gas price for legacy (non-1559) chains, so the tx is competitive (default: 10).',
    default: 10,
  })
  .option('wait', {
    type: 'boolean',
    description: 'Wait for the deploy transaction to be mined before exiting (default: true). Pass --wait false to broadcast the tx, print the predicted contract address, and exit immediately without waiting for it to mine.',
    default: true,
  })
  .parseSync();

const chainConfig = getEvmChainConfig(argv.evmChain);
const { ccipRouterAddress, linkTokenAddress, rpcUrlEnv } = chainConfig;
const rpcUrl = process.env[rpcUrlEnv];
if (!rpcUrl) {
    throw new Error(`Please set the environment variable ${rpcUrlEnv}.`);
}

const privateKey = process.env.EVM_PRIVATE_KEY

if (!privateKey) {
  throw new Error("Please set the environment variable EVM_PRIVATE_KEY.");
}

__dirname = path.resolve(__dirname, '../../sui2evm'); // Adjust the path 
// load the contract ABI and bytecode
const contractData = JSON.parse(fs.readFileSync(path.join(__dirname, "receiver", "receiver.json"), "utf8"));
const ABI = contractData.abi;
const BYTECODE = contractData.bytecode;

async function deployReceiverOnEvm() {
  try {

    // set up provider and wallet
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey as string, provider);

    // create a contract factory
    const factory = new ethers.ContractFactory(ABI, BYTECODE, wallet);

    // Build a reasonable fee strategy for the deploy:
    //  - Prefer EIP-1559 (maxFeePerGas + maxPriorityFeePerGas) when the chain
    //    supports it (Ethereum mainnet, Base, Arbitrum, OP, ...). Floor the
    //    priority fee at --priorityFeeGwei so the tx isn't starved by the
    //    RPC-reported default, without blindly overpaying.
    //  - Fall back to a bumped legacy gasPrice on non-1559 chains. Bumping the
    //    reported price by --gasPriceBumpPct avoids the old flat 25-gwei
    //    fallback, which on mainnet could land below the base fee and sit
    //    pending forever (the silent hang you hit).
    const feeData = await provider.getFeeData();
    const overrides: ethers.Overrides = { gasLimit: argv.gasLimit };

    const minPriorityFee = ethers.parseUnits(String(argv.priorityFeeGwei), "gwei");
    if (feeData.maxFeePerGas != null && feeData.maxPriorityFeePerGas != null) {
      // EIP-1559. Anchor the fee cap on the network gasPrice (reliable and
      // universally supported via eth_gasPrice) rather than trusting the RPC's
      // maxFeePerGas: some endpoints misreport it low, which let the floored
      // priority tip exceed the cap and abort with "priorityFee cannot be more
      // than maxFee". The cap only bounds what we *could* pay — the effective
      // fee is baseFee + priorityFee, so a generous cap costs nothing extra.
      let maxFee: bigint;
      let priorityFee: bigint;
      if (feeData.gasPrice != null) {
        maxFee = feeData.gasPrice * 2n; // headroom over current conditions
        priorityFee =
          feeData.maxPriorityFeePerGas > minPriorityFee
            ? feeData.maxPriorityFeePerGas
            : minPriorityFee;
        // Never let the tip reach (or exceed) the cap — clamp to half the cap.
        if (priorityFee >= maxFee) priorityFee = maxFee / 2n;
      } else {
        maxFee = feeData.maxFeePerGas;
        priorityFee =
          feeData.maxPriorityFeePerGas > minPriorityFee
            ? feeData.maxPriorityFeePerGas
            : minPriorityFee;
        // Cap reported too low for the tip — give the cap headroom over it.
        if (priorityFee >= maxFee) maxFee = priorityFee * 2n;
      }
      overrides.maxFeePerGas = maxFee;
      overrides.maxPriorityFeePerGas = priorityFee;
      console.log(
        `EIP-1559 fees: maxFeePerGas=${ethers.formatUnits(maxFee, "gwei")} gwei, ` +
        `maxPriorityFeePerGas=${ethers.formatUnits(priorityFee, "gwei")} gwei`
      );
    } else {
      const base = feeData.gasPrice ?? ethers.parseUnits("25", "gwei");
      const bumped = (base * (100n + BigInt(argv.gasPriceBumpPct))) / 100n;
      overrides.gasPrice = bumped;
      console.log(
        `Legacy gasPrice=${ethers.formatUnits(bumped, "gwei")} gwei ` +
        `(network ${ethers.formatUnits(base, "gwei")} gwei +${argv.gasPriceBumpPct}%)`
      );
    }

    // deploy the contract
    console.log(`Deploying Receiver Contract to ${argv.evmChain}...`);
    const contract = await factory.deploy(
      ccipRouterAddress,
      linkTokenAddress,
      overrides
    );

    const deployTx = contract.deploymentTransaction();
    const txHash = deployTx?.hash ?? "(no tx hash)";
    const explorer = chainConfig.explorerUrl?.replace(/\/$/, "");
    const txExplorerUrl = explorer ? `${explorer}/tx/${txHash}` : "";
    console.log(`Deploy tx broadcast. hash=${txHash}` + (txExplorerUrl ? `  ${txExplorerUrl}` : ""));

    // The contract address is deterministic (CREATE = keccak(sender, nonce)) and
    // known the moment the tx is broadcast — ethers' ContractFactory computes it
    // from the sent tx (factory.js: getCreateAddress(sentTx)), with no receipt
    // needed — so we can print it up front in every mode, before deciding whether
    // to block on mining.
    const contractAddress = await contract.getAddress();
    const addrExplorerUrl = explorer ? `${explorer}/address/${contractAddress}` : "";
    console.log(
      `Receiver contract: ${contractAddress}` +
      (addrExplorerUrl ? `  ${addrExplorerUrl}` : "")
    );

    if (argv.wait) {
      // Default: block until the deploy tx is mined. On mainnet a deploy can
      // take minutes to confirm; this guarantees the address above is usable
      // by the time the script returns.
      console.log("Waiting for the deploy transaction to be mined...");
      await contract.waitForDeployment();
      console.log(`✅ Receiver contract mined and confirmed at ${contractAddress}` + (addrExplorerUrl ? `  ${addrExplorerUrl}` : ""));
    } else {
      // Fire-and-forget: the address above is deterministic and will hold once
      // the tx mines. Track it with the tx hash and verify on-chain before use.
      console.log("Deploy tx broadcast complete; not waiting for mining. Track it with the tx hash above and verify it mined before using the receiver.");
    }
  } catch (error) {
    console.error("Deployment failed:", error);
    throw error;
  }
}

deployReceiverOnEvm();