/**
 * 永久 Position ID 缓存
 *
 * Position ID 对一个钱包地址几乎永远不变，所以缓存是永久的。
 * 用户连接钱包后：
 *   1. 从缓存读 position IDs → 直接 fetchPositionInfo 拿实时数据（秒级）
 *   2. 后台做完整 NFT 扫描 → 更新缓存 + 发现新仓位
 */

const CACHE_KEY_PREFIX = 'hachimedes_positions_v2_';

export interface CachedPosition {
  vaultId: number;
  positionId: number;
}

interface PositionCacheData {
  positions: CachedPosition[];
  lastScanned: number; // timestamp ms
}

function getCacheKey(wallet: string): string {
  return `${CACHE_KEY_PREFIX}${wallet}`;
}

/** 读取缓存的 position IDs */
export function loadPositionCache(wallet: string): PositionCacheData | null {
  try {
    const raw = localStorage.getItem(getCacheKey(wallet));
    if (!raw) return null;
    const data: PositionCacheData = JSON.parse(raw);
    if (!data.positions || !Array.isArray(data.positions)) return null;
    return data;
  } catch {
    return null;
  }
}

/** 写入缓存 */
export function savePositionCache(wallet: string, positions: CachedPosition[]): void {
  try {
    const data: PositionCacheData = {
      positions,
      lastScanned: Date.now(),
    };
    localStorage.setItem(getCacheKey(wallet), JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

/** 追加新发现的 position（去重） */
export function mergePositionCache(wallet: string, newPositions: CachedPosition[]): void {
  const existing = loadPositionCache(wallet);
  const map = new Map<string, CachedPosition>();

  if (existing) {
    for (const p of existing.positions) {
      map.set(`${p.vaultId}-${p.positionId}`, p);
    }
  }
  for (const p of newPositions) {
    map.set(`${p.vaultId}-${p.positionId}`, p);
  }

  savePositionCache(wallet, Array.from(map.values()));
}

/** 从缓存中移除一个 position（例如已清空） */
export function removeFromCache(wallet: string, vaultId: number, positionId: number): void {
  const existing = loadPositionCache(wallet);
  if (!existing) return;
  const filtered = existing.positions.filter(
    (p) => !(p.vaultId === vaultId && p.positionId === positionId)
  );
  savePositionCache(wallet, filtered);
}

/** 格式化缓存年龄 */
export function formatCacheAge(lastScanned: number): string {
  const ageMs = Date.now() - lastScanned;
  const minutes = Math.floor(ageMs / (1000 * 60));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}
