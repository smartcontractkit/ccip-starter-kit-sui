import { describe, it } from 'node:test';
import assert from 'node:assert';
import { deriveObjectIdWithVectorU8Key } from '../../../deriveObjectId';

describe('Cryptographic Derivation', () => {
  describe('deriveObjectIdWithVectorU8Key', () => {
    it('should derive state object ID from parent and key', () => {
      // Known test case from CCIP OnRamp
      const parentAddress = '0x6471a7bf4fd4873eac1dd4f2e10898ec0354028331e1c4a9d79cd43161377785';
      const keyBytes = new Uint8Array(Buffer.from('OnRampState', 'utf-8'));
      const expected = '0xbce28dbe6eae4ee7fc128e2e9bee216e5a234505181cb03ad3747bfcd588163f';

      const result = deriveObjectIdWithVectorU8Key(parentAddress, keyBytes);

      assert.strictEqual(result, expected);
    });

    it('should derive different IDs for different keys', () => {
      const parentAddress = '0x6471a7bf4fd4873eac1dd4f2e10898ec0354028331e1c4a9d79cd43161377785';
      const key1 = new Uint8Array(Buffer.from('OnRampState', 'utf-8'));
      const key2 = new Uint8Array(Buffer.from('OffRampState', 'utf-8'));

      const result1 = deriveObjectIdWithVectorU8Key(parentAddress, key1);
      const result2 = deriveObjectIdWithVectorU8Key(parentAddress, key2);

      assert.notStrictEqual(result1, result2);
    });

    it('should produce valid Sui address format', () => {
      const parentAddress = '0x6471a7bf4fd4873eac1dd4f2e10898ec0354028331e1c4a9d79cd43161377785';
      const keyBytes = new Uint8Array(Buffer.from('CCIPObjectRef', 'utf-8'));

      const result = deriveObjectIdWithVectorU8Key(parentAddress, keyBytes);

      assert.match(result, /^0x[a-f0-9]{64}$/);
    });
  });
});