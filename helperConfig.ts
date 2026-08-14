// ── Latest-package-id resolution data ──────────────────────────────────────
// Sui CCIP packages are upgradeable: the "original" package ID (registered in
// the Router, exposed as ccipPackageId / ccipOfframpPackageId / the
// Router-registered OnRamp below) stays live forever, but a newer version may
// supersede it. getLatestCcipPackageId() (scripts/sui-helper) resolves the
// latest version in four stages: (1) `router` → return original (Router is
// never upgraded); (2) fast-path via `knownLatestPackageIds[packageType]`
// below; (3) on-chain derivation via `PACKAGE_UPGRADE_CONFIGS` (walk owned
// objects for `{pkg}::{module}::{StatePointerType}`, read the parent object,
// BLAKE2b-derive the state object, read `package_ids[]` last element);
// (4) on exception, fall back to the original. getObjectFromPackage() mirrors
// this with a `knownStateObjects` fast-path (stage 0).
//
// `knownLatestPackageIds`, `knownStateObjects` (per sui/suiMainnet block below)
// and `PACKAGE_UPGRADE_CONFIGS` (here) together are the SINGLE source of truth
// for latest-package-id resolution — keep all three here.

export interface PackageUpgradeConfig {
    moduleName: string;
    statePointerType: string;
    parentObjectFieldName: string;
    stateObjectName: string;
    packageIdsFieldName?: string;
}

// On-chain derivation metadata for the upgradeable CCIP packages, used by
// getLatestCcipPackageId() stage 3 when the knownLatestPackageIds fast-path
// misses. Network-agnostic: module / pointer-type / field names are identical
// on testnet and mainnet, so one shared map covers both. The `router` package
// is never upgraded, so it is absent (the resolver returns the original for
// 'router' without consulting this map).
export const PACKAGE_UPGRADE_CONFIGS: Record<string, PackageUpgradeConfig> = {
    ccip_onramp: {
        moduleName: 'onramp',
        statePointerType: 'OnRampStatePointer',
        parentObjectFieldName: 'on_ramp_object_id',
        stateObjectName: 'OnRampState',
    },
    ccip_offramp: {
        moduleName: 'offramp',
        statePointerType: 'OffRampStatePointer',
        parentObjectFieldName: 'off_ramp_object_id',
        stateObjectName: 'OffRampState',
    },
    ccip: {
        moduleName: 'state_object',
        statePointerType: 'CCIPObjectRefPointer',
        parentObjectFieldName: 'ccip_object_id',
        stateObjectName: 'CCIPObjectRef',
    },
};

