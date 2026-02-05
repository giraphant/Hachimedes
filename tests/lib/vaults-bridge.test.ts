import { describe, it, expect, beforeAll } from 'vitest';
import { connection, KNOWN_VAULT_ID, JLP_MINT, USDS_MINT } from '../helpers/rpc';
import {
  getVaultConfig,
  getAvailableVaults,
  setDiscoveredVaults,
  DEFAULT_VAULT_ID,
} from '@/lib/vaults';
import { discoverAllVaults, clearVaultCache } from '@/lib/vault-discovery';

describe('Vaults Bridge (vaults.ts)', () => {
  describe('Scenario: Fallback vaults work before discovery', () => {
    // Given: No vault discovery has run (dynamic vaults not set)
    // When:  Calling getVaultConfig(34)
    // Then:  Returns hardcoded fallback for vault 34

    it('should return fallback for vault 34', () => {
      const config = getVaultConfig(34);
      expect(config.id).toBe(34);
      expect(config.collateralToken).toBe('JLP');
      expect(config.debtToken).toBe('USDS');
    });

    it('should throw for unknown vault in fallback mode', () => {
      expect(() => getVaultConfig(999)).toThrow(/not found/i);
    });

    it('DEFAULT_VAULT_ID should be 34', () => {
      expect(DEFAULT_VAULT_ID).toBe(34);
    });
  });

  describe('Scenario: Dynamic vaults populated after discovery', () => {
    // Given: discoverAllVaults() has been called
    // When:  setDiscoveredVaults() is called with results
    // Then:  getAvailableVaults() returns all discovered vaults

    beforeAll(async () => {
      clearVaultCache();
      const discovered = await discoverAllVaults(connection, true);
      setDiscoveredVaults(discovered);
    });

    it('should have more vaults than the 3 hardcoded fallbacks', () => {
      const vaults = getAvailableVaults();
      expect(vaults.length).toBeGreaterThan(3);
    });

    it('should still include vault 34', () => {
      const v34 = getVaultConfig(34);
      expect(v34.id).toBe(34);
      expect(v34.collateralMint).toBe(JLP_MINT);
      expect(v34.debtMint).toBe(USDS_MINT);
    });

    it('should return vaults sorted by ID', () => {
      const vaults = getAvailableVaults();
      for (let i = 1; i < vaults.length; i++) {
        expect(vaults[i].id).toBeGreaterThan(vaults[i - 1].id);
      }
    });
  });

  describe('Scenario: VaultConfig has all required fields', () => {
    // Given: Dynamic vaults are set
    // When:  Inspecting any vault config
    // Then:  All fields (collateralMint, debtMint, decimals, LTV) are present

    it('should have complete fields for every vault', () => {
      const vaults = getAvailableVaults();
      for (const v of vaults) {
        expect(v.id).toBeTypeOf('number');
        expect(v.name).toBeTruthy();
        expect(v.collateralToken).toBeTruthy();
        expect(v.debtToken).toBeTruthy();
        expect(v.collateralMint.length).toBeGreaterThanOrEqual(32);
        expect(v.debtMint.length).toBeGreaterThanOrEqual(32);
        expect(v.collateralDecimals).toBeGreaterThanOrEqual(6);
        expect(v.debtDecimals).toBeGreaterThanOrEqual(6);
        expect(v.maxLtv).toBeGreaterThan(0);
        expect(v.liquidationLtv).toBeGreaterThan(v.maxLtv);
        expect(v.oracleAddress.length).toBeGreaterThanOrEqual(32);
      }
    });
  });
});
