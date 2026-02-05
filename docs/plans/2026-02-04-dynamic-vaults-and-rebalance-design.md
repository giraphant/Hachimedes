# Dynamic Vault Discovery + Cross-Vault Rebalance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port Matsu's dynamic vault discovery from Python to TypeScript and add all-vault flash loan operations + cross-vault collateral rebalance to Hachimedes.

**Architecture:** New `lib/vault-discovery.ts` reads vault_config PDAs on-chain to discover all JupLend vaults dynamically, replacing hardcoded vault list. Existing flash loan files get parameterized to work with any vault's token decimals. New `lib/rebalance.ts` builds withdraw+deposit transactions across two same-collateral vaults.

**Tech Stack:** TypeScript, Solana web3.js, @jup-ag/lend SDK, @jup-ag/api, Next.js 16, React 19, shadcn/ui

---

## Task 1: Token Registry — Expand `lib/constants.ts`

Port the `KNOWN_MINTS` dict from Matsu's `juplend_pool.py` (lines 58-122) into the existing `TOKENS` record. This is the foundation for all vault discovery — we need mint→symbol+decimals lookups.

**Files:**
- Modify: `lib/constants.ts`

**Step 1: Expand the TOKENS record**

Add all known mints from Matsu. Keep existing entries, add new ones. The key is the mint address (not symbol) for lookup during discovery. Add a parallel `KNOWN_MINTS` map for mint→TokenInfo lookup.

```typescript
// Add after existing TOKENS record in lib/constants.ts

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
```

**Step 2: Verify build**

Run: `cd /home/ramu/Hachimedes && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds (new exports are additive)

**Step 3: Commit**

```bash
git add lib/constants.ts
git commit -m "feat: add KNOWN_MINTS registry and STABLECOIN_SYMBOLS for vault discovery"
```

---

## Task 2: Vault Discovery Module — Create `lib/vault-discovery.ts`

Port the core vault discovery logic from Matsu's `juplend_pool.py` (lines 184-337) and `juplend.py` (lines 258-354). This reads vault_config PDAs on-chain to find all vaults dynamically.

**Files:**
- Create: `lib/vault-discovery.ts`

**Reference files (read these first):**
- Matsu source: `/home/ramu/matsu/backend/app/exchanges/juplend_pool.py` lines 184-337 (discover_all_vaults)
- Matsu source: `/home/ramu/matsu/backend/app/exchanges/juplend.py` lines 258-354 (_load_vault_configs, _parse_vault_config)
- Matsu source: `/home/ramu/matsu/backend/app/exchanges/solana_utils.py` (PDA derivation)

**Step 1: Create the vault discovery module**

```typescript
// lib/vault-discovery.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { KNOWN_MINTS } from './constants';

const VAULTS_PROGRAM_ID = 'jupr81YtYssSyPt8jbnGuiWon5f6x9TcDEFxYe3Bdzi';

// vault_config parsing offsets (from Matsu juplend.py lines 94-101)
const VAULT_CONFIG_COLLATERAL_FACTOR_OFFSET = 14; // u16, per-mille
const VAULT_CONFIG_LIQ_THRESHOLD_OFFSET = 16;     // u16, per-mille
const VAULT_CONFIG_ORACLE_OFFSET = 26;             // 32-byte pubkey
const VAULT_CONFIG_COLLATERAL_MINT_OFFSET = 154;   // 32-byte pubkey
const VAULT_CONFIG_DEBT_MINT_OFFSET = 186;         // 32-byte pubkey
const VAULT_CONFIG_MIN_LENGTH = 218;

export interface DiscoveredVault {
  id: number;
  name: string;                  // e.g. "JLP/USDS"
  collateralMint: string;
  collateralSymbol: string;
  collateralDecimals: number;
  debtMint: string;
  debtSymbol: string;
  debtDecimals: number;
  maxLtv: number;                // collateral_factor / 10 (percentage)
  liquidationLtv: number;        // liquidation_threshold / 10 (percentage)
  oracleAddress: string;
  vaultConfigAddress: string;
}

// Module-level cache
let vaultCache: DiscoveredVault[] | null = null;
let vaultCacheTime: number | null = null;
const CACHE_TTL = 3600_000; // 1 hour in ms

/**
 * Derive vault_config PDA for a given vault ID.
 * seeds = ["vault_config", vault_id(u16 LE)], program = VAULTS_PROGRAM_ID
 */
function deriveVaultConfigPDA(vaultId: number): PublicKey {
  const vidBuffer = Buffer.alloc(2);
  vidBuffer.writeUInt16LE(vaultId);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_config'), vidBuffer],
    new PublicKey(VAULTS_PROGRAM_ID)
  );
  return pda;
}

/**
 * Parse a vault_config account's data into a DiscoveredVault.
 */
function parseVaultConfig(vaultId: number, data: Buffer, vaultConfigAddress: string): DiscoveredVault | null {
  if (data.length < VAULT_CONFIG_MIN_LENGTH) return null;

  const collateralFactorRaw = data.readUInt16LE(VAULT_CONFIG_COLLATERAL_FACTOR_OFFSET);
  const liqThresholdRaw = data.readUInt16LE(VAULT_CONFIG_LIQ_THRESHOLD_OFFSET);
  const oracleBytes = data.subarray(VAULT_CONFIG_ORACLE_OFFSET, VAULT_CONFIG_ORACLE_OFFSET + 32);
  const collateralMintBytes = data.subarray(VAULT_CONFIG_COLLATERAL_MINT_OFFSET, VAULT_CONFIG_COLLATERAL_MINT_OFFSET + 32);
  const debtMintBytes = data.subarray(VAULT_CONFIG_DEBT_MINT_OFFSET, VAULT_CONFIG_DEBT_MINT_OFFSET + 32);

  const oracleAddress = new PublicKey(oracleBytes).toString();
  const collateralMint = new PublicKey(collateralMintBytes).toString();
  const debtMint = new PublicKey(debtMintBytes).toString();

  const collInfo = KNOWN_MINTS[collateralMint];
  const debtInfo = KNOWN_MINTS[debtMint];

  const collateralSymbol = collInfo?.symbol ?? collateralMint.slice(0, 6);
  const collateralDecimals = collInfo?.decimals ?? 9;
  const debtSymbol = debtInfo?.symbol ?? debtMint.slice(0, 6);
  const debtDecimals = debtInfo?.decimals ?? 6;

  return {
    id: vaultId,
    name: `${collateralSymbol}/${debtSymbol}`,
    collateralMint,
    collateralSymbol,
    collateralDecimals,
    debtMint,
    debtSymbol,
    debtDecimals,
    maxLtv: collateralFactorRaw / 10,
    liquidationLtv: liqThresholdRaw / 10,
    oracleAddress,
    vaultConfigAddress,
  };
}

/**
 * Discover all JupLend vaults on-chain.
 * Iterates vault IDs 0..200, batch-reads vault_config PDAs.
 * Stops after MAX_CONSECUTIVE_MISSES misses.
 * Results cached for 1 hour.
 */
export async function discoverAllVaults(
  connection: Connection,
  forceRefresh = false,
): Promise<DiscoveredVault[]> {
  const now = Date.now();
  if (!forceRefresh && vaultCache && vaultCacheTime && (now - vaultCacheTime) < CACHE_TTL) {
    return vaultCache;
  }

  const BATCH = 10;
  const MAX_ID = 200;
  const MAX_CONSECUTIVE_MISSES = 30;

  const vaults: DiscoveredVault[] = [];
  let consecutiveMisses = 0;
  let vaultId = 0;

  while (vaultId <= MAX_ID && consecutiveMisses < MAX_CONSECUTIVE_MISSES) {
    const batchEnd = Math.min(vaultId + BATCH, MAX_ID + 1);
    const batchIds = Array.from({ length: batchEnd - vaultId }, (_, i) => vaultId + i);

    const pdas = batchIds.map((vid) => deriveVaultConfigPDA(vid));

    let accounts: (import('@solana/web3.js').AccountInfo<Buffer> | null)[];
    try {
      accounts = await connection.getMultipleAccountsInfo(pdas);
    } catch (e) {
      console.error(`[vault-discovery] RPC error during batch ${vaultId}:`, e);
      vaultId = batchEnd;
      continue;
    }

    for (let i = 0; i < batchIds.length; i++) {
      const acct = accounts[i];
      if (!acct) {
        consecutiveMisses++;
        continue;
      }
      consecutiveMisses = 0;

      const vault = parseVaultConfig(batchIds[i], acct.data, pdas[i].toString());
      if (vault) {
        vaults.push(vault);
      }
    }

    vaultId = batchEnd;
  }

  console.log(`[vault-discovery] Discovered ${vaults.length} vaults`);
  vaultCache = vaults;
  vaultCacheTime = Date.now();
  return vaults;
}

