'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletButton } from '@/components/WalletButton';
import { Card, CardContent } from '@/components/ui/card';
import { Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getVaultConfig, setDiscoveredVaults, DEFAULT_VAULT_ID } from '@/lib/vaults';
import { discoverAllVaults, onVaultsRefreshed, DiscoveredVault } from '@/lib/vault-discovery';
import { fetchPositionInfo, PositionInfo } from '@/lib/position';
import {
  loadPositionCache,
  savePositionCache,
  mergePositionCache,
  removeFromCache,
  formatCacheAge,
  CachedPosition,
} from '@/lib/position-cache';
import { PositionList } from './position/PositionList';
import { OperationTabs } from './operations/OperationTabs';
import { PositionManageDialog } from './PositionManageDialog';

interface PositionEntry {
  position: PositionInfo;
  vaultConfig: ReturnType<typeof getVaultConfig>;
}

export function FlashLoanInterface() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();

  // Vault discovery
  const [discoveredVaults, setDiscoveredVaultsState] = useState<DiscoveredVault[]>([]);

  // All user positions across all vaults
  const [positions, setPositions] = useState<PositionEntry[]>([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);
  const [isFinding, setIsFinding] = useState(false);
  const [isBackgroundScanning, setIsBackgroundScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<number | null>(null);

  // Selected position
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedEntry = positions.find(
    (p) => `${p.vaultConfig.id}-${p.position.positionId}` === selectedKey
  );

  // Manage dialog
  const [manageDialog, setManageDialog] = useState<{
    open: boolean;
    type: 'collateral' | 'debt';
    vaultId: number;
    positionId: number;
    positionInfo: PositionInfo;
  } | null>(null);

  // Preview from operation panels
  const [preview, setPreview] = useState<{ ltv?: number; collateral?: number; debt?: number } | null>(null);

  // Track if background scan already ran this session
  const bgScanDone = useRef(false);

  // Discover vaults on mount
  useEffect(() => {
    if (!connection) return;
    let cancelled = false;

    async function discover() {
      try {
        const vaults = await discoverAllVaults(connection);
        if (!cancelled) {
          setDiscoveredVaultsState(vaults);
          setDiscoveredVaults(vaults);
        }
      } catch (e) {
        console.error('[vault-discovery] Failed:', e);
      }
    }

    discover();

    const unsub = onVaultsRefreshed((freshVaults) => {
      if (!cancelled) {
        setDiscoveredVaultsState(freshVaults);
        setDiscoveredVaults(freshVaults);
      }
    });

    return () => { cancelled = true; unsub(); };
  }, [connection]);

  // Layer 1: Load from cache (instant) — uses cached position IDs to fetch live data
  const loadFromCache = useCallback(async () => {
    if (!publicKey) return false;
    const wallet = publicKey.toString();
    const cache = loadPositionCache(wallet);
    if (!cache || cache.positions.length === 0) return false;

    setIsLoadingPositions(true);
    setLastScanned(cache.lastScanned);

    try {
      const entries: PositionEntry[] = [];

      await Promise.all(
        cache.positions.map(async (cached) => {
          try {
            const info = await fetchPositionInfo(connection, cached.vaultId, cached.positionId, publicKey);
            if (info && (info.collateralAmountUi > 0 || info.debtAmountUi > 0)) {
              entries.push({ position: info, vaultConfig: getVaultConfig(cached.vaultId) });
            } else if (info && info.collateralAmountUi === 0 && info.debtAmountUi === 0) {
              // Position is empty, remove from cache
              removeFromCache(wallet, cached.vaultId, cached.positionId);
            }
          } catch {
            // Position might no longer exist, keep in cache for now
          }
        })
      );

      setPositions(entries);
      if (entries.length > 0) {
        setSelectedKey((prev) => prev ?? `${entries[0].vaultConfig.id}-${entries[0].position.positionId}`);
      }
      return entries.length > 0;
    } catch {
      return false;
    } finally {
      setIsLoadingPositions(false);
    }
  }, [publicKey, connection]);

  // Layer 2: Background full scan — discovers new positions, updates cache
  const backgroundScan = useCallback(async () => {
    if (!publicKey || discoveredVaults.length === 0) return;

    setIsBackgroundScanning(true);
    try {
      const { findUserPositionsByNFT } = await import('@/lib/find-positions-nft');
      const wallet = publicKey.toString();
      const foundCached: CachedPosition[] = [];
      const newEntries: PositionEntry[] = [];

      for (const vault of discoveredVaults) {
        try {
          const positionIds = await findUserPositionsByNFT(connection, vault.id, publicKey);
          for (const pid of positionIds) {
            foundCached.push({ vaultId: vault.id, positionId: pid });
            // Check if we already have this position loaded
            const exists = positions.some(
              (p) => p.vaultConfig.id === vault.id && p.position.positionId === pid
            );
            if (!exists) {
              const info = await fetchPositionInfo(connection, vault.id, pid, publicKey);
              if (info && (info.collateralAmountUi > 0 || info.debtAmountUi > 0)) {
                newEntries.push({ position: info, vaultConfig: getVaultConfig(vault.id) });
              }
            }
          }
        } catch {
          // skip failed vaults
        }
      }

      // Update cache with all found positions
      if (foundCached.length > 0) {
        mergePositionCache(wallet, foundCached);
      }
      setLastScanned(Date.now());

      // Append any newly discovered positions
      if (newEntries.length > 0) {
        setPositions((prev) => {
          const merged = [...prev];
          for (const ne of newEntries) {
            const key = `${ne.vaultConfig.id}-${ne.position.positionId}`;
            if (!merged.some((p) => `${p.vaultConfig.id}-${p.position.positionId}` === key)) {
              merged.push(ne);
            }
          }
          return merged;
        });
        toast({
          title: '发现新仓位',
          description: `后台扫描发现 ${newEntries.length} 个新仓位`,
        });
      }
    } catch (error) {
      console.error('Background scan failed:', error);
    } finally {
      setIsBackgroundScanning(false);
    }
  }, [publicKey, discoveredVaults, connection, positions, toast]);

  // Layer 3: Manual full scan — user-initiated, force refresh everything
  const findPositions = useCallback(async () => {
    if (!publicKey || discoveredVaults.length === 0) return;

    setIsFinding(true);
    try {
      const { findUserPositionsByNFT } = await import('@/lib/find-positions-nft');
      const wallet = publicKey.toString();
      const entries: PositionEntry[] = [];
      const foundCached: CachedPosition[] = [];

      for (const vault of discoveredVaults) {
        try {
          const positionIds = await findUserPositionsByNFT(connection, vault.id, publicKey);
          for (const pid of positionIds) {
            foundCached.push({ vaultId: vault.id, positionId: pid });
            const info = await fetchPositionInfo(connection, vault.id, pid, publicKey);
            if (info && (info.collateralAmountUi > 0 || info.debtAmountUi > 0)) {
              entries.push({ position: info, vaultConfig: getVaultConfig(vault.id) });
            }
          }
        } catch {
          // skip failed vaults
        }
      }

      // Save full scan results to cache
      savePositionCache(wallet, foundCached);
      setLastScanned(Date.now());

      setPositions(entries);
      if (entries.length > 0 && !selectedKey) {
        setSelectedKey(`${entries[0].vaultConfig.id}-${entries[0].position.positionId}`);
      }

      toast({
        title: entries.length > 0 ? '扫描完成' : '未找到仓位',
        description: entries.length > 0
          ? `找到 ${entries.length} 个仓位，已更新缓存`
          : '请前往 JUP LEND 创建一个仓位',
      });
    } catch (error) {
      console.error('Failed to find positions:', error);
      toast({ title: '查找仓位失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' });
    } finally {
      setIsFinding(false);
    }
  }, [publicKey, discoveredVaults, connection, selectedKey, toast]);

  // Manual load a single position
  const handleManualLoad = useCallback(async (vaultId: number, positionId: number) => {
    if (!publicKey) return;
    setIsLoadingPositions(true);
    try {
      const info = await fetchPositionInfo(connection, vaultId, positionId, publicKey);
      if (info) {
        const vc = getVaultConfig(vaultId);
        const key = `${vaultId}-${positionId}`;
        setPositions((prev) => {
          const without = prev.filter((p) => `${p.vaultConfig.id}-${p.position.positionId}` !== key);
          return [...without, { position: info, vaultConfig: vc }];
        });
        setSelectedKey(key);
        // Also save to cache
        mergePositionCache(publicKey.toString(), [{ vaultId, positionId }]);
      }
    } catch (error) {
      toast({ title: '加载失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' });
    } finally {
      setIsLoadingPositions(false);
    }
  }, [publicKey, connection, toast]);

  // Refresh selected position
  const refreshSelected = useCallback(async () => {
    if (!selectedEntry || !publicKey) return;
    try {
      const info = await fetchPositionInfo(connection, selectedEntry.vaultConfig.id, selectedEntry.position.positionId, publicKey);
      if (info) {
        setPositions((prev) =>
          prev.map((p) =>
            p.vaultConfig.id === selectedEntry.vaultConfig.id && p.position.positionId === selectedEntry.position.positionId
              ? { ...p, position: info }
              : p
          )
        );
      }
    } catch { /* ignore */ }
  }, [selectedEntry, publicKey, connection]);

  // On wallet connect: Layer 1 (cache) → Layer 2 (background scan)
  useEffect(() => {
    if (!publicKey || discoveredVaults.length === 0) return;

    let cancelled = false;

    async function init() {
      // Layer 1: Try cache first
      const hadCache = await loadFromCache();

      if (cancelled) return;

      // Layer 2: Background scan (always, to discover new positions)
      if (!bgScanDone.current) {
        bgScanDone.current = true;
        if (!hadCache) {
          // No cache — do foreground full scan instead
          await findPositions();
        } else {
          // Had cache — scan in background
          backgroundScan();
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [publicKey, discoveredVaults.length]);

  // Clear state on disconnect
  useEffect(() => {
    if (!publicKey) {
      setPositions([]);
      setSelectedKey(null);
      setLastScanned(null);
      bgScanDone.current = false;
    }
  }, [publicKey]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-green-500" />
              <h1 className="text-2xl font-bold text-white">Hachimedes</h1>
            </div>
            <WalletButton />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {!publicKey ? (
          <div className="max-w-3xl mx-auto">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-12 text-center space-y-6">
                <div className="flex justify-center">
                  <Zap className="h-16 w-16 text-green-500" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold text-white">给我一个杠杆，我能撬动整个木星</h2>
                  <p className="text-slate-400 text-lg">一键闪电贷操作 · 单笔交易完成加/去杠杆 · 安全高效</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                    <div className="text-3xl mb-2">⚡</div>
                    <div className="font-semibold text-white mb-1">Flash Loan</div>
                    <div className="text-xs text-slate-400">零成本借贷</div>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                    <div className="text-3xl mb-2">🔄</div>
                    <div className="font-semibold text-white mb-1">自动 Swap</div>
                    <div className="text-xs text-slate-400">Jupiter 聚合</div>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                    <div className="text-3xl mb-2">🎯</div>
                    <div className="font-semibold text-white mb-1">一键完成</div>
                    <div className="text-xs text-slate-400">原子操作</div>
                  </div>
                </div>
                <div className="pt-6">
                  <p className="text-slate-500 mb-4">请先连接钱包开始使用</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Position List */}
              <PositionList
                positions={positions}
                selectedPositionKey={selectedKey}
                isLoading={isLoadingPositions}
                onSelectPosition={(vaultId, positionId) => setSelectedKey(`${vaultId}-${positionId}`)}
                onManageCollateral={(vaultId, positionId) => {
                  const entry = positions.find((p) => p.vaultConfig.id === vaultId && p.position.positionId === positionId);
                  if (entry) setManageDialog({ open: true, type: 'collateral', vaultId, positionId, positionInfo: entry.position });
                }}
                onManageDebt={(vaultId, positionId) => {
                  const entry = positions.find((p) => p.vaultConfig.id === vaultId && p.position.positionId === positionId);
                  if (entry) setManageDialog({ open: true, type: 'debt', vaultId, positionId, positionInfo: entry.position });
                }}
                onFindPositions={findPositions}
                isFinding={isFinding}
                onManualLoad={handleManualLoad}
                previewLtv={preview?.ltv}
                previewCollateral={preview?.collateral}
                previewDebt={preview?.debt}
                lastScanned={lastScanned}
                isBackgroundScanning={isBackgroundScanning}
              />

              {/* Right: Operation Tabs */}
              <OperationTabs
                positionInfo={selectedEntry?.position ?? null}
                vaultConfig={selectedEntry?.vaultConfig ?? getVaultConfig(DEFAULT_VAULT_ID)}
                selectedPositionId={selectedEntry?.position.positionId ?? null}
                discoveredVaults={discoveredVaults}
                onSuccess={refreshSelected}
                onPreviewChange={setPreview}
              />
            </div>
          </div>
        )}
      </div>

      {/* Position Manage Dialog */}
      {manageDialog && (
        <PositionManageDialog
          open={manageDialog.open}
          onOpenChange={(open) => { if (!open) setManageDialog(null); }}
          positionInfo={manageDialog.positionInfo}
          vaultId={manageDialog.vaultId}
          positionId={manageDialog.positionId}
          initialType={manageDialog.type}
          onSuccess={refreshSelected}
        />
      )}
    </div>
  );
}