export const networkConfig = {
  sui: {
    networkName: 'suiTestnet',
    chainSelector: '9762610643973837292',
    clockObjectId: '0x6',
    denyListObjectId: '0x403',
    ccipPackageId: '0x5ef4b483da6644c84aa78eae4f51a9bfb1fb4554d5134ac98892e931fcbdd6bf',
    ccipRouterModuleName: 'router',
    ccipRouterPackageId: '0x267b460543ab96a2ee8573cc5e1e697629274f26f135c28baf891fad6f1d7aca',
    ccipOfframpModuleName: 'offramp',
    ccipOfframpPackageId: '0x01a0a22b2abacbd48e9a026c1661189a8ec5ce4942cba07017b63eaad0a205a4',
    ccipOnrampModuleName: 'onramp',
    ccipBnMCoinMetadataId: '0x331ce2ba0901fec09d863f0d4162ae29bae2898922e345f3e4cd356363ce3c1b',
    faucetPackageId: '0x68ba1d8f494d7f7cf06e666f3e9432653537803ebc39721de12c48726ca0fe34',
    faucetModuleName: 'faucet',
    managedTokenPackageId: '0x2498ef5418740a8c422b9581cd9b8b56cc372938a2111557c158c46307d916f0',
    managedTokenModuleName: 'managed_token',
    feeTokenNameLink: 'link',
    feeTokenNameNative: 'native',
    linkCoinMetadataId: '0x7b1f2eda61dbb204d5a54c8453d91425336a8873ceedc5a59c00e750bdefc8dc',
    suiCoinMetadataId: '0x587c29de216efd4219573e08a1f6964d4fa7cb714518c2c8a0f29abfa264327d',
    ccipReceiverPackageName: 'ccip_message_receiver',
    ccipReceiverModuleName: 'dummy_receiver',
    // Hardcoded shared-object IDs on Sui testnet. The CCIP singletons are
    // sourced from chainlink-deployments/domains/ccip/testnet/addresses.json;
    // FaucetState and TokenState were verified directly on-chain (shared
    // objects typed under the faucet and managed_token packages respectively).
    // getObjectFromPackage() short-circuits and returns these directly if the
    // requested target-object-name is in this map, avoiding the getOwnedObjects
    // + historical getTransactionBlock walk (which fails on pruning fullnodes
    // that no longer retain the original publish transactions).
    knownStateObjects: {
      CCIPObjectRef: '0xc38827d91c5bbe72e88b213a7ffc7b3460d2df4984b67605783446111ca06281',
      RouterState: '0x49e064420247e7c2e799f3da7308a5fcb56636ce187f57e9f48c71dbcb6ab23f',
      OnRampState: '0xe0f0bcc98ca35332fc4ddbf55c156c5705857c47dc3076b28884e4f3036581ba',
      OffRampState: '0x966c3391b10675b8791fefeb2a18345a7716b65b32abcd0dec560e937904a6bf',
      FaucetState: '0x78ef10c12728da8d6e8a88b708e63f417f615d5cbbcce1275000911117d2c568',
      TokenState: '0x91b9ca848f5c8bac560b5570265a8ad2f9f970a4efc73bb26465ee1f308ede84',
    } as { [targetObjectName: string]: string },
    // Hardcoded LATEST published-package IDs for the upgradeable CCIP packages
    // on Sui testnet. Sourced from chainlink-deployments/domains/ccip/testnet/
    // addresses.json (SuiLatestCCIPPackageID / SuiLatestOnRampPackageID /
    // SuiLatestOffRampPackageID). getLatestCcipPackageId() short-circuits and
    // returns these directly when present, avoiding the getOwnedObjects walk
    // that requires the RPC to index package-address-as-owner mappings (some
    // fullnodes don't).
    //
    // ⚠️ If Chainlink upgrades any of these packages, update the IDs here or
    // remove the entry so the derivation walk runs. The `router` package is
    // NEVER upgraded, so it's absent by design (getLatestCcipPackageId returns
    // the original for 'router' without consulting this map).
    knownLatestPackageIds: {
      ccip: '0x4356995ccf08c9e6310991285249c3e382d4228a7419559b6af4a34a3a43dfa1',
      ccip_onramp: '0xfa4dc9ef5e099b6dc61c90b00e2b28a90b788fda510790bae84c96d2f0b0303c',
      ccip_offramp: '0xf9494e5c9ae47c696ac45123d4b60cb6d57db611b524379d0cdf04a2ae9eabe6',
    } as { [packageType: string]: string },
    destChains: {
      sepolia: 'sepolia',
      arbitrumSepolia: 'arbitrumSepolia',
      baseSepolia: 'baseSepolia',
      bnbChainTestnet: 'bnbChainTestnet',
      opSepolia: 'opSepolia',
      polygonAmoy: 'polygonAmoy',
      jovaySepolia: 'jovaySepolia',
      // NOTE: verify the Sui-testnet -> Avalanche Fuji lane is enabled on the
      // Sui OnRamp before relying on this entry; addresses.json only proves the
      // Fuji side is deployed, not that the outbound lane from Sui is live.
      avalancheFuji: 'avalancheFuji',
      // NOTE: the Sui-testnet -> Solana-devnet lane is NOT visible in the
      // CCIP testnet address book (no Sui remote-source entry under Solana's
      // section and no Solana remote-dest under Sui's section). The Sui OnRamp
      // must have Solana Devnet added as a supported dest chain before the
      // sui2solana scripts under scripts/sui2solana/* will succeed on-chain.
      solanaDevnet: 'solanaDevnet',
    },
  },
  // Mainnet Sui only exposes the core CCIP package objects in the deployment data.
  // The testnet-only BnM, managed-token, and faucet artifacts do not appear in mainnet/addresses.json.
  suiMainnet: {
    networkName: 'suiMainnet',
    chainSelector: '17529533435026248318',
    clockObjectId: '0x6',
    denyListObjectId: '0x403',
    ccipPackageId: '0x0e70da5ac8e13225f8b4c12b6060dda15c2036612d476b0f76431fdc271d82ae',
    ccipRouterModuleName: 'router',
    ccipRouterPackageId: '0xf02f129d0279d434665df88359380d607098699a4c803e9a84eaa535be8553bf',
    ccipOfframpModuleName: 'offramp',
    ccipOfframpPackageId: '0xb9cb33ec10384413680e8327a1bd2c09704852b4132afa42075b90cdceac4b6c',
    ccipOnrampModuleName: 'onramp',
    // Best guess: the mainnet deployment does not expose a dedicated CCIP BnM metadata object.
    // Reusing the LINK metadata object so the token-send scripts can run with the mainnet flag.
    ccipBnMCoinMetadataId: '0x9afd521dafb76d7f8eaeab1e3bd741c094b8415303189c378f79a02968a5f4de',
    feeTokenNameLink: 'link',
    feeTokenNameNative: 'native',
    linkCoinMetadataId: '0x9afd521dafb76d7f8eaeab1e3bd741c094b8415303189c378f79a02968a5f4de',
    suiCoinMetadataId: '0x9258181f5ceac8dbffb7030890243caed69a9599d2886d957a9cb7656af3bdb3',
    ccipReceiverPackageName: 'ccip_message_receiver',
    ccipReceiverModuleName: 'dummy_receiver',
    // Same fast-path as sui-testnet — hardcoded shared-object IDs sourced from
    // chainlink-deployments/domains/ccip/mainnet/addresses.json.
    knownStateObjects: {
      CCIPObjectRef: '0x7ac08408df942c282d5adf3e4bfd971b756eb8b48a751e41629a130623c7a88f',
      RouterState: '0x965f982c956346413c2180edf5af63c2075a56c4e0127d00587571613e7b287b',
      OnRampState: '0x3d87e435c1ba13184ee452478cdcd62ea5ec88463ac6bfa48ec6a690a0611ca9',
      OffRampState: '0x71b43a51fd18d74e7cc79097830afc1aba531ec718939ee1af3f91b8a66fa693',
    } as { [targetObjectName: string]: string },
    // Hardcoded LATEST published-package IDs for the upgradeable CCIP packages
    // on Sui mainnet. Sourced directly on-chain from each state object's
    // `package_ids` vector (last element = latest version) against
    // rpcs.cldev.sh/sui/mainnet — this is the same data addresses.json exposes
    // as SuiLatestCCIPPackageID / SuiLatestOnRampPackageID /
    // SuiLatestOffRampPackageID. getLatestCcipPackageId() short-circuits and
    // returns these directly, avoiding the getOwnedObjects derivation walk
    // (which returns empty on RPCs that don't index package-address-as-owner
    // mappings, and would otherwise fall back to the ORIGINAL package below).
    //
    // ⚠️ Mainnet CCIP packages HAVE been upgraded (one version each as of
    // 2026-08): index 0 below is the original (matches ccipPackageId /
    // ccipOfframpPackageId / the Router-registered OnRamp), index 1 is the
    // latest these entries point to. If Chainlink upgrades again, update these
    // to the new last element of each state object's package_ids (or remove the
    // entry so the derivation walk runs). The `router` package is NEVER
    // upgraded, so it's absent by design.
    knownLatestPackageIds: {
      ccip: '0x3e66b2872e9de41d7ba8dea4129d90650d23280aff88841f0df19663023e2543',
      ccip_onramp: '0xe6f7c948a4bac5bb2ae8754db256ba9a0cb25a0204eade7bc9c083fb522bcd9a',
      ccip_offramp: '0xdddab840c8ac7d8d301c81c531e5faa3cb58464ecbaec9b6d67c3cf9a02b1020',
    } as { [packageType: string]: string },
    destChains: {
      ethereumMainnet: 'ethereumMainnet',
      arbitrumMainnet: 'arbitrumMainnet',
      avalancheMainnet: 'avalancheMainnet',
      optimismMainnet: 'optimismMainnet',
      bnbChainMainnet: 'bnbChainMainnet',
      polygonMainnet: 'polygonMainnet',
      baseMainnet: 'baseMainnet',
      inkMainnet: 'inkMainnet',
      berachainMainnet: 'berachainMainnet',
      plasmaMainnet: 'plasmaMainnet',
      tempoMainnet: 'tempoMainnet',
      // NOTE: actually delivering messages on any Sui-mainnet -> EVM-mainnet
      // lane still depends on the destination gas price being fresh in the Sui
      // FeeQuoter (updated by the OffRamp OCR feed). If a lane's gas price is
      // stale, get_fee/ccip_send abort with EStaleGasPrice regardless of these
      // entries being present.
    },
  },
  sepolia: {
    networkName: 'sepolia',
    chainSelector: '16015286601757825753',
    ccipRouterAddress: '0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59',
    ccipOfframpAddress: '0x0820f975ce90EE5c508657F0C58b71D1fcc85cE0',
    ccipOnrampAddress: '0x23a5084Fa78104F3DF11C63Ae59fcac4f6AD9DeE',
    ccipBnMTokenAddress: '0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05',
    linkTokenAddress: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcUrlEnv: 'ETHEREUM_SEPOLIA_RPC_URL',
  },
  arbitrumSepolia: {
    networkName: 'arbitrumSepolia',
    chainSelector: '3478487238524512106',
    ccipRouterAddress: '0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165',
    ccipOfframpAddress: '0xf4ebcc2c077d3939434c7ab0572660c5a45e4df5',
    ccipOnrampAddress: '0x28a025d34c830bf212f5d2357c8dcab32dd92a20',
    ccipBnMTokenAddress: '0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D',
    linkTokenAddress: '0xb1D4538B4571d411F07960EF2838Ce337FE1E80E',
    explorerUrl: 'https://sepolia.arbiscan.io',
    rpcUrlEnv: 'ARBITRUM_SEPOLIA_RPC_URL',
  },
  baseSepolia: {
    networkName: 'baseSepolia',
    chainSelector: '10344971235874465080',
    ccipRouterAddress: '0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93',
    ccipOfframpAddress: '0xf4ebcc2c077d3939434c7ab0572660c5a45e4df5',
    ccipOnrampAddress: '0x28a025d34c830bf212f5d2357c8dcab32dd92a20',
    ccipBnMTokenAddress: '0x88A2d74F47a237a62e7A51cdDa67270CE381555e',
    linkTokenAddress: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410',
    explorerUrl: 'https://sepolia.basescan.org/',
    rpcUrlEnv: 'BASE_SEPOLIA_RPC_URL',
  },
  bnbChainTestnet: {
    networkName: 'bnbChainTestnet',
    chainSelector: '13264668187771770619',
    ccipRouterAddress: '0xE1053aE1857476f36A3C62580FF9b016E8EE8F6f',
    ccipOfframpAddress: '0xf4ebcc2c077d3939434c7ab0572660c5a45e4df5',
    ccipOnrampAddress: '0x28a025d34c830bf212f5d2357c8dcab32dd92a20',
    ccipBnMTokenAddress: '0xbFA2ACd33ED6EEc0ed3Cc06bF1ac38d22b36B9e9',
    linkTokenAddress: '0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06',
    explorerUrl: 'https://testnet.bscscan.com',
    rpcUrlEnv: 'BNB_CHAIN_TESTNET_RPC_URL',
  },
  opSepolia: {
    networkName: 'opSepolia',
    chainSelector: '5224473277236331295',
    ccipRouterAddress: '0x114A20A10b43D4115e5aeef7345a1A71d2a60C57',
    ccipOfframpAddress: '0x30d197c6f5be050d5525dd94d01760facdb67e7c',
    ccipOnrampAddress: '0x8f5bed5f7601025b12a97b01584220c12e343986',
    ccipBnMTokenAddress: '0x8aF4204e30565DF93352fE8E1De78925F6664dA7',
    linkTokenAddress: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410',
    explorerUrl: 'https://sepolia-optimism.etherscan.io',
    rpcUrlEnv: 'OP_SEPOLIA_RPC_URL',
  },
  polygonAmoy: {
    networkName: 'polygonAmoy',
    chainSelector: '16281711391670634445',
    ccipRouterAddress: '0x9C32fCB86BF0f4a1A8921a9Fe46de3198bb884B2',
    ccipOfframpAddress: '0x056A1FAb28562750a54063E37DDc66d506e320d2',
    ccipOnrampAddress: '0xF4EbCC2c077d3939434C7Ab0572660c5A45e4df5',
    ccipBnMTokenAddress: '0xcab0EF91Bee323d1A617c0a027eE753aFd6997E4',
    linkTokenAddress: '0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904',
    explorerUrl: 'https://amoy.polygonscan.com',
    rpcUrlEnv: 'POLYGON_AMOY_RPC_URL',
  },
  avalancheFuji: {
    networkName: 'avalancheFuji',
    chainSelector: '14767482510784806043',
    // Router 1.2.0 — the only Router on Fuji in the CCIP testnet address book.
    ccipRouterAddress: '0xF694E193200268f9a4868e4Aa017A0118C9a8177',
    // OffRamp 1.6.0 (latest); older 1.5.0 OffRamps also exist for legacy lanes.
    ccipOfframpAddress: '0x3F1f176e347235858DD6Db905DDBA09Eaf25478a',
    // OnRamp 1.6.0 (latest); older 1.5.0 OnRamps also exist for legacy lanes.
    ccipOnrampAddress: '0xA5D5B0B844c8f11B61F28AC98BBA84dEA9b80953',
    // BurnMintToken (CCIP-BnM) — matches the Sepolia BnM convention in this file.
    ccipBnMTokenAddress: '0xD21341536c5cF5EB1bcb58f6723cE26e8D8E90e4',
    // StaticLinkToken — matches the Sepolia StaticLinkToken convention in this file.
    linkTokenAddress: '0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846',
    explorerUrl: 'https://testnet.snowtrace.io',
    rpcUrlEnv: 'AVALANCHE_FUJI_RPC_URL',
  },
  // Ink Sepolia testnet (Optimism-stack L2). Addresses sourced from
  // chainlink-deployments/domains/ccip/testnet/addresses.json under selector
  // 9763904284804119144. OnRamp/OffRamp are the latest 1.6.0 variants; older
  // 1.5.0 lanes exist for legacy routes but aren't used here.
  inkSepolia: {
    networkName: 'inkSepolia',
    chainSelector: '9763904284804119144',
    ccipRouterAddress: '0x17fCda531D8E43B4e2a2A2492FBcd4507a1685A1',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0x28A025d34c830BF212f5D2357C8DcAB32dD92A20',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0x289639CB51704043213d2E8806d19979eD8533e4',
    // BurnMintToken (CCIP-BnM) — matches the Fuji BnM convention in this file.
    ccipBnMTokenAddress: '0x414dbe1d58dd9BA7C84f7Fc0e4f82bc858675d37',
    // StaticLinkToken on Ink Sepolia.
    linkTokenAddress: '0x3423C922911956b1Ccbc2b5d4f38216a6f4299b4',
    // Best guess: verify the Ink Sepolia block explorer base URL.
    explorerUrl: 'https://explorer-sepolia.inkonchain.com',
    rpcUrlEnv: 'INK_SEPOLIA_RPC_URL',
  },
  // Plasma testnet. Addresses sourced from
  // chainlink-deployments/domains/ccip/testnet/addresses.json under selector
  // 3967220077692964309. OnRamp/OffRamp are the latest 1.6.0 variants.
  plasmaTestnet: {
    networkName: 'plasmaTestnet',
    chainSelector: '3967220077692964309',
    ccipRouterAddress: '0xEC7088f7952ba58f268E25AC3868DF92bF462AEf',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0xFA5F1e092dE0907EE761fad89184B8E8AcC9089D',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0x1f5EF38782b6B7C6DE489406b8EE504e46F05a18',
    // BurnMintToken (CCIP-BnM) — matches the Fuji BnM convention in this file.
    ccipBnMTokenAddress: '0xfb1ff044F4E66Cee8718f7F64Bf45D6897b1220c',
    // StaticLinkToken on Plasma testnet.
    linkTokenAddress: '0xe5e3a4fF1773d043a387b16Ceb3c91cC49bAFD54',
    // Best guess: verify the Plasma testnet block explorer base URL.
    explorerUrl: 'https://plasma-testnet.explorer.plasma.network',
    rpcUrlEnv: 'PLASMA_TESTNET_RPC_URL',
  },
  // Berachain testnet (Bepolia, EVM chain id 80069). Addresses sourced from
  // chainlink-deployments/domains/ccip/testnet/addresses.json under selector
  // 7728255861635209484. OnRamp/OffRamp are the latest 1.6.0 variants. The canonical
  // Router (type "Router") is used; a TestRouter (1.2.0) also exists but is not used.
  berachainTestnet: {
    networkName: 'berachainTestnet',
    chainSelector: '7728255861635209484',
    ccipRouterAddress: '0x15BbDbCe486802e33D3cb03e4fFe7D998c0b1A07',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0x55406b18D82aA1BD0d02585b60CBEAB608d72d9B',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0x08b94D26AF201c673230550A7070946683847C7a',
    // No standalone BurnMintToken (CCIP-BnM) contract is listed for Berachain in the
    // address book — only token *pools* (BurnMintTokenPool/LockReleaseTokenPool/etc.),
    // which are not the token address this field requires. Left empty per instructions.
    ccipBnMTokenAddress: '',
    // LinkToken on Berachain testnet (type "LinkToken", 1.0.0).
    linkTokenAddress: '0x5aD0A67f4Da0E8665a3fbf15E4215A780407Cf33',
    // Best guess: Berachain Bepolia block explorer (Beratrail). Verify before relying on
    // explorer links. The etherscan-v2 API for chain 80069 is
    // https://api.etherscan.io/v2/api?chainid=80069.
    explorerUrl: 'https://beratrail.berachain.com',
    rpcUrlEnv: 'BERACHAIN_TESTNET_RPC_URL',
  },
  // Tempo testnet (Moderato, EVM chain id 42431). Addresses sourced from
  // chainlink-deployments/domains/ccip/testnet/addresses.json under selector
  // 8457817439310187923. OnRamp/OffRamp are the latest 1.6.0 variants. The canonical
  // Router (type "Router") is used; a TestRouter (1.2.0) also exists but is not used.
  tempoTestnet: {
    networkName: 'tempoTestnet',
    chainSelector: '8457817439310187923',
    ccipRouterAddress: '0xD3e53cCEE3688aAEE5C9118ef5Fe24EB423aa56F',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0x39e7898B92bdfAEF3d782907DeA385252f817587',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0xd503005a97771acC24833A868B2D37130B7873Ac',
    // No standalone BurnMintToken (CCIP-BnM) contract is listed for Tempo in the
    // address book — only token *pools* (BurnMintTokenPool/LockReleaseTokenPool/etc.),
    // which are not the token address this field requires. Left empty per instructions.
    ccipBnMTokenAddress: '',
    // LinkToken on Tempo testnet (type "LinkToken", 1.0.0).
    linkTokenAddress: '0xEAB080c724587fFC9F2EFF82e36EE4Fb27774959',
    // TODO: no block-explorer URL is published in the chainlink-deployments network
    // configs for Tempo Moderato (only an Alchemy RPC is listed). Left empty until a
    // canonical explorer base URL is confirmed; scripts that build explorer links will
    // produce malformed URLs for this chain until this is filled in.
    explorerUrl: '',
    rpcUrlEnv: 'TEMPO_TESTNET_RPC_URL',
  },
  ethereumMainnet: {
    networkName: 'ethereumMainnet',
    chainSelector: '5009297550715157269',
    ccipRouterAddress: '0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D',
    ccipOfframpAddress: '0x26d3681DfC9E4c8C79cfbf461adec8A21d5d73C5',
    ccipOnrampAddress: '0x913814782144864e523C3FdB78E3ca25D2c2aeCa',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    linkTokenAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    explorerUrl: 'https://etherscan.io',
    rpcUrlEnv: 'ETHEREUM_MAINNET_RPC_URL',
  },
  arbitrumMainnet: {
    networkName: 'arbitrumMainnet',
    chainSelector: '4949039107694359620',
    ccipRouterAddress: '0x141fa059441E0ca23ce184B6A78bafD2A517DdE8',
    ccipOfframpAddress: '0xee85aEfb15b9489563A6a29891ebe0750AA1A7Ae',
    ccipOnrampAddress: '0x76a443768A5e3B8d1AED0105FC250877841Deb40',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    linkTokenAddress: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
    explorerUrl: 'https://arbiscan.io',
    rpcUrlEnv: 'ARBITRUM_MAINNET_RPC_URL',
  },
  // Avalanche mainnet (C-Chain). Addresses sourced from
  // chainlink-deployments/domains/ccip/mainnet/addresses.json under selector
  // 6433500567565415381. OnRamp/OffRamp are the latest 1.6.0 variants; the
  // address book also lists a TestRouter (1.2.0) and many 1.5.0 legacy lanes,
  // neither of which is used here. The canonical Router (type "Router") is used.
  avalancheMainnet: {
    networkName: 'avalancheMainnet',
    chainSelector: '6433500567565415381',
    ccipRouterAddress: '0xF4c7E640EdA248ef95972845a62bdC74237805dB',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0xe72d25aDd538E8ef9CeF85622eA8912a6CB98Be6',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0x02A4D69cFfeC00Fbf7F3B60c93e3529Dfc58894d',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    // LinkToken on Avalanche mainnet (qualifier "LINK", canonical LINK on C-Chain).
    linkTokenAddress: '0x5947BB275c521040051D82396192181b413227A3',
    explorerUrl: 'https://snowtrace.io',
    rpcUrlEnv: 'AVALANCHE_MAINNET_RPC_URL',
  },
  // ---- Additional EVM mainnet chains ----
  // Addresses sourced from chainlink-deployments/domains/ccip/mainnet/addresses.json
  // (keyed by chain selector), cross-checked against the datastore
  // address_refs.json. Chain selectors come from
  // chain-selectors/all_selectors.yml. For each chain: Router is the unique
  // "Router" (1.2.0); OnRamp/OffRamp are the single latest 1.6.0 lane contracts
  // (each chain has exactly one 1.6.0 OnRamp and one 1.6.0 OffRamp, matching the
  // selection used by the existing ethereumMainnet/arbitrumMainnet/avalancheMainnet
  // entries — older 1.5.0 per-destination lanes are ignored). LINK is the
  // address-book "StaticLinkToken" if present, else "LinkToken" (each confirmed
  // via the address_refs `qualifier` field, which is "LINK" for LinkToken-typed
  // entries and "<addr>-StaticLinkToken" for StaticLinkToken ones). CCIP-BnM is a
  // testnet-only token, so every mainnet entry leaves ccipBnMTokenAddress empty.
  // Recommended RPCs follow the https://rpcs.cldev.sh/<chain>/mainnet pattern
  // (avalanche/optimism/bsc confirmed by the user); set the *_MAINNET_RPC_URL
  // env var to the URL noted inline.
  optimismMainnet: {
    networkName: 'optimismMainnet',
    chainSelector: '3734403246176062136',
    ccipRouterAddress: '0x3206695CaE29952f4b0c22a169725a865bc8Ce0f',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0xee85aEfb15b9489563A6a29891ebe0750AA1A7Ae',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0x76a443768A5e3B8d1AED0105FC250877841Deb40',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    // StaticLinkToken on Optimism mainnet.
    linkTokenAddress: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',
    explorerUrl: 'https://optimistic.etherscan.io',
    rpcUrlEnv: 'OPTIMISM_MAINNET_RPC_URL', // e.g. https://rpcs.cldev.sh/optimism/mainnet
  },
  bnbChainMainnet: {
    networkName: 'bnbChainMainnet',
    chainSelector: '11344663589394136015',
    ccipRouterAddress: '0x34B03Cb9086d7D758AC55af71584F81A598759FE',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0xA27056438FfA1f286AB197488808692F0db93F8B',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0xf09AFe78d3c7d359b334d7cB88995751F7eC5E13',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    // StaticLinkToken on BNB Smart Chain mainnet (canonical LINK on BSC).
    linkTokenAddress: '0x404460C6A5EdE2D891e8297795264fDe62ADBB75',
    explorerUrl: 'https://bscscan.com',
    rpcUrlEnv: 'BNB_CHAIN_MAINNET_RPC_URL', // e.g. https://rpcs.cldev.sh/bsc/mainnet
  },
  polygonMainnet: {
    networkName: 'polygonMainnet',
    chainSelector: '4051577828743386545',
    ccipRouterAddress: '0x849c5ED5a80F5B408Dd4969b78c2C8fdf0565Bfe',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0x77FDbd20ED582794b1d9F1a8a94e4a60494D677e',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0x530Ae314EC3fA038bd9A215095E37295ec76162a',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    // LinkToken on Polygon mainnet (CCIP-registered LINK).
    linkTokenAddress: '0xb0897686c545045aFc77CF20eC7A532E3120E0F1',
    explorerUrl: 'https://polygonscan.com',
    rpcUrlEnv: 'POLYGON_MAINNET_RPC_URL', // e.g. https://rpcs.cldev.sh/polygon/mainnet
  },
  baseMainnet: {
    networkName: 'baseMainnet',
    chainSelector: '15971525489660198786',
    ccipRouterAddress: '0x881e3A65B4d4a04dD529061dd0071cf975F58bCD',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0xf09AFe78d3c7d359b334d7cB88995751F7eC5E13',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0xee85aEfb15b9489563A6a29891ebe0750AA1A7Ae',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    // LinkToken on Base mainnet (qualifier "LINK", canonical LINK on Base).
    linkTokenAddress: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    explorerUrl: 'https://basescan.org',
    rpcUrlEnv: 'BASE_MAINNET_RPC_URL', // e.g. https://rpcs.cldev.sh/base/mainnet
  },
  inkMainnet: {
    networkName: 'inkMainnet',
    chainSelector: '3461204551265785888',
    ccipRouterAddress: '0xca7c90A52B44E301AC01Cb5EB99b2fD99339433A',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0x77FDbd20ED582794b1d9F1a8a94e4a60494D677e',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0x530Ae314EC3fA038bd9A215095E37295ec76162a',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    // LinkToken on Ink mainnet (CCIP-registered LINK).
    linkTokenAddress: '0x71052BAe71C25C78E37fD12E5ff1101A71d9018F',
    explorerUrl: 'https://explorer.inkonchain.com',
    rpcUrlEnv: 'INK_MAINNET_RPC_URL', // e.g. https://rpcs.cldev.sh/ink/mainnet
  },
  berachainMainnet: {
    networkName: 'berachainMainnet',
    chainSelector: '1294465214383781161',
    ccipRouterAddress: '0x71a275704c283486fBa26dad3dd0DB78804426eF',
    // OffRamp 1.6.0 (latest).
    ccipOfframpAddress: '0x02A4D69cFfeC00Fbf7F3B60c93e3529Dfc58894d',
    // OnRamp 1.6.0 (latest).
    ccipOnrampAddress: '0xc23071a8AE83671f37bdA1DaDBC745a9780f632A',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    // LinkToken on Berachain mainnet (CCIP-registered LINK).
    linkTokenAddress: '0x71052BAe71C25C78E37fD12E5ff1101A71d9018F',
    // Best guess: Berachain mainnet block explorer (Beratrail). Verify before
    // relying on explorer links.
    explorerUrl: 'https://beratrail.berachain.com',
    rpcUrlEnv: 'BERACHAIN_MAINNET_RPC_URL', // e.g. https://rpcs.cldev.sh/berachain/mainnet
  },
  plasmaMainnet: {
    networkName: 'plasmaMainnet',
    chainSelector: '9335212494177455608',
    ccipRouterAddress: '0xcDca5D374e46A6DDDab50bD2D9acB8c796eC35C3',
    // OffRamp 1.6.0 (latest) — only OffRamp on Plasma mainnet.
    ccipOfframpAddress: '0xc2BE2F77562A6676098e8D363B9d8A33Ea009D4e',
    // OnRamp 1.6.0 (latest) — only OnRamp on Plasma mainnet.
    ccipOnrampAddress: '0x8FE3B17E6B0863aeEA3D38DF063AEa39D4Ab1602',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    // LinkToken on Plasma mainnet (CCIP-registered LINK).
    linkTokenAddress: '0x76a443768A5e3B8d1AED0105FC250877841Deb40',
    // Best guess: Plasma mainnet block explorer. Verify before relying on
    // explorer links.
    explorerUrl: 'https://plasma.explorer.plasma.network',
    rpcUrlEnv: 'PLASMA_MAINNET_RPC_URL', // e.g. https://rpcs.cldev.sh/plasma/mainnet
  },
  tempoMainnet: {
    networkName: 'tempoMainnet',
    chainSelector: '7281642695469137430',
    ccipRouterAddress: '0xa132F089492CcE5f1D79483a9e4552f37266ed01',
    // OffRamp 1.6.0 (latest) — only OffRamp on Tempo mainnet.
    ccipOfframpAddress: '0x819d06D62D7Fc29cFdafEc61bE44a8DB575D6102',
    // OnRamp 1.6.0 (latest) — only OnRamp on Tempo mainnet.
    ccipOnrampAddress: '0x21d66D23FE27bB4175c866d4d3eE9bc12c4824e3',
    // CCIP-BnM is a testnet-only token; no BnM exists on any mainnet. Left empty.
    ccipBnMTokenAddress: '',
    // LinkToken on Tempo mainnet (CCIP-registered LINK).
    linkTokenAddress: '0x15C03488B29e27d62BAf10E30b0c474bf60E0264',
    // TODO: no block-explorer URL is published for Tempo mainnet in the
    // chainlink-deployments network configs. Left empty until a canonical
    // explorer base URL is confirmed; scripts that build explorer links will
    // produce malformed URLs for this chain until filled in.
    explorerUrl: '',
    rpcUrlEnv: 'TEMPO_MAINNET_RPC_URL', // e.g. https://rpcs.cldev.sh/tempo/mainnet
  },
  // Solana Devnet — CCIP is deployed on Solana with base58-encoded program /
  // account addresses (not EVM-style 0x hex). Addresses are pulled from
  // chainlink-deployments/domains/ccip/testnet/addresses.json under chain
  // selector "16423721717087811551".
  solanaDevnet: {
    networkName: 'solanaDevnet',
    chainFamily: 'svm',
    chainSelector: '16423721717087811551',
    // Chainlink CCIP Router program on Solana Devnet.
    ccipRouterProgramId: 'Ccip842gzYHhvdDkSyi2YVCoAWPbYJoApMFzSxQroE9C',
    // OffRamp program (executes inbound messages arriving at Solana).
    ccipOfframpProgramId: 'offqSMQWgQud6WJz694LRzkeN5kMYpCHTpXQr3Rkcjm',
    // FeeQuoter program used by the Router to price outbound messages.
    ccipFeeQuoterProgramId: 'FeeQPGkKDeRV1MgoYfMH6L8o3KeuYjwUZrgn4LRKfjHi',
    // RMN Remote used for cross-chain risk-management checks.
    rmnRemoteProgramId: 'RmnXLft1mSEwDgMKu2okYuHkiazxntFFcZFrrcXxYg7',
    // CCIP-BnM SPL2022 mint (labeled "CCIP-BnM" in the address book).
    ccipBnMTokenMint: '3PjyGzj1jGVgHSKS4VR1Hr1memm63PmN8L9rtPDKwzZ6',
    // LinkToken SPL mint on Solana Devnet.
    linkTokenMint: 'LinkhB3afbBKb2EQQu7s7umdZceV3wcvAUJhQAfQ23L',
    // Native SOL wrapped mint (used as native fee token equivalent).
    wsolTokenMint: 'So11111111111111111111111111111111111111112',
    // USDC SPL mint (for CCTP flows if you extend the scripts).
    usdcTokenMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    // Solana JSON-RPC cluster URL environment variable. Defaults to
    // https://api.devnet.solana.com if the env var is not set.
    rpcUrlEnv: 'SOLANA_DEVNET_RPC_URL',
    defaultRpcUrl: 'https://api.devnet.solana.com',
    explorerUrl: 'https://explorer.solana.com',
    explorerClusterQuery: '?cluster=devnet',
  },
};

