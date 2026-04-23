import { spawn } from 'child_process';

/**
 * Compiles a Sui Move package using the `sui move build` command.
 * @param packageDir - The path to the package directory (e.g., "modules/ccip_message_receiver").
 */
export function compilePackage(packageDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['move', 'build', '--path', packageDir];

    console.log(`\nCompiling ${packageDir}...`);
    console.log(`Running: sui ${args.join(' ')}`);

    const child = spawn('sui', args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => (stdout += data.toString()));
    child.stderr.on('data', (data) => (stderr += data.toString()));

    child.on('close', (code) => {
      if (code === 0) {
        console.log(stdout);
        console.log(`✅ ${packageDir} compiled successfully.`);
        resolve();
      } else {
        console.error(`Compilation failed with exit code ${code}`);
        console.error(stderr);
        reject(new Error(stderr || 'Compilation failed'));
      }
    });

    child.on('error', (err) => {
      console.error(
        "Failed to start 'sui' subprocess. Is the Sui CLI installed and in your PATH?"
      );
      reject(err);
    });
  });
}
