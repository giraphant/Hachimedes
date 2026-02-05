import { Connection, PublicKey } from '@solana/web3.js';
import { KNOWN_MINTS } from './constants';

const VAULTS_PROGRAM_ID = 'jupr81YtYssSyPt8jbnGuiWon5f6x9TcDEFxYe3Bdzi';

// vault_config parsing offsets (from Matsu juplend.py)
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

const LS_KEY = 'hachimedes_discovered_vaults';
const LS_TIME_KEY = 'hachimedes_discovered_vaults_time';

/** Try to load vaults from localStorage */
function loadFromLocalStorage(): DiscoveredVault[] | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(LS_KEY);
    const time = localStorage.getItem(LS_TIME_KEY);
    if (!raw || !time) return null;
    const age = Date.now() - parseInt(time);
    if (age > CACHE_TTL) return null; // expired
    const vaults = JSON.parse(raw) as DiscoveredVault[];
    if (!Array.isArray(vaults) || vaults.length === 0) return null;
    return vaults;
  } catch {
    return null;
  }
}

/** Save vaults to localStorage */
function saveToLocalStorage(vaults: DiscoveredVault[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LS_KEY, JSON.stringify(vaults));
    localStorage.setItem(LS_TIME_KEY, Date.now().toString());
  } catch {
    // quota exceeded or private browsing — ignore
  }
}

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
 *
 * Caching strategy (stale-while-revalidate):
 * 1. Memory cache (fastest) — survives within same page session
 * 2. localStorage cache (fast) — survives page reload, 1h TTL
 * 3. On-chain scan (slow, ~20 RPC calls) — refreshes both caches
 *
 * If localStorage has valid data, returns it immediately and
 * triggers a background refresh. This means the UI opens instantly
 * with cached vaults, then silently updates if anything changed.
 */
export async function discoverAllVaults(
  connection: Connection,
  forceRefresh = false,
): Promise<DiscoveredVault[]> {
  // 1. Memory cache hit
  const now = Date.now();
  if (!forceRefresh && vaultCache && vaultCacheTime && (now - vaultCacheTime) < CACHE_TTL) {
    return vaultCache;
  }

  // 2. localStorage cache hit — populate memory cache immediately
  if (!forceRefresh) {
    const lsVaults = loadFromLocalStorage();
    if (lsVaults) {
      console.log(`[vault-discovery] Loaded ${lsVaults.length} vaults from localStorage cache`);
      vaultCache = lsVaults;
      vaultCacheTime = now;
      // Schedule background refresh (don't await, notify listeners)
      scanOnChain(connection).then((fresh) => {
        for (const cb of refreshListeners) cb(fresh);
      }).catch(() => {});
      return lsVaults;
    }
  }

  // 3. Full on-chain scan
  return scanOnChain(connection);
}

/** Perform the actual on-chain vault scan */
async function scanOnChain(connection: Connection): Promise<DiscoveredVault[]> {
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

  console.log(`[vault-discovery] Scanned on-chain: ${vaults.length} vaults`);
  vaultCache = vaults;
  vaultCacheTime = Date.now();
  saveToLocalStorage(vaults);
  return vaults;
}

// Listeners for background refresh completion
const refreshListeners: ((vaults: DiscoveredVault[]) => void)[] = [];

/** Register a callback for when background refresh completes. Returns unsubscribe function. */
export function onVaultsRefreshed(cb: (vaults: DiscoveredVault[]) => void): () => void {
  refreshListeners.push(cb);
  return () => {
    const idx = refreshListeners.indexOf(cb);
    if (idx >= 0) refreshListeners.splice(idx, 1);
  };
}

/** Get a single vault by ID from cache (must call discoverAllVaults first). */
export function getDiscoveredVault(vaultId: number): DiscoveredVault | undefined {
  return vaultCache?.find((v) => v.id === vaultId);
}

/** Clear the vault cache (for testing or forced refresh). */
export function clearVaultCache(): void {
  vaultCache = null;
  vaultCacheTime = null;
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_TIME_KEY);
    }
  } catch {}
}
