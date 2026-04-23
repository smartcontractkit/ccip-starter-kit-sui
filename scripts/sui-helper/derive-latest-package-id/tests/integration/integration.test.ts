import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getLatestCcipPackageId } from '../../../getLatestCcipPackageId';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';

// These tests require network access and use the actual Sui testnet
// Timeout is set higher to account for network latency
describe('CCIP Package ID Integration', () => {
  describe('getLatestCcipPackageId', () => {
    it('should fetch latest ccip package ID', { timeout: 60000 }, async () => {
      // Original CCIP package ID from testnet deployment
      const originalPackageId = '0x6471a7bf4fd4873eac1dd4f2e10898ec0354028331e1c4a9d79cd43161377785';
      
      const latestPackageId = await getLatestCcipPackageId(originalPackageId, 'ccip');

      assert.ok(latestPackageId);
      assert.match(latestPackageId, /^0x[a-f0-9]+$/);
    });

    it('should fetch latest ccip_onramp package ID', { timeout: 60000 }, async () => {
      // Original CCIP OnRamp package ID from testnet deployment
      const originalPackageId = '0x6471a7bf4fd4873eac1dd4f2e10898ec0354028331e1c4a9d79cd43161377785';
      
      const latestPackageId = await getLatestCcipPackageId(originalPackageId, 'ccip_onramp');

      assert.ok(latestPackageId);
      assert.match(latestPackageId, /^0x[a-f0-9]+$/);
    });

    it('should fetch latest ccip_offramp package ID', { timeout: 60000 }, async () => {
      // Original CCIP OffRamp package ID from testnet deployment
      const originalPackageId = '0x6471a7bf4fd4873eac1dd4f2e10898ec0354028331e1c4a9d79cd43161377785';
      
      const latestPackageId = await getLatestCcipPackageId(originalPackageId, 'ccip_offramp');

      assert.ok(latestPackageId);
      assert.match(latestPackageId, /^0x[a-f0-9]+$/);
    });

    it('should gracefully fallback to original ID when upgrade tracking unavailable', { timeout: 60000 }, async () => {
      // Using a package ID that doesn't have upgrade tracking
      const packageWithoutUpgradeTracking = '0x0000000000000000000000000000000000000000000000000000000000000001';
      
      const result = await getLatestCcipPackageId(packageWithoutUpgradeTracking, 'ccip');

      // Should return the original ID as fallback
      assert.strictEqual(result, packageWithoutUpgradeTracking);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent package gracefully', { timeout: 60000 }, async () => {
      const nonExistentPackageId = '0x0000000000000000000000000000000000000000000000000000000000000999';
      
      const result = await getLatestCcipPackageId(nonExistentPackageId, 'ccip');
      
      // Should fallback to original ID when package doesn't exist
      assert.strictEqual(result, nonExistentPackageId);
    });
  });

  describe('Consistency Tests', () => {
    it('should return same result when called multiple times', { timeout: 90000 }, async () => {
      const originalPackageId = '0x6471a7bf4fd4873eac1dd4f2e10898ec0354028331e1c4a9d79cd43161377785';
      
      const result1 = await getLatestCcipPackageId(originalPackageId, 'ccip_onramp');
      const result2 = await getLatestCcipPackageId(originalPackageId, 'ccip_onramp');
      
      assert.strictEqual(result1, result2);
    });
  });

  describe('Network connectivity', () => {
    it('should connect to Sui testnet', { timeout: 60000 }, async () => {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const chainId = await suiClient.getChainIdentifier();
      
      assert.ok(chainId);
    });
  });
});