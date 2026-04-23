# Chainlink CCIP SUI Starter Kit

> **NOTE:** This starter kit represents an educational example to use a Chainlink system, product, or service and is provided to demonstrate how to interact with Chainlink’s systems, products, and services to integrate them into your own. This template is provided “AS IS” and “AS AVAILABLE” without warranties of any kind, it has not been audited, and it may be missing key checks or error handling to make the usage of the system, product or service more clear. Do not use the code in this example in a production environment without completing your own audits and application of best practices. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink node operators are responsible for unintended outputs that are generated due to errors in code.

## Prerequisite
1. Install Nodejs following [official doc](https://nodejs.org/en/download). 
2. Install git from [Git official doc](https://git-scm.com/install/)
3. Install the Sui CLI following [Sui official doc](https://docs.sui.io/guides/developer/getting-started/sui-install).
    
    <b> NOTE: If you have an existing installation of the Sui CLI, make sure to update it to the latest version to avoid compatibility issues. Follow [the doc](https://docs.sui.io/references/cli) to upgrade the Sui CLI.</b>
4. An EVM account. Follow [Metamask official guide](https://support.metamask.io/start/getting-started-with-metamask/) to create new accounts if you are new to the EVM. 

## Set up the starter kit
1. Create a Sui account and get Sui tokens on testnet
    
    1.1 Follow the [doc](https://docs.sui.io/guides/developer/getting-started/configure-sui-client) to create a Sui Client.
    
    1.2 Run the command below to display the address of the current acount to verify if the account is created successfully. 
    ```
    sui client active-address
    ```

    1.3 Swtich to the Sui testnet as environment
    ```
    sui client switch --env testnet
    ```

    1.4 Acquire Sui tokens on testnet from the [faucet](https://faucet.sui.io/?network=testnet). Please consider other faucets on this [page](https://docs.sui.io/guides/developer/getting-started/get-coins) if there is any issue.

    1.5 Check if the Sui token on testnet dripped to your account
    ```
    sui client balance
    ```

2. Get Sepolia ETH token for your EVM account. Please try [Chainlink faucet](https://faucets.chain.link/). 

    <b> NOTE: Ethereum Sepolia testnet is used as the example in the README, please fund the EVM account with other test ETH if you want to use other testnets. </b>

3. git clone the repo to your local machine.
    ```
    git clone https://github.com/smartcontractkit/ccip-starter-kit-sui.git
    cd ccip-starter-kit-sui
    ```

4. Set environment variables

    4.1 Rename the file `.env.example` to `.env`

    4.2 Add the Sui private key to `.env`. The Sui private should be in bech32 and starts with "suiprivkey". It can be exported with command 
    ```
    sui keytool export --key-identity <YOUR ACCOUNT ADDR>
    ```
    4.3 Add ethereum private key to `.env`. Please follow [the Metamask guide](https://support.metamask.io/configure/accounts/how-to-export-an-accounts-private-key/) to export ethereum private key if Metamask is used as your wallet. 
    
    4.4 Add RPC of Ethereum Sepolia RPC to to `.env`. Follow the [Alchemy guide](https://www.alchemy.com/overviews/private-rpc-endpoint) to create a free EPC endpoint. 
    
    The `.env` is expected as below. Please add RPC URLs for other networks in `.env` if you want to use other EVM testnet than ethereum sepolia. 
    ```
    SUI_PRIVATE_KEY=suiprivkeyxxxxxxxxxxxxxxx
    EVM_PRIVATE_KEY=2d68xxxxxxxxxxxxxx
    ETHEREUM_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<Api_key>
    ...
    ...
    ```

5. Install the dependencies by running:
    ```
    npm install
    ```

## Message from Ethereum Sepolia to Sui Testnet
1. Send BnM token
    
    1.1 Drip BnM token to your EVM account

    ```
    npx ts-node scripts/faucets/evm/dripCCIPBnMToken.ts --network sepolia
    ```
    
    1.2 Send 0.001 BnM token to your Sui account 
    
    Use native token (test ETH on Ethereum Sepolia) as fee
    ```shell
    npx ts-node scripts/evm2sui/ccipSendTokenRouter.ts --feeToken native --sourceChain sepolia --amount 0.001 --suiReceiver <YOUR_SUI_ACCOUNT_ADDRESS> --toEOA true
    ```
    With the command, Link token can also be used as fee. (Get test link tokens in [Chainlink faucets](https://faucets.chain.link/)).
    ```shell
    npx ts-node scripts/evm2sui/ccipSendTokenRouter.ts --feeToken link --sourceChain sepolia --amount 0.001 --suiReceiver <YOUR_SUI_ACCOUNT_ADDRESS> --toEOA true
    ```

    The expected result is as below:
    ```
    ...
    ✅ Transaction successful: https://sepolia.etherscan.io/tx/0x3cddc822fbb8fe0e4afaaf3bf61733f353238ee90448c055636cb8a68a0ce909
    🆔 CCIP Message ID: 0x1b1b879f8a04c1e82e9a12aa2fb454aace1234a7ed90679e7cb66f28297de616
    🔗 CCIP Explorer URL: https://ccip.chain.link/#/side-drawer/msg/0x1b1b879f8a04c1e82e9a12aa2fb454aace1234a7ed90679e7cb66f28297de616
    ```
    Visit the CCIP explorer URL in the result to check the state of the CCIP message. All CCIP messages can be searched with message Id on Chainlink [CCIP explorer](https://ccip.chain.link/).

    1.3 Check the message state on Sui
    
    The CCIP message status can also be found on Sui testnet once the message arrives destination chain by the command below:
    ```
    npx ts-node scripts/evm2sui/checkMsgExecutionStateOnSui.ts --msgId <YOUR_CCIP_MESSAGE_ID>
    ```

    <b> NOTE: CCIP waits for finality of transaction on source chain before commit the message on destination chain, so nothing returns if the transaction on source chain has not been finalized. 
    
    It usually takes around 20 minutes for a transaction to reach finality on EVM chain, so you cannot see the result within this time period. See more details about the latency [here](https://docs.chain.link/ccip/ccip-execution-latency).</b>

2. Send arbitrary message
    
    2.1 Deploy receiver on Sui testnet
    ```
    npx ts-node scripts/deploy/sui/publishPackage.ts --packageName ccip_message_receiver
    ```
    The expected result is:
    ```
    ✅ CLI command executed successfully.

    ✅ Package successfully published!
    Package ID: <ID for your published package>

    -------------------------------------------
    📝 Next Steps:
    -------------------------------------------

    1. Register the receiver by running:
    npx ts-node scripts/deploy/sui/registerReceiver.ts --suiReceiver <YOUR_PUBLISHED_PACKAGE_ID>
    -------------------------------------------
    ```
    If failed to compile the file, one possible solution is to clear the folder `~/.move` and recompile. 

    2.2 Register the receiver on CCIP

    Use the package ID returned in last step
    ```
    npx ts-node scripts/deploy/sui/registerReceiver.ts --suiReceiver <YOUR_PUBLISHED_PACKAGE_ID>
    ```
    The expected result is:
    ```
    📝 Building transaction...
    📡 Submitting transaction to the network...

    ✅ Receiver registered successfully!
    Transaction Digest: <your transaction digest>

    View transaction at: https://suiscan.xyz/testnet/tx/<your transaction digest>
    ```
    2.3 Send message to receiver
    
    Native token as fee
    ```
    npx ts-node scripts/evm2sui/ccipSendMsgRouter.ts --sourceChain sepolia --msgString "Hi from evm" --suiReceiver <YOUR_SUI_RECEIVER> --feeToken native
    ```
    Link token as fee
    ```
    npx ts-node scripts/evm2sui/ccipSendMsgRouter.ts --sourceChain sepolia --msgString "Hi from evm" --suiReceiver <YOUR_SUI_RECEIVER> --feeToken link
    ```
    
    The expected result is as below:
    ```
    ...
    ✅ Transaction successful: https://sepolia.etherscan.io/tx/0x7897f7aae3ef9d0b73214ad47823260a49308b5041313dc6a90934586632d24e
    🆔 CCIP Message ID: 0xefebc61522d65f5b3748fe6a8d01b20c6f9e4ae3ced86a3560081d371dce677e
    🔗 CCIP Explorer URL: https://ccip.chain.link/#/side-drawer/msg/0xefebc61522d65f5b3748fe6a8d01b20c6f9e4ae3ced86a3560081d371dce677e
    ```
    Visit the CCIP explorer URL in the result to check the state of the CCIP message.

    2.4 Check state of CCIP message on Sui testnet
    ```
    npx ts-node scripts/evm2sui/checkMsgExecutionStateOnSui.ts --msgId <YOUR_CCIP_MESSAGE_ID>
    ```
    <b> NOTE: The command is to search the event on Sui testnet, Make sure to run the command when the state of CCIP message on explorer is "Success" which means the message has been transferred to destination chain.</b>

    2.5 Get the latest message on Sui
    
    Please make sure to read the message when the message execution state is "SUCCESS". 
    ```
    npx ts-node scripts/evm2sui/getLatestMessageOnSui.ts --suiReceiver <YOUR_SUI_RECEIVER>
    ```

3. Send token and arbitrary message
    
    3.1 Send 0.001 BnM token and a message to receiver
    
    Native token as fee
    ```
    npx ts-node scripts/evm2sui/ccipSendMsgAndTokenRouter.ts --sourceChain sepolia --msgString "ptt from evm" --suiReceiver <YOUR_SUI_RECEIVER> --feeToken native --amount 0.001
    ```
    Link token as fee
    ```
    npx ts-node scripts/evm2sui/ccipSendMsgAndTokenRouter.ts --sourceChain sepolia --msgString "ptt from evm" --suiReceiver <YOUR_SUI_RECEIVER> --feeToken link --amount 0.001
    ```
    3.2 Check state of CCIP message on Sui
    ```
    npx ts-node scripts/evm2sui/checkMsgExecutionStateOnSui.ts --msgId <YOUR_CCIP_MESSAGE_ID>
    ```
    <b> NOTE: The command is to search the event on Sui testnet, Make sure to run the command when the state of CCIP message on explorer is "Success" which means the message has been transferred to destination chain.</b>
    
    3.3 Get the latest message on Sui
    ```
    npx ts-node scripts/evm2sui/getLatestMessageOnSui.ts --suiReceiver <YOUR_SUI_RECEIVER>
    ```
    Nothing returns if the CCIP message state is not "Success".

    3.4 Withdraw BnM token from receiver
    ```
    npx ts-node scripts/withdrawTokensFromReceiver.ts --network suiTestnet --to <YOUR_SUI_ACCOUNT_ADDRESS> --receiver <YOUR_SUI_RECEIVER>
    ```
    Transaction fails if the CCIP message state is not "Success".

## Message from Sui Testnet to Ethereum sepolia
1. Send BnM token

    1.1 Drip BnM tokens to your Sui account
    ```
    npx ts-node scripts/faucets/sui/dripCCIPBnMToken.ts
    ```
    1.2 Send 0.001 BnM token to your EVM account 
    
    Native token as fee
    ```
    npx ts-node scripts/sui2evm/ccipSendTokenRouter.ts --feeToken native --destChain sepolia --amount 0.001 --evmReceiver <YOUR_EVM_ADDRESS>
    ```
    Link token as fee
    ```
    npx ts-node scripts/sui2evm/ccipSendTokenRouter.ts --feeToken link --destChain sepolia --amount 0.001 --evmReceiver <YOUR_EVM_ADDRESS>
    ```

    The expected result is:
    ```
    ...
    ✅ Transaction successful: https://suiscan.xyz/testnet/tx/4XMpmCMBGrFvf28ZVU8G4aZuLeX4CqyBcUfwqbwfKbSM
    🆔 CCIP Message ID: 0xb12a187758058db1fff9a1d8056d8d6e69c5fcaae76461d7e278abfeead2a593
    🔗 CCIP Explorer URL: https://ccip.chain.link/#/side-drawer/msg/0xb12a187758058db1fff9a1d8056d8d6e69c5fcaae76461d7e278abfeead2a593
    ```
    Visit the CCIP explorer URL in the result to check the state of the CCIP message.

    1.3 Check state of CCIP message on EVM
    ```
    npx ts-node scripts/sui2evm/checkMsgExecutionStateOnEvm.ts --msgId <CCIP_Message_ID> --destChain sepolia
    ```    
    <b> NOTE: the script checks events in the latest 500 blocks on EVM, so no result will be returned if: 1. the state of CCIP message is not "Success" which means the message has not been transferred to destination chain yet, 2. the block that contains the message has more than 500 confirmations. </b>

2. Send arbitrary message
    
    2.1 Deploy the receiver on EVM
    ```shell
    npx ts-node scripts/deploy/evm/deployReceiver.ts --evmChain sepolia
    ```
    The expected result from the command
    ```shell
    Receiver contract is deployed to: 0x91E618E7472Db06aB3B1bf4C107Dc123e8ECA8c5
    ```
    2.2 Send message "Hello from Sui" to evm
    
    Native token as fee
    ```shell
    npx ts-node scripts/sui2evm/ccipSendMsgRouter.ts --feeToken native --destChain sepolia --msgString "hello from sui" --evmReceiver <YOUR_EVM_RECEIVER>
    ```
    Link token as fee
    ```shell
    npx ts-node scripts/sui2evm/ccipSendMsgRouter.ts --feeToken link --destChain sepolia --msgString "hello from sui" --evmReceiver <YOUR_EVM_RECEIVER>
    ```
    expected result is:
    ```
    ...
    📧 Sending message: "hello from sui"
    ✅ Transaction successful: https://suiscan.xyz/testnet/tx/F8Jrhxkjhcw8iV8qX3oxka6oYC5RyKCH3kvXpsYvNZUP
    🆔 CCIP Message ID: 0x57ee89a0ad9adad309880c306e9ab2dcbcd15bec63cdf852fc8dce244fe3d6e9
    🔗 CCIP Explorer URL: https://ccip.chain.link/#/side-drawer/msg/0x57ee89a0ad9adad309880c306e9ab2dcbcd15bec63cdf852fc8dce244fe3d6e9
    ```
    Visit the CCIP explorer URL in the result to check the state of the CCIP message.

    2.3 Check the CCIP message state on EVM
    ```shell
    npx ts-node scripts/sui2evm/checkMsgExecutionStateOnEvm.ts --msgId <CCIP_MESSAGE_ID> --destChain sepolia
    ```
    <b> NOTE: the script checks events in the latest 500 blocks on EVM, so no result will be returned if: 1. the state of CCIP message is not "Success" which means the message has not been transferred to destination chain yet, 2. the block that contains the message has more than 500 confirmations. </b>

    2.4 Get latest received message on EVM reciever
    ```shell
    npx ts-node scripts/sui2evm/getLatestMessageOnEvm.ts --evmChain sepolia --evmReceiver <EVM_RECEIVER>
    ```
    Nothing returns if the CCIP message state is not "Success".

3. Send token and arbitrary message
    
    3.1 Send 0.001 BnM token and a message to receiver
    Native token as fee
    ```shell
    npx ts-node scripts/sui2evm/ccipSendMsgAndTokenRouter.ts --feeToken native --destChain sepolia --amount 0.001 --msgString "ptt from sui" --evmReceiver <EVM_RECEIVER>
    ```
    Link token as fee
    ```shell
    npx ts-node scripts/sui2evm/ccipSendMsgAndTokenRouter.ts --feeToken link --destChain sepolia --amount 0.001 --msgString "ptt from sui" --evmReceiver <EVM_RECEIVER>
    ```
    The expected result is:
    ```
    ...
    ✅ Transaction successful: https://suiscan.xyz/testnet/tx/BzwmzbJgtDswi7dGG5nRM4BE7mLbn79du1i7pHKMSLs
    🆔 CCIP Message ID: 0xc608ecf636e8e7deaf452619cdf58b07a1d0a8acf6baa05d19f461ffbe636f4c
    🔗 CCIP Explorer URL: https://ccip.chain.link/#/side-drawer/msg/0xc608ecf636e8e7deaf452619cdf58b07a1d0a8acf6baa05d19f461ffbe636f4c
    ```

    3.2 Check the CCIP message state on EVM
    ```shell
    npx ts-node scripts/sui2evm/checkMsgExecutionStateOnEvm.ts --msgId <CCIP_MESSAEG_ID> --destChain sepolia
    ```
    <b> NOTE: the script checks events in the latest 500 blocks on EVM, so no result will be returned if: 1. the state of CCIP message is not "Success" which means the message has not been transferred to destination chain yet, 2. the block that contains the message has more than 500 confirmations. </b>

    3.3 Get latest message from receiver
    ```shell
    npx ts-node scripts/sui2evm/getLatestMessageOnEvm.ts --evmChain sepolia --evmReceiver <EVM_RECEIVER>
    ```
    Nothing returns if the CCIP message state is not "Success".

    3.4 Withdraw token from evm receiver
    ```
    npx ts-node scripts/withdrawTokensFromReceiver.ts --network sepolia --to <YOUR_EVM_ACCT_ADDR> --receiver <YOUR_EVM_RECEIVER>
    ```
    Transaction fails if the CCIP message state is not "Success".