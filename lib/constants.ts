import { PublicKey } from '@solana/web3.js';

/**
 * 代币配置
 */
export interface TokenInfo {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  logoURI?: string;
}

/**
 * 支持的代币列表（Mainnet）
 */
export const TOKENS: Record<string, TokenInfo> = {
  JLP: {
    symbol: 'JLP',
    name: 'Jupiter Perps LP',
    mint: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
    decimals: 6,
  },
  USDS: {
    symbol: 'USDS',
    name: 'USDS Stablecoin',
    mint: 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',
    decimals: 6,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
  },
  SOL: {
    symbol: 'SOL',
    name: 'Wrapped SOL',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
  },
  JUP: {
    symbol: 'JUP',
    name: 'Jupiter',
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    decimals: 6,
  },
  USDG: {
    symbol: 'USDG',
    name: 'USDG Stablecoin',
    mint: '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH',
    decimals: 6,
  },
};

/**
 * Jupiter Lend Vault 配置
 */
export const VAULTS: Record<number, { name: string; collateral: string; debt: string }> = {
  34: {
    name: 'JLP/USDS Pool',
    collateral: 'JLP',
    debt: 'USDS',
  },
};

/**
 * RPC 端点
 */
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * Jupiter Lend API 基础 URL
 */
export const JUPITER_LEND_API = 'https://lend.jup.ag';