/** Get a single vault by ID from cache (must call discoverAllVaults first). */
export function getDiscoveredVault(vaultId: number): DiscoveredVault | undefined {
  return vaultCache?.find((v) => v.id === vaultId);
}

/** Clear the vault cache (for testing or forced refresh). */
export function clearVaultCache(): void {
  vaultCache = null;
  vaultCacheTime = null;
}
```

**Step 2: Verify build**

Run: `cd /home/ramu/Hachimedes && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add lib/vault-discovery.ts
git commit -m "feat: add dynamic vault discovery module (ported from Matsu)"
```

---

## Task 3: Multi-Format Oracle Reading — Update `lib/position.ts`

The current `readPriceFromOracle` in `position.ts` only supports one oracle format (Jupiter Lend, offset 73, scale 1e8). Port the multi-format oracle parsing from Matsu's `juplend.py` lines 199-233 and 921-955.

**Files:**
- Modify: `lib/position.ts`

**Reference files:**
- Matsu source: `/home/ramu/matsu/backend/app/exchanges/juplend.py` lines 199-233 (`_read_oracle_price`), 921-955 (`_parse_oracle_data`)

**Step 1: Replace `readPriceFromOracle` with multi-format version**

In `lib/position.ts`, replace the `readPriceFromOracle` function (lines 24-68) with:

```typescript
async function readPriceFromOracle(
  connection: Connection,
  oracleAddress: string
): Promise<number | null> {
  try {
    const oracleAccount = await connection.getAccountInfo(new PublicKey(oracleAddress));
    if (!oracleAccount) return null;

    const data = oracleAccount.data;

    // Oracle wrapper (disc 8bc283b38cb3e5f4): resolve inner oracle
    const ORACLE_WRAPPER_DISC = Buffer.from('8bc283b38cb3e5f4', 'hex');
    if (data.length >= 46 && data.subarray(0, 8).equals(ORACLE_WRAPPER_DISC)) {
      const innerOracleAddress = new PublicKey(data.subarray(14, 46)).toString();
      console.log(`[oracle] Wrapper detected, resolving inner oracle: ${innerOracleAddress.slice(0, 8)}...`);
      return readPriceFromOracle(connection, innerOracleAddress);
    }

    // Pyth V2 format (large account ~3312 bytes)
    if (data.length > 1000) {
      if (data.length >= 216) {
        const expo = data.readInt32LE(20);
        const rawPrice = data.readBigInt64LE(208);
        const price = Number(rawPrice) * Math.pow(10, expo);
        return price > 0 ? price : null;
      }
      return null;
    }

    // jup3 oracle format (196 bytes, disc 87c75210f983b6f1)
    const JUP3_ORACLE_DISC = Buffer.from('87c75210f983b6f1', 'hex');
    if (data.length >= 115 && data.subarray(0, 8).equals(JUP3_ORACLE_DISC)) {
      const rawPrice = data.readBigUInt64LE(107);
      const price = Number(rawPrice) / 1e12;
      return price > 0 ? price : null;
    }

    // Jupiter Lend oracle format (small account ~134 bytes)
    const PRICE_OFFSET = 73;
    const PRICE_SCALE = 1e8;
    if (data.length >= PRICE_OFFSET + 8) {
      const rawPrice = data.readBigUInt64LE(PRICE_OFFSET);
      const price = Number(rawPrice) / PRICE_SCALE;
      return price > 0 && isFinite(price) ? price : null;
    }

    return null;
  } catch (error) {
    console.error('Error reading oracle price:', error);
    return null;
  }
}
```

**Step 2: Verify build**

Run: `cd /home/ramu/Hachimedes && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add lib/position.ts
git commit -m "feat: support multi-format oracle reading (Pyth V2, jup3, wrapper)"
```

---

## Task 4: Update `lib/vaults.ts` — Bridge to Dynamic Discovery

Make `getAvailableVaults()` return discovered vaults while maintaining the existing `VaultConfig` interface. Keep hardcoded vaults as fallback.

**Files:**
- Modify: `lib/vaults.ts`

**Step 1: Rewrite vaults.ts to bridge static and dynamic**

Replace the entire `lib/vaults.ts` content with:

```typescript
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
```

Note: `VaultConfig` interface gains `collateralMint`, `debtMint`, `collateralDecimals`, `debtDecimals` fields. Check all callers of `getVaultConfig()` — they should work fine because old fields (`collateralToken`, `debtToken`, `maxLtv`, `liquidationLtv`, `oracleAddress`) are preserved.

**Step 2: Fix any import issues in callers**

The callers that use `TOKENS[vaultConfig.collateralToken]` (e.g. `PositionManageDialog.tsx` line 77) still work because `collateralToken` is still a symbol string like `'JLP'`. For new vaults with tokens not in `TOKENS`, callers should fall back to the mint/decimals from `VaultConfig` directly. But this can be addressed in the UI task (Task 7).

**Step 3: Verify build**

Run: `cd /home/ramu/Hachimedes && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add lib/vaults.ts
git commit -m "feat: bridge vaults.ts to dynamic discovery with fallback"
```

---

## Task 5: Parameterize Flash Loan Builders — Remove Hardcoded Decimals

All four flash loan files use `1e6` hardcoded for amount conversion. Replace with dynamic decimals from the vault config.

**Files:**
- Modify: `lib/leverage-flashloan-swap.ts`
- Modify: `lib/deleverage-flashloan-swap.ts`
- Modify: `lib/leverage-jito-bundle.ts`
- Modify: `lib/deleverage-jito-bundle.ts`

**Step 1: Add `debtDecimals` and `collateralDecimals` params**

In each file's params interface, add:

```typescript
debtDecimals?: number;       // Debt token decimals, default 6
collateralDecimals?: number; // Collateral token decimals, default 6
```

**Step 2: Replace all `1e6` with dynamic scale**

In each file's build function, after destructuring params, add:

```typescript
const debtScale = Math.pow(10, debtDecimals ?? 6);
const collateralScale = Math.pow(10, collateralDecimals ?? 6);
```

Then replace:
- `leverage-flashloan-swap.ts`:
  - Line 66: `flashLoanAmount * 1e6` → `flashLoanAmount * debtScale` (flash loan borrows debt)
  - Line 125-128: `/ 1e6` in log lines → `/ debtScale` and `/ collateralScale`
  - Line 189: `/ 1e6` → `/ collateralScale` (swap output is collateral)
  - Line 190: `/ 1e6` → `/ collateralScale`
  - Line 212: `* 1e6` → `* debtScale` (borrow amount)
  - Line 246: `/ 1e6` → `/ collateralScale` and `/ debtScale`

- `deleverage-flashloan-swap.ts`:
  - Line 66: `flashLoanAmount * 1e6` → `flashLoanAmount * collateralScale` (flash loan borrows collateral)
  - Line 125: `/ 1e6` → `/ collateralScale`
  - Line 126: `/ 1e6` → `/ debtScale`
  - Line 216: `/ 1e6` → `/ debtScale` (swap output is debt)
  - Line 236: `* 1e6` → `* debtScale` (repay amount)
  - Line 265-269: `/ 1e6` → appropriate scale

- `leverage-jito-bundle.ts`:
  - Line 58: `borrowAmount * 1e6` → `borrowAmount * debtScale`
  - All `/ 1e6` log lines → appropriate scale

- `deleverage-jito-bundle.ts`:
  - Line 58: `withdrawAmount * 1e6` → `withdrawAmount * collateralScale`
  - All `/ 1e6` log lines → appropriate scale

**Step 3: Generalize safe amount rounding**

The safe amount rounding logic (3/5/8) is specific to 6-decimal stablecoins. For other tokens, skip the rounding and just use floor/ceil:

In `leverage-flashloan-swap.ts`, replace lines 196-210 with:

```typescript
let safeBorrowAmount: number;
if (debtScale === 1e6) {
  // 6-decimal stablecoins: use known safe amounts
  if (flashLoanAmount >= 8) {
    safeBorrowAmount = Math.ceil(flashLoanAmount);
  } else if (flashLoanAmount >= 5) {
    safeBorrowAmount = 8;
  } else if (flashLoanAmount >= 3) {
    safeBorrowAmount = 5;
  } else {
    safeBorrowAmount = 3;
  }
} else {
  // Other tokens: just ceil
  safeBorrowAmount = Math.ceil(flashLoanAmount);
}
const borrowAmountRaw = Math.floor(safeBorrowAmount * debtScale);
```

Apply similar pattern to `deleverage-flashloan-swap.ts` lines 219-234 (using floor instead of ceil).

**Step 4: Verify build**

Run: `cd /home/ramu/Hachimedes && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add lib/leverage-flashloan-swap.ts lib/deleverage-flashloan-swap.ts lib/leverage-jito-bundle.ts lib/deleverage-jito-bundle.ts
git commit -m "feat: parameterize flash loan builders with dynamic token decimals"
```

---

## Task 6: Rebalance Transaction Builder — Create `lib/rebalance.ts`

Build transactions that withdraw collateral from one vault and deposit into another.

**Files:**
- Create: `lib/rebalance.ts`

**Step 1: Create the rebalance module**

```typescript
// lib/rebalance.ts
import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getOperateIx } from '@jup-ag/lend/borrow';
import BN from 'bn.js';