// List of supported source chains for CLI validation
export const supportedEvmChains = [
  networkConfig.sepolia.networkName,
  networkConfig.arbitrumSepolia.networkName,
  networkConfig.baseSepolia.networkName,
  networkConfig.bnbChainTestnet.networkName,
  networkConfig.opSepolia.networkName,
  networkConfig.polygonAmoy.networkName,
  networkConfig.avalancheFuji.networkName,
  networkConfig.inkSepolia.networkName,
  networkConfig.plasmaTestnet.networkName,
  networkConfig.berachainTestnet.networkName,
  networkConfig.tempoTestnet.networkName,
  networkConfig.ethereumMainnet.networkName,
  networkConfig.arbitrumMainnet.networkName,
  networkConfig.avalancheMainnet.networkName,
  networkConfig.optimismMainnet.networkName,
  networkConfig.bnbChainMainnet.networkName,
  networkConfig.polygonMainnet.networkName,
  networkConfig.baseMainnet.networkName,
  networkConfig.inkMainnet.networkName,
  networkConfig.berachainMainnet.networkName,
  networkConfig.plasmaMainnet.networkName,
  networkConfig.tempoMainnet.networkName,
];

// List of supported Solana (SVM-family) chains. Kept separate from
// supportedEvmChains so EVM-only scripts stay validated against EVM chains only
// and the new sui2solana scripts validate against SVM chains only.
export const supportedSolanaChains = [
  networkConfig.solanaDevnet.networkName,
];