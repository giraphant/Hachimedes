import { DiscoveredVault } from './vault-discovery';

export interface VaultConfig {
  id: number;
  name: string;
  description: string;
  collateralToken: string;
  debtToken: string;
  collateralMint: string;
  debtMint: string;
  collateralDecimals: number;
  debtDecimals: number;
  maxLtv: number;
  liquidationLtv: number;
  oracleAddress: string;
}

// Hardcoded fallback (used before discovery completes)
const FALLBACK_VAULTS: Record<number, VaultConfig> = {
  8: {
    id: 8, name: 'JLP/USDC', description: 'JLP collateral, USDC debt',
    collateralToken: 'JLP', debtToken: 'USDC',
    collateralMint: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
    debtMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    collateralDecimals: 6, debtDecimals: 6,
    maxLtv: 82, liquidationLtv: 88,
    oracleAddress: '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw',
  },
  10: {
    id: 10, name: 'JLP/USDG', description: 'JLP collateral, USDG debt',
    collateralToken: 'JLP', debtToken: 'USDG',
    collateralMint: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
    debtMint: '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH',
    collateralDecimals: 6, debtDecimals: 6,
    maxLtv: 82, liquidationLtv: 88,
    oracleAddress: '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw',
  },
  34: {
    id: 34, name: 'JLP/USDS', description: 'JLP collateral, USDS debt',
    collateralToken: 'JLP', debtToken: 'USDS',
    collateralMint: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
    debtMint: 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',
    collateralDecimals: 6, debtDecimals: 6,
    maxLtv: 82, liquidationLtv: 88,
    oracleAddress: '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw',
  },
};

export const DEFAULT_VAULT_ID = 34;

// Dynamic vault storage (set by FlashLoanInterface after discovery)
let dynamicVaults: Record<number, VaultConfig> | null = null;

export function setDiscoveredVaults(vaults: DiscoveredVault[]): void {
  dynamicVaults = {};
  for (const v of vaults) {
    dynamicVaults[v.id] = {
      id: v.id,
      name: v.name,
      description: `${v.collateralSymbol} collateral, ${v.debtSymbol} debt`,
      collateralToken: v.collateralSymbol,
      debtToken: v.debtSymbol,
      collateralMint: v.collateralMint,
      debtMint: v.debtMint,
      collateralDecimals: v.collateralDecimals,
      debtDecimals: v.debtDecimals,
      maxLtv: v.maxLtv,
      liquidationLtv: v.liquidationLtv,
      oracleAddress: v.oracleAddress,
    };
  }
}

export function getVaultConfig(vaultId: number): VaultConfig {
  const source = dynamicVaults ?? FALLBACK_VAULTS;
  const config = source[vaultId];
  if (!config) {
    throw new Error(`Vault ${vaultId} not found. Available: ${Object.keys(source).join(', ')}`);
  }
  return config;
}

export function getAvailableVaults(): VaultConfig[] {
  const source = dynamicVaults ?? FALLBACK_VAULTS;
  return Object.values(source).sort((a, b) => a.id - b.id);
}