export interface RebalanceParams {
  sourceVaultId: number;
  sourcePositionId: number;
  targetVaultId: number;
  targetPositionId: number;
  collateralAmount: number;       // UI amount to move
  collateralDecimals: number;     // Token decimals (e.g. 6 for JLP)
  userPublicKey: PublicKey;
  connection: Connection;
}

export interface RebalanceResult {
  transactions: VersionedTransaction[];  // 1 or 2 TXs
  mode: 'single' | 'jito-bundle';
}

/**
 * Build rebalance transaction(s): withdraw from source vault, deposit into target vault.
 * Tries single TX first; if too large, returns 2 TXs for Jito Bundle.
 */
export async function buildRebalanceTransaction(params: RebalanceParams): Promise<RebalanceResult> {
  const {
    sourceVaultId, sourcePositionId,
    targetVaultId, targetPositionId,
    collateralAmount, collateralDecimals,
    userPublicKey, connection,
  } = params;

  const scale = Math.pow(10, collateralDecimals);
  const amountRaw = Math.floor(collateralAmount * scale);

  console.log('\n════════════════════════════════════════');
  console.log('  Cross-Vault Collateral Rebalance');
  console.log('════════════════════════════════════════');
  console.log(`Source: vault ${sourceVaultId}, position ${sourcePositionId}`);
  console.log(`Target: vault ${targetVaultId}, position ${targetPositionId}`);
  console.log(`Amount: ${collateralAmount} (raw: ${amountRaw})`);

  // Step 1: Build withdraw instruction (source vault)
  const withdrawResult = await getOperateIx({
    vaultId: sourceVaultId,
    positionId: sourcePositionId,
    colAmount: new BN(-amountRaw),  // negative = withdraw
    debtAmount: new BN(0),          // no debt change
    connection,
    signer: userPublicKey,
    recipient: userPublicKey,
    positionOwner: userPublicKey,
  });

  // Step 2: Build deposit instruction (target vault)
  const depositResult = await getOperateIx({
    vaultId: targetVaultId,
    positionId: targetPositionId,
    colAmount: new BN(amountRaw),   // positive = deposit
    debtAmount: new BN(0),          // no debt change
    connection,
    signer: userPublicKey,
    recipient: userPublicKey,
    positionOwner: userPublicKey,
  });

  // Collect all address lookup tables
  const seenKeys = new Set<string>();
  const allLuts: any[] = [];
  for (const lut of [...(withdrawResult.addressLookupTableAccounts ?? []), ...(depositResult.addressLookupTableAccounts ?? [])]) {
    const key = lut.key.toString();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      allLuts.push(lut);
    }
  }

  // Try single transaction
  const allInstructions: TransactionInstruction[] = [
    ...withdrawResult.ixs,
    ...depositResult.ixs,
  ];

  const latestBlockhash = await connection.getLatestBlockhash('finalized');

  try {
    const message = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: allInstructions,
    }).compileToV0Message(allLuts);

    const tx = new VersionedTransaction(message);
    const serialized = tx.serialize();

    if (serialized.length <= 1232) {
      console.log(`✅ Single transaction: ${serialized.length} bytes`);
      return { transactions: [tx], mode: 'single' };
    }
    console.log(`⚠️ Single TX too large: ${serialized.length} bytes, falling back to Jito Bundle`);
  } catch {
    console.log('⚠️ Single TX failed to serialize, falling back to Jito Bundle');
  }

  // Fallback: two transactions for Jito Bundle
  const { createJitoTipInstruction } = await import('./jito-bundle');
  const tipIx = createJitoTipInstruction(userPublicKey, 10000);

  const tx1Message = new TransactionMessage({
    payerKey: userPublicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: withdrawResult.ixs,
  }).compileToV0Message(withdrawResult.addressLookupTableAccounts ?? []);

  const tx2Message = new TransactionMessage({
    payerKey: userPublicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [...depositResult.ixs, tipIx],
  }).compileToV0Message(depositResult.addressLookupTableAccounts ?? []);

  const tx1 = new VersionedTransaction(tx1Message);
  const tx2 = new VersionedTransaction(tx2Message);

  console.log('✅ Jito Bundle: 2 transactions built');
  return { transactions: [tx1, tx2], mode: 'jito-bundle' };
}
```

**Step 2: Verify build**

Run: `cd /home/ramu/Hachimedes && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add lib/rebalance.ts
git commit -m "feat: add cross-vault collateral rebalance transaction builder"
```

---

## Task 7: UI — Vault Discovery + Dynamic Selector in FlashLoanInterface

Wire up vault discovery on page load and update the vault selector to show all discovered vaults.

**Files:**
- Modify: `components/FlashLoanInterface.tsx`

**Reference:** Current vault selector is at lines 720-731 of FlashLoanInterface.tsx.

**Step 1: Add imports and discovery state**

At the top of `FlashLoanInterface.tsx`, add imports:

```typescript
import { discoverAllVaults, DiscoveredVault } from '@/lib/vault-discovery';
import { setDiscoveredVaults } from '@/lib/vaults';
```

Add state variables (near the existing vault state at line ~49):

```typescript
const [discoveredVaults, setDiscoveredVaultsState] = useState<DiscoveredVault[]>([]);
const [isDiscoveringVaults, setIsDiscoveringVaults] = useState(false);
```

**Step 2: Add discovery useEffect**

Add a useEffect that runs vault discovery when wallet connects:

```typescript
useEffect(() => {
  if (!connection) return;
  let cancelled = false;

  async function discover() {
    setIsDiscoveringVaults(true);
    try {
      const vaults = await discoverAllVaults(connection);
      if (!cancelled) {
        setDiscoveredVaultsState(vaults);
        setDiscoveredVaults(vaults); // update the vaults.ts bridge
      }
    } catch (e) {
      console.error('[vault-discovery] Failed:', e);
    } finally {
      if (!cancelled) setIsDiscoveringVaults(false);
    }
  }

  discover();
  return () => { cancelled = true; };
}, [connection]);
```

**Step 3: Update vault selector to use discovered vaults**

Replace the existing vault `<Select>` (lines 720-731) with one that shows discovered vaults grouped by collateral token. Use `getAvailableVaults()` which now returns dynamic data:

```typescript
<Select value={vaultId.toString()} onValueChange={(val) => setVaultId(parseInt(val))}>
  <SelectTrigger className="w-auto bg-slate-900/70 border-slate-700 text-sm">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {isDiscoveringVaults ? (
      <SelectItem value={vaultId.toString()} disabled>
        <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
        Discovering vaults...
      </SelectItem>
    ) : (
      getAvailableVaults().map((vault) => (
        <SelectItem key={vault.id} value={vault.id.toString()}>
          {vault.name} (#{vault.id})
        </SelectItem>
      ))
    )}
  </SelectContent>
</Select>
```

**Step 4: Pass decimals to flash loan builders**

In the `handleExecuteFlashLoan` handler (line ~319), when calling the build functions, pass the vault's decimal info:

```typescript
const vaultConfig = getVaultConfig(vaultId);

// When calling buildLeverageFlashLoanSwap / buildDeleverageFlashLoanSwap:
{
  ...existingParams,
  debtDecimals: vaultConfig.debtDecimals,
  collateralDecimals: vaultConfig.collateralDecimals,
}
```

Also update the `collateralMint` and `debtMint` params to use `vaultConfig.collateralMint` and `vaultConfig.debtMint` instead of looking up from the `TOKENS` constant:

```typescript
collateralMint: new PublicKey(vaultConfig.collateralMint),
debtMint: new PublicKey(vaultConfig.debtMint),
```

**Step 5: Update preview calculations to use dynamic decimals**

In the `previewData` useMemo and `maxAmount` calculation, replace any hardcoded `1e6` with `Math.pow(10, vaultConfig.debtDecimals)` or `Math.pow(10, vaultConfig.collateralDecimals)` as appropriate.

**Step 6: Verify build**

Run: `cd /home/ramu/Hachimedes && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add components/FlashLoanInterface.tsx
git commit -m "feat: dynamic vault discovery and selector in UI"
```

---

## Task 8: UI — Rebalance Tab and Dialog

Add a rebalance operation alongside the existing leverage/deleverage in FlashLoanInterface.

**Files:**
- Modify: `components/FlashLoanInterface.tsx`

**Step 1: Add rebalance state**

```typescript
const [rebalanceSourceVaultId, setRebalanceSourceVaultId] = useState<number | null>(null);
const [rebalanceTargetVaultId, setRebalanceTargetVaultId] = useState<number | null>(null);
const [rebalanceAmount, setRebalanceAmount] = useState('');
const [rebalanceSourcePosition, setRebalanceSourcePosition] = useState<PositionInfo | null>(null);
const [rebalanceTargetPosition, setRebalanceTargetPosition] = useState<PositionInfo | null>(null);
```

**Step 2: Add operation type**

Extend the operationType to include `'rebalance'`:

```typescript
const [operationType, setOperationType] = useState<'deleverageSwap' | 'leverageSwap' | 'rebalance'>('deleverageSwap');
```

Add a third button in the operation type selector (next to existing Deleverage/Leverage buttons at lines 924-963):

```typescript
<Button
  variant={operationType === 'rebalance' ? 'default' : 'outline'}
  onClick={() => setOperationType('rebalance')}
  className={operationType === 'rebalance' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
>
  <ArrowRightLeft className="h-4 w-4 mr-1" />
  Rebalance
</Button>
```

**Step 3: Add rebalance panel content**

When `operationType === 'rebalance'`, show a different right-panel content:
- Source vault selector (dropdown filtered to vaults where user has a position with same collateral as current vault)
- Target vault selector (same filter)
- Amount input
- LTV preview for both vaults (before → after)
- Execute button

The filtering logic: group `discoveredVaults` by `collateralMint`, then for each group show only vaults where the user has a position. The user must have loaded positions for this to work (use existing `userPositions` state or load on demand).

**Step 4: Add rebalance handler**

```typescript
import { buildRebalanceTransaction } from '@/lib/rebalance';
import { sendJitoBundle } from '@/lib/jito-bundle';

async function handleRebalance() {
  if (!publicKey || !signTransaction || !rebalanceSourceVaultId || !rebalanceTargetVaultId) return;

  setIsLoading(true);
  try {
    const amount = parseFloat(rebalanceAmount);
    if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');

    const sourceConfig = getVaultConfig(rebalanceSourceVaultId);

    const result = await buildRebalanceTransaction({
      sourceVaultId: rebalanceSourceVaultId,
      sourcePositionId: /* from loaded position */,
      targetVaultId: rebalanceTargetVaultId,
      targetPositionId: /* from loaded position */,
      collateralAmount: amount,
      collateralDecimals: sourceConfig.collateralDecimals,
      userPublicKey: publicKey,
      connection,
    });

    if (result.mode === 'single') {
      const signed = await signTransaction(result.transactions[0]);
      const sig = await connection.sendRawTransaction(signed.serialize());
      // confirm and show success
    } else {
      // Jito Bundle: sign both, send as bundle
      const signed = [];
      for (const tx of result.transactions) {
        signed.push(await signTransaction(tx));
      }
      await sendJitoBundle(signed);
      // show success
    }

    toast({ title: 'Rebalance successful' });
  } catch (e: any) {
    toast({ title: 'Rebalance failed', description: e.message, variant: 'destructive' });
  } finally {
    setIsLoading(false);
  }
}
```

**Step 5: Add LTV preview for rebalance**

Calculate and display:
```typescript
const rebalancePreview = useMemo(() => {
  if (!rebalanceSourcePosition || !rebalanceTargetPosition || !rebalanceAmount) return null;
  const amount = parseFloat(rebalanceAmount);
  if (isNaN(amount) || amount <= 0) return null;

  const sourcePrice = rebalanceSourcePosition.oraclePrice ?? 0;
  const targetPrice = rebalanceTargetPosition.oraclePrice ?? 0;
  if (!sourcePrice || !targetPrice) return null;

  const sourceNewCol = rebalanceSourcePosition.collateralAmountUi - amount;
  const targetNewCol = rebalanceTargetPosition.collateralAmountUi + amount;

  const sourceLtv = sourceNewCol > 0
    ? (rebalanceSourcePosition.debtAmountUi / (sourceNewCol * sourcePrice)) * 100
    : Infinity;
  const targetLtv = targetNewCol > 0
    ? (rebalanceTargetPosition.debtAmountUi / (targetNewCol * targetPrice)) * 100
    : 0;

  return { sourceLtv, targetLtv, sourceNewCol, targetNewCol };
}, [rebalanceSourcePosition, rebalanceTargetPosition, rebalanceAmount]);
```

**Step 6: Verify build and test locally**

Run: `cd /home/ramu/Hachimedes && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

Run: `cd /home/ramu/Hachimedes && npm run dev`
Test: Open browser, connect wallet, verify vault selector shows all discovered vaults, verify rebalance tab appears.

**Step 7: Commit**

```bash
git add components/FlashLoanInterface.tsx
git commit -m "feat: add rebalance UI tab with LTV preview"
```

---

## Task 9: Multi-Vault Position Discovery

Currently `findUserPositionsByNFT` in `lib/find-positions-nft.ts` searches one vault at a time. For the rebalance feature, we need positions across multiple vaults. The existing function already takes a `vaultId` parameter, so the simplest approach is to call it for each vault.

**Files:**
- Modify: `components/FlashLoanInterface.tsx` (the position loading logic)

**Step 1: Add multi-vault position loading**

When the rebalance tab is selected, load positions for all same-collateral vaults:

```typescript
// In FlashLoanInterface, add state:
const [allPositions, setAllPositions] = useState<Record<number, PositionInfo | null>>({});

// Add loader function:
async function loadAllSameCollateralPositions(collateralMint: string) {
  const sameColVaults = discoveredVaults.filter(v => v.collateralMint === collateralMint);
  const results: Record<number, PositionInfo | null> = {};

  for (const vault of sameColVaults) {
    try {
      const positions = await findUserPositionsByNFT(connection, vault.id, publicKey!, 100000);
      if (positions.length > 0) {
        const info = await fetchPositionInfo(connection, vault.id, positions[0], publicKey!);
        results[vault.id] = info;
      }
    } catch {
      // skip
    }
  }
  setAllPositions(results);
}
```

**Step 2: Wire into rebalance tab activation**

When user switches to rebalance tab, trigger position loading for all same-collateral vaults.

**Step 3: Commit**

```bash
git add components/FlashLoanInterface.tsx
git commit -m "feat: multi-vault position discovery for rebalance"
```

---

## Task 10: Update PositionManageDialog for Dynamic Vaults

The dialog uses `TOKENS[vaultConfig.collateralToken]` which works for known tokens but may fail for new ones.

**Files:**
- Modify: `components/PositionManageDialog.tsx`

**Step 1: Add fallback for unknown tokens**

Where the dialog does `TOKENS[vaultConfig.collateralToken]`, add a fallback:

```typescript
const vaultConfig = getVaultConfig(vaultId);
const collateralToken = TOKENS[vaultConfig.collateralToken] ?? {
  symbol: vaultConfig.collateralToken,
  name: vaultConfig.collateralToken,
  mint: vaultConfig.collateralMint,
  decimals: vaultConfig.collateralDecimals,
};
const debtToken = TOKENS[vaultConfig.debtToken] ?? {
  symbol: vaultConfig.debtToken,
  name: vaultConfig.debtToken,
  mint: vaultConfig.debtMint,
  decimals: vaultConfig.debtDecimals,
};
```

Also replace any `1e6` in the dialog's amount conversion with `Math.pow(10, token.decimals)`.

**Step 2: Verify build**

Run: `cd /home/ramu/Hachimedes && npx next build --no-lint 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add components/PositionManageDialog.tsx
git commit -m "feat: handle dynamic vault tokens in PositionManageDialog"
```

---

## Task Dependency Summary

```
Task 1 (constants) ─┐
                     ├─→ Task 2 (vault-discovery) ─┐
Task 3 (oracle)  ───┘                               ├─→ Task 4 (vaults.ts bridge)
                                                     │
                     Task 5 (flash loan params) ─────┤
                     Task 6 (rebalance.ts) ──────────┤
                                                     │
                     ├─→ Task 7 (UI: vault selector) ─┤
                     ├─→ Task 8 (UI: rebalance tab)  ─┤
                     ├─→ Task 9 (multi-vault positions)┤
                     └─→ Task 10 (dialog fix) ─────────┘
```

Tasks 1-3 can run in parallel. Tasks 5-6 can run in parallel. Tasks 7-10 depend on 1-6 being complete.
