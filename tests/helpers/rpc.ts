import { Connection } from '@solana/web3.js';
import { RPC_ENDPOINT } from '@/lib/constants';

// Single shared connection for all tests (reuses HTTP keep-alive)
export const connection = new Connection(RPC_ENDPOINT, 'confirmed');

// Known vault IDs that exist on-chain (used across test files)
export const KNOWN_VAULT_ID = 34;        // JLP/USDS — our primary vault
export const KNOWN_VAULT_JLP_USDC = 8;   // JLP/USDC — second vault
export const KNOWN_VAULT_JLP_USDG = 10;  // JLP/USDG — third vault

// Known oracle addresses
export const JLP_ORACLE = '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw';

// Known mint addresses
export const JLP_MINT = '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4';
export const USDS_MINT = 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
