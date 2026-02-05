import { describe, it, expect } from 'vitest';

// Test the safe amount rounding logic extracted from leverage-flashloan-swap.ts
// These are pure math functions — no RPC needed.

/** Replicate the safe amount rounding from leverage-flashloan-swap.ts */
function roundToSafeAmount(amount: number, debtScale: number): number {
  if (debtScale !== 1e6) {
    // Non-stablecoin: just ceil
    return Math.ceil(amount);
  }
  // Stablecoin (6-decimal) safe rounding
  const SAFE_AMOUNTS = [3, 5, 8, 10, 15, 20, 25, 30, 50, 100];
  if (amount >= 8) return Math.ceil(amount);
  for (const safe of SAFE_AMOUNTS) {
    if (safe >= amount) return safe;
  }
  return Math.ceil(amount);
}

/** Replicate debtScale/collateralScale calculation */
function computeScale(decimals: number): number {
  return Math.pow(10, decimals);
}

describe('Flash Loan Parameter Math', () => {
  describe('Scenario: 6-decimal stablecoin safe rounding', () => {
    // Given: A debt token with 6 decimals (stablecoin)
    // When:  Rounding small flash loan amounts
    // Then:  Rounds up to known safe amounts to avoid tick init

    it('1 USDS → 3 (next safe amount)', () => {
      expect(roundToSafeAmount(1, 1e6)).toBe(3);
    });

    it('2 USDS → 3', () => {
      expect(roundToSafeAmount(2, 1e6)).toBe(3);
    });

    it('4 USDS → 5', () => {
      expect(roundToSafeAmount(4, 1e6)).toBe(5);
    });

    it('6 USDS → 8', () => {
      expect(roundToSafeAmount(6, 1e6)).toBe(8);
    });

    it('8 USDS → 8 (already safe, ceil)', () => {
      expect(roundToSafeAmount(8, 1e6)).toBe(8);
    });

    it('100 USDS → 100 (>= 8, ceil works)', () => {
      expect(roundToSafeAmount(100, 1e6)).toBe(100);
    });

    it('7.5 USDS → 8 (>= 8 path, ceil)', () => {
      expect(roundToSafeAmount(7.5, 1e6)).toBe(8);
    });
  });

  describe('Scenario: 9-decimal token just uses ceil', () => {
    // Given: A collateral token with 9 decimals (e.g. SOL)
    // When:  Rounding flash loan amounts
    // Then:  Just Math.ceil — no safe amount logic

    it('1.5 SOL → 2 (plain ceil)', () => {
      expect(roundToSafeAmount(1.5, 1e9)).toBe(2);
    });

    it('0.1 SOL → 1', () => {
      expect(roundToSafeAmount(0.1, 1e9)).toBe(1);
    });
  });

  describe('Scenario: Scale calculation from decimals', () => {
    // Given: Various token decimal counts
    // When:  Computing the scale factor
    // Then:  Returns 10^decimals

    it('6 decimals → 1e6', () => {
      expect(computeScale(6)).toBe(1_000_000);
    });

    it('8 decimals → 1e8', () => {
      expect(computeScale(8)).toBe(100_000_000);
    });

    it('9 decimals → 1e9', () => {
      expect(computeScale(9)).toBe(1_000_000_000);
    });
  });
});
