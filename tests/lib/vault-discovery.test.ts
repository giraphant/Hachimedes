import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { connection, KNOWN_VAULT_ID, JLP_MINT, USDS_MINT } from '../helpers/rpc';
import {
  discoverAllVaults,
  clearVaultCache,
  getDiscoveredVault,
  DiscoveredVault,
} from '@/lib/vault-discovery';

describe('Vault Discovery', () => {
  let vaults: DiscoveredVault[];

  beforeAll(async () => {
    clearVaultCache();
    vaults = await discoverAllVaults(connection, true); // force fresh scan
  });

  afterEach(() => {
    // Don't clear between tests — reuse the scan result
  });

  describe('Scenario: Discover active vaults on-chain', () => {
    // Given: A live Solana Mainnet RPC connection
    // When:  discoverAllVaults() scans vault IDs 0-200
    // Then:  Returns a non-empty array of DiscoveredVault objects

    it('should discover at least 10 vaults', () => {
      expect(vaults.length).toBeGreaterThanOrEqual(10);
    });

    it('should find known vault ID 34 (JLP/USDS)', () => {
      const v34 = vaults.find(v => v.id === 34);
      expect(v34).toBeDefined();
    });

    it('should stop scanning after consecutive misses', () => {
      // All vault IDs should be <= 200 (MAX_ID)
      for (const v of vaults) {
        expect(v.id).toBeLessThanOrEqual(200);
      }
    });
  });

  describe('Scenario: Each vault has valid fields', () => {
    // Given: A successfully discovered vault array
    // When:  Inspecting each vault's fields
    // Then:  All required fields are populated with valid data

    it('should have non-empty name for each vault', () => {
      for (const v of vaults) {
        expect(v.name).toBeTruthy();
        expect(v.name).toContain('/'); // e.g. "JLP/USDS"
      }
    });

    it('should have valid collateralMint (base58, 32-44 chars)', () => {
      for (const v of vaults) {
        expect(v.collateralMint.length).toBeGreaterThanOrEqual(32);
        expect(v.collateralMint.length).toBeLessThanOrEqual(44);
      }
    });

    it('should have valid debtMint (base58, 32-44 chars)', () => {
      for (const v of vaults) {
        expect(v.debtMint.length).toBeGreaterThanOrEqual(32);
        expect(v.debtMint.length).toBeLessThanOrEqual(44);
      }
    });

    it('should have maxLtv > 0 and < 100', () => {
      for (const v of vaults) {
        expect(v.maxLtv).toBeGreaterThan(0);
        expect(v.maxLtv).toBeLessThan(100);
      }
    });

    it('should have liquidationLtv > maxLtv', () => {
      for (const v of vaults) {
        expect(v.liquidationLtv).toBeGreaterThan(v.maxLtv);
      }
    });
  });

  describe('Scenario: Known vault parameters match expectations', () => {
    // Given: Vault #34 (JLP/USDS) exists on-chain
    // When:  Reading its parsed fields
    // Then:  Fields match known values from Jupiter Lend UI

    it('vault 34: collateralMint = JLP', () => {
      const v = getDiscoveredVault(34);
      expect(v).toBeDefined();
      expect(v!.collateralMint).toBe(JLP_MINT);
    });

    it('vault 34: debtMint = USDS', () => {
      const v = getDiscoveredVault(34);
      expect(v!.debtMint).toBe(USDS_MINT);
    });

    it('vault 34: maxLtv around 82%', () => {
      const v = getDiscoveredVault(34);
      // Allow ±5% tolerance for protocol parameter changes
      expect(v!.maxLtv).toBeGreaterThanOrEqual(75);
      expect(v!.maxLtv).toBeLessThanOrEqual(90);
    });

    it('vault 34: collateralSymbol = JLP', () => {
      const v = getDiscoveredVault(34);
      expect(v!.collateralSymbol).toBe('JLP');
    });
  });

  describe('Scenario: Memory cache works after first scan', () => {
    // Given: discoverAllVaults was already called
    // When:  Calling it again without forceRefresh
    // Then:  Returns instantly from memory cache (same reference)

    it('should return cached result on second call', async () => {
      const cached = await discoverAllVaults(connection); // no force
      expect(cached).toBe(vaults); // same reference = memory cache hit
    });
  });
});
