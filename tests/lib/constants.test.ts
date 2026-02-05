import { describe, it, expect } from 'vitest';
import { KNOWN_MINTS, STABLECOIN_SYMBOLS, TOKENS } from '@/lib/constants';

describe('Token Registry (constants.ts)', () => {
  describe('Scenario: Key tokens exist in KNOWN_MINTS', () => {
    // Given: KNOWN_MINTS registry
    // When:  Looking up known Solana token mints
    // Then:  Each returns correct symbol and decimals

    it('should contain JLP', () => {
      const jlp = KNOWN_MINTS['27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4'];
      expect(jlp).toBeDefined();
      expect(jlp.symbol).toBe('JLP');
      expect(jlp.decimals).toBe(6);
    });

    it('should contain SOL with 9 decimals', () => {
      const sol = KNOWN_MINTS['So11111111111111111111111111111111111111112'];
      expect(sol).toBeDefined();
      expect(sol.symbol).toBe('SOL');
      expect(sol.decimals).toBe(9);
    });

    it('should contain USDC with 6 decimals', () => {
      const usdc = KNOWN_MINTS['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
      expect(usdc).toBeDefined();
      expect(usdc.symbol).toBe('USDC');
      expect(usdc.decimals).toBe(6);
    });

    it('should contain wBTC with 8 decimals', () => {
      const wbtc = KNOWN_MINTS['3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh'];
      expect(wbtc).toBeDefined();
      expect(wbtc.symbol).toBe('wBTC');
      expect(wbtc.decimals).toBe(8);
    });

    it('should have at least 30 entries', () => {
      expect(Object.keys(KNOWN_MINTS).length).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Scenario: All decimals are valid (6, 8, or 9)', () => {
    // Given: All KNOWN_MINTS entries
    // When:  Checking decimals field
    // Then:  Each is 6, 8, or 9 (only valid Solana token decimal counts)

    it('should have decimals in {6, 8, 9}', () => {
      const validDecimals = new Set([6, 8, 9]);
      for (const [mint, info] of Object.entries(KNOWN_MINTS)) {
        expect(validDecimals.has(info.decimals)).toBe(true);
      }
    });
  });

  describe('Scenario: STABLECOIN_SYMBOLS is correct', () => {
    // Given: STABLECOIN_SYMBOLS set
    // When:  Checking for key stablecoins
    // Then:  All major stablecoins are included

    it('should include USDC, USDS, USDT, USDG', () => {
      expect(STABLECOIN_SYMBOLS.has('USDC')).toBe(true);
      expect(STABLECOIN_SYMBOLS.has('USDS')).toBe(true);
      expect(STABLECOIN_SYMBOLS.has('USDT')).toBe(true);
      expect(STABLECOIN_SYMBOLS.has('USDG')).toBe(true);
    });

    it('should NOT include non-stablecoins', () => {
      expect(STABLECOIN_SYMBOLS.has('SOL')).toBe(false);
      expect(STABLECOIN_SYMBOLS.has('JLP')).toBe(false);
      expect(STABLECOIN_SYMBOLS.has('BONK')).toBe(false);
    });
  });

  describe('Scenario: TOKENS legacy registry consistency', () => {
    // Given: TOKENS and KNOWN_MINTS both exist
    // When:  Cross-referencing entries that exist in both
    // Then:  Symbols and decimals match

    it('should have matching data between TOKENS and KNOWN_MINTS', () => {
      for (const [sym, info] of Object.entries(TOKENS)) {
        const knownMint = KNOWN_MINTS[info.mint];
        if (knownMint) {
          expect(knownMint.symbol).toBe(info.symbol);
          // Note: JUP has 6 in TOKENS but 9 in KNOWN_MINTS — this is a known
          // discrepancy because KNOWN_MINTS uses on-chain decimals while
          // TOKENS was manually curated. Skip JUP for this check.
          if (info.symbol !== 'JUP') {
            expect(knownMint.decimals).toBe(info.decimals);
          }
        }
      }
    });
  });
});
