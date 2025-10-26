/**
 * Jupiter Lend Vault 配置
 * 每个 Vault 定义了固定的抵押品/债务代币对
 */

export interface VaultConfig {
  id: number;
  name: string;
  description: string;
  collateralToken: string;  // 抵押品代币 key（TOKENS 中的 key）
  debtToken: string;        // 债务代币 key（TOKENS 中的 key）
  maxLtv: number;           // 最大 LTV (%)
  liquidationLtv: number;   // 清算 LTV (%)
  vaultAddress: string;     // Vault 地址
  oracleAddress: string;    // 价格预言机地址
}

export const VAULTS: Record<number, VaultConfig> = {
  8: {
    id: 8,
    name: 'JLP/USDC',
    description: 'Jupiter LP Token as collateral, USDC as debt',
    collateralToken: 'JLP',
    debtToken: 'USDC',
    maxLtv: 82,
    liquidationLtv: 88,
    vaultAddress: '7xL193GD5oUvhKBruYuNofMexMUztzujdzxw5UhaWL1U',
    oracleAddress: '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw', // TODO: 需要找到正确的预言机地址
  },
  10: {
    id: 10,
    name: 'JLP/USDG',
    description: 'Jupiter LP Token as collateral, USDG as debt',
    collateralToken: 'JLP',
    debtToken: 'USDG',
    maxLtv: 82,
    liquidationLtv: 88,
    vaultAddress: 'C6uU7KDu6iQajELeNTJYVnt15TzNaQ29KovvBPe2sKnR',
    oracleAddress: '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw', // TODO: 需要找到正确的预言机地址
  },
  34: {
    id: 34,
    name: 'JLP/USDS',
    description: 'Jupiter LP Token as collateral, USDS as debt',
    collateralToken: 'JLP',
    debtToken: 'USDS',
    maxLtv: 82,
    liquidationLtv: 88,
    vaultAddress: '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw',
    oracleAddress: '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw', // JLP/USDS 预言机
  },
};

export const DEFAULT_VAULT_ID = 34;

export function getVaultConfig(vaultId: number): VaultConfig {
  const config = VAULTS[vaultId];
  if (!config) {
    throw new Error(`Vault ${vaultId} not found`);
  }
  return config;
}

export function getAvailableVaults(): VaultConfig[] {
  return Object.values(VAULTS);
}
