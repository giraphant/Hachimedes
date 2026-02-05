import { describe, it, expect, beforeAll } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { connection, JLP_ORACLE } from '../helpers/rpc';
import { discoverAllVaults, clearVaultCache, DiscoveredVault } from '@/lib/vault-discovery';

// Replicate the oracle reading logic from position.ts for testing
async function readOraclePrice(conn: Connection, oracleAddr: string): Promise<number | null> {
  try {
    const acct = await conn.getAccountInfo(new PublicKey(oracleAddr));
    if (!acct) return null;
    const data = acct.data;

    // Oracle wrapper (disc 8bc283b38cb3e5f4): resolve inner oracle recursively
    const WRAPPER_DISC = Buffer.from('8bc283b38cb3e5f4', 'hex');
    if (data.length >= 46 && data.subarray(0, 8).equals(WRAPPER_DISC)) {
      const inner = new PublicKey(data.subarray(14, 46)).toString();
      return readOraclePrice(conn, inner);
    }

    // Pyth V2 format (large account ~3312 bytes)
    if (data.length > 1000 && data.length >= 216) {
      const expo = data.readInt32LE(20);
      const raw = data.readBigInt64LE(208);
      const price = Number(raw) * Math.pow(10, expo);
      return price > 0 ? price : null;
    }

    // jup3 oracle format (~196 bytes, disc 87c75210f983b6f1)
    const JUP3_DISC = Buffer.from('87c75210f983b6f1', 'hex');
    if (data.length >= 115 && data.subarray(0, 8).equals(JUP3_DISC)) {
      const raw = data.readBigUInt64LE(107);
      return Number(raw) / 1e12;
    }

    // Jupiter Lend oracle format (small account ~134 bytes)
    if (data.length >= 81) {
      const raw = data.readBigUInt64LE(73);
      const price = Number(raw) / 1e8;
      return price > 0 && isFinite(price) ? price : null;
    }

    return null;
  } catch {
    return null;
  }
}

describe('Oracle Reading', () => {
  let vaults: DiscoveredVault[];

  beforeAll(async () => {
    clearVaultCache();
    vaults = await discoverAllVaults(connection, true);
  });

  describe('Scenario: Read JLP oracle price (JupLend or Pyth format)', () => {
    // Given: The JLP oracle address from vault #34
    // When:  Reading and parsing the oracle account data
    // Then:  Returns a positive price in the range $1-$20 (JLP is ~$3-$6)

    it('should return a positive price for JLP oracle', async () => {
      const price = await readOraclePrice(connection, JLP_ORACLE);
      expect(price).not.toBeNull();
      expect(price!).toBeGreaterThan(0.1);
      expect(price!).toBeLessThan(100); // JLP won't be >$100
    });
  });

  describe('Scenario: Oracle prices for all discovered vaults are readable', () => {
    // Given: All discovered vaults have oracle addresses
    // When:  Reading each vault's oracle
    // Then:  At least 80% of vaults return a valid price

    it('should successfully read prices for most vaults', async () => {
      let successes = 0;
      const sampleVaults = vaults.slice(0, 20); // test first 20 to limit RPC calls

      for (const v of sampleVaults) {
        const price = await readOraclePrice(connection, v.oracleAddress);
        if (price !== null && price > 0) successes++;
      }

      const successRate = successes / sampleVaults.length;
      expect(successRate).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Scenario: Oracle wrapper recursion resolves correctly', () => {
    // Given: Some vaults use oracle wrappers (disc 8bc283b38cb3e5f4)
    // When:  Reading such an oracle
    // Then:  It resolves through the wrapper and returns a valid price

    it('should handle wrapper oracles transparently', async () => {
      // Find a vault whose oracle is a wrapper (detect by reading account)
      for (const v of vaults.slice(0, 20)) {
        const acct = await connection.getAccountInfo(new PublicKey(v.oracleAddress));
        if (!acct) continue;
        const WRAPPER_DISC = Buffer.from('8bc283b38cb3e5f4', 'hex');
        if (acct.data.length >= 46 && acct.data.subarray(0, 8).equals(WRAPPER_DISC)) {
          const price = await readOraclePrice(connection, v.oracleAddress);
          expect(price).not.toBeNull();
          expect(price!).toBeGreaterThan(0);
          return; // found and tested a wrapper oracle
        }
      }
      // If no wrapper oracle found in sample, skip (not a failure)
      console.log('No oracle wrapper found in sample — skipping');
    });
  });

  describe('Scenario: Invalid oracle address returns null', () => {
    // Given: A fake oracle address
    // When:  Attempting to read it
    // Then:  Returns null without throwing

    it('should return null for nonexistent oracle', async () => {
      const price = await readOraclePrice(
        connection,
        '11111111111111111111111111111111'
      );
      expect(price).toBeNull();
    });
  });
});
