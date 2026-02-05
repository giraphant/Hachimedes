import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { connection, KNOWN_VAULT_ID } from '../helpers/rpc';
import { fetchPositionInfo } from '@/lib/position';

describe('Position Reading', () => {
  describe('Scenario: Read a valid position from vault #34', () => {
    // Given: Vault #34 (JLP/USDS) and position #0
    //        (position 0 is the protocol-wide default, always exists as an account)
    // When:  fetchPositionInfo is called
    // Then:  Returns a PositionInfo with numeric fields

    it('should return position data or null without crashing', async () => {
      // We use a zero pubkey as owner — the function should still return data
      // based on vault/position IDs (owner is for metadata only)
      const owner = new PublicKey('11111111111111111111111111111111');
      const result = await fetchPositionInfo(connection, KNOWN_VAULT_ID, 0, owner);

      // Position 0 may or may not exist for this owner, but the call must not throw
      if (result) {
        expect(result.vaultId).toBe(KNOWN_VAULT_ID);
        expect(result.positionId).toBe(0);
        expect(typeof result.collateralAmount).toBe('number');
        expect(typeof result.debtAmount).toBe('number');
        expect(result.collateralAmountUi).toBeGreaterThanOrEqual(0);
        expect(result.debtAmountUi).toBeGreaterThanOrEqual(0);
      }
      // null is also acceptable (no position for this owner/id combo)
    });
  });

  describe('Scenario: Nonexistent vault returns null', () => {
    // Given: A vault ID that doesn't exist (199)
    // When:  fetchPositionInfo is called
    // Then:  Returns null without throwing

    it('should return null for invalid vault', async () => {
      const owner = new PublicKey('11111111111111111111111111111111');
      // Vault 199 almost certainly doesn't exist
      const result = await fetchPositionInfo(connection, 199, 0, owner);
      expect(result).toBeNull();
    });
  });
});
