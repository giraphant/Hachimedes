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
 * Mint address → token info lookup (for vault discovery)
 * Ported from Matsu's juplend_pool.py KNOWN_MINTS
 */
export const KNOWN_MINTS: Record<string, { symbol: string; decimals: number }> = {
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4': { symbol: 'JLP', decimals: 6 },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', decimals: 6 },
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA': { symbol: 'USDS', decimals: 6 },
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', decimals: 9 },
  'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD': { symbol: 'JupUSD', decimals: 6 },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', decimals: 6 },
  '7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT': { symbol: 'UXD', decimals: 6 },
  'USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX': { symbol: 'USDH', decimals: 6 },
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': { symbol: 'bSOL', decimals: 9 },
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': { symbol: 'JitoSOL', decimals: 9 },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { symbol: 'mSOL', decimals: 9 },
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': { symbol: 'stSOL', decimals: 9 },
  'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v': { symbol: 'jupSOL', decimals: 9 },
  'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A': { symbol: 'hSOL', decimals: 9 },
  'LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp': { symbol: 'LST', decimals: 9 },
  'suPer8CPwxoJPQ7zksGMwFvjBQhjAHwUMmPV4FVatBw': { symbol: 'superSOL', decimals: 9 },
  'Bybit2vBJGhPF52GBdNaQ9UiEYEDc5qfaEaLGDJzYwKt': { symbol: 'bbSOL', decimals: 9 },
  'BonK1YhkXEGLZzwtcvRTip3gAL9nCeQD7ppZBLXhtTs': { symbol: 'BONK', decimals: 9 },
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': { symbol: 'WIF', decimals: 9 },
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': { symbol: 'PYTH', decimals: 9 },
  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL': { symbol: 'JTO', decimals: 9 },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': { symbol: 'ETH', decimals: 9 },
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': { symbol: 'wBTC', decimals: 8 },
  '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH': { symbol: 'USDG', decimals: 6 },
  'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr': { symbol: 'EURC', decimals: 6 },
  'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij': { symbol: 'cbBTC', decimals: 8 },
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo': { symbol: 'PYUSD', decimals: 6 },
  'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj': { symbol: 'syrupUSDC', decimals: 6 },
  '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm': { symbol: 'INF', decimals: 9 },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', decimals: 9 },
  '7GxATsNMnaC88vdwd2t3mwrFuQwwGvmYPrUQ4D6FotXk': { symbol: 'jlJUPUSD', decimals: 9 },
  'CtzPWv73Sn1dMGVU3ZtLv9yWSyUAanBni19YWDaznnkn': { symbol: 'xBTC', decimals: 8 },
  'LBTCgU4b3wsFKsPwBn1rRZDx5DoFutM6RPiEt1TPDsY': { symbol: 'LBTC', decimals: 8 },
  '59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw': { symbol: 'PST', decimals: 6 },
};

/** Stablecoin symbols — debt priced at $1.0 */
export const STABLECOIN_SYMBOLS = new Set([
  'USDC', 'USDS', 'USDG', 'JupUSD', 'USDT', 'UXD', 'USDH', 'PYUSD', 'syrupUSDC', 'EURC', 'PST',
]);

/**
 * RPC 端点
 */
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * Jupiter Lend API 基础 URL
 */
export const JUPITER_LEND_API = 'https://lend.jup.ag';
