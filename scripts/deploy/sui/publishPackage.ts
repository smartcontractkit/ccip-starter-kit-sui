import { spawn } from 'child_process';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { compilePackage } from './compilePackage';
import { networkConfig } from '../../../helperConfig';

const argv = yargs(hideBin(process.argv))
  .option('network', {
    type: 'string',
    description: 'Specify the Sui network to use',
    choices: [networkConfig.sui.networkName, networkConfig.suiMainnet.networkName],
    default: networkConfig.sui.networkName,
  })
  .option('packageName', {
    type: 'string',
    description: 'Specify the package name to publish',
    demandOption: true,
    choices: [
      networkConfig.sui.ccipReceiverPackageName,
    ],
  })
  .parseSync();

const isMainnet = argv.network === networkConfig.suiMainnet.networkName;
const suiConfig = isMainnet ? networkConfig.suiMainnet : networkConfig.sui;
const PACKAGE_PATH = `modules/${argv.packageName}`;

/**
 * Publishes a Sui Move package using the `sui client publish` command.
 */
async function publishPackage() {
  console.log(`--- Starting Sui Package Publish Process ---`);
  console.log(`Network: ${suiConfig.networkName}`);
  console.log(`Package Path: ${PACKAGE_PATH}`);

  return new Promise<void>((resolve, reject) => {
    // Remove Published.toml if it exists
    const publishedTomlPath = join(PACKAGE_PATH, 'Published.toml');
    if (existsSync(publishedTomlPath)) {
      console.log(`Removing existing Published.toml at ${publishedTomlPath}`);
      unlinkSync(publishedTomlPath);
      console.log('✅ Published.toml removed successfully.');
    }

    // Construct the arguments for the CLI command
    const args = ['client', 'publish', PACKAGE_PATH];

    console.log(`\nRunning command: sui ${args.join(' ')}`);

    const child = spawn('sui', args);

    let stdout = '';
    let stderr = '';

    // Capture standard output
    child.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(output); // Stream the output live
      stdout += output;
    });

    // Capture standard error
    child.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      console.error(errorOutput);
      stderr += errorOutput;
    });

    // Handle process exit
    child.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ CLI command executed successfully.');
        
        // Try to find the package ID in the output
        const match = stdout.match(/Published Objects:[\s\S]*?PackageID:\s*(0x[a-fA-F0-9]+)/);
        if (match && match[1]) {
          console.log(`\n✅ Package successfully published!`);
          console.log(`Package ID: ${match[1]}`);
          
          // Provide instructions based on package type
          console.log('\n-------------------------------------------');
          console.log('📝 Next Steps:');
          console.log('-------------------------------------------');
          
          if (argv.packageName === suiConfig.ccipReceiverPackageName) {
              console.log(`\n1. Register the receiver by running:`);
              console.log(`   npx ts-node scripts/deploy/sui/registerReceiver.ts --network ${suiConfig.networkName} --suiReceiver <YOUR_PUBLISHED_PACKAGE_ID>`);

          }
          console.log('-------------------------------------------');
        } else {
          console.log(
            '\n✅ Package published successfully! Check the output above for the Package ID.'
          );
          
          // Provide generic instructions when package ID cannot be parsed
          console.log('\n-------------------------------------------');
          console.log('📝 Next Steps:');
          console.log('-------------------------------------------');
          
          if (argv.packageName === suiConfig.ccipReceiverPackageName) {
            console.log(`\n1. Register the receiver by running:`);
            console.log(`   npx ts-node scripts/deploy/sui/registerReceiver.ts --network ${suiConfig.networkName} --suiReceiver <YOUR_PUBLISHED_PACKAGE_ID>`);
          }
          console.log('-------------------------------------------');
        }
        resolve();
      } else {
        console.error(`\n❌ CLI command failed with exit code ${code}`);
        reject(new Error(stderr || 'The Sui CLI command failed.'));
      }
    });

    // Handle errors in spawning the process
    child.on('error', (err) => {
      console.error(
        "Failed to start the 'sui' subprocess. Is the Sui CLI installed and in your PATH?"
      );
      reject(err);
    });
  });
}

// Main function
async function main() {
  try {
    // Step 1: Compile the package
    await compilePackage(PACKAGE_PATH);
    
    // Step 2: Publish the package
    await publishPackage();
  } catch (error) {
    console.error('\n❌ Publish script failed:', error);
    process.exit(1);
  }
}

main();
