'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Loader2, ArrowRightLeft, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PositionInfo, fetchPositionInfo } from '@/lib/position';
import { VaultConfig, getVaultConfig } from '@/lib/vaults';
import { DiscoveredVault } from '@/lib/vault-discovery';

interface RebalancePanelProps {
  discoveredVaults: DiscoveredVault[];
  currentVaultConfig: VaultConfig;
  onSuccess: () => void;
}

// Cache helpers
const getAllPositionsCacheKey = (wallet: string, collateralMint: string) =>
  `hachimedes_all_positions_${wallet}_${collateralMint}`;

export function RebalancePanel({ discoveredVaults, currentVaultConfig, onSuccess }: RebalancePanelProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();

  const [allPositions, setAllPositions] = useState<Record<number, PositionInfo | null>>({});
  const [isLoadingAllPositions, setIsLoadingAllPositions] = useState(false);
  const [positionCacheAge, setPositionCacheAge] = useState<number | null>(null);

  const [sourceVaultId, setSourceVaultId] = useState<number | null>(null);
  const [targetVaultId, setTargetVaultId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Available vaults with positions
  const rebalanceVaults = useMemo(() => {
    return Object.entries(allPositions)
      .filter(([, pos]) => pos !== null)
      .map(([vid, pos]) => ({ vaultId: parseInt(vid), position: pos! }));
  }, [allPositions]);

  // Auto-select source (lowest LTV) and target (highest LTV) when positions change
  useEffect(() => {
    if (rebalanceVaults.length < 2) return;
    const withLtv = rebalanceVaults.filter(v => v.position.ltv != null && v.position.debtAmountUi > 0);
    if (withLtv.length < 2) return;
    const sorted = [...withLtv].sort((a, b) => (a.position.ltv ?? 0) - (b.position.ltv ?? 0));
    const source = sorted[0]; // lowest LTV = healthiest
    const target = sorted[sorted.length - 1]; // highest LTV = most needy
    if (source.vaultId !== target.vaultId) {
      setSourceVaultId(source.vaultId);
      setTargetVaultId(target.vaultId);
    }
  }, [rebalanceVaults]);

  // Calculate optimal transfer amount that equalizes LTV between source and target
  const recommendedAmount = useMemo(() => {
    if (!sourceVaultId || !targetVaultId) return null;
    const sourcePos = allPositions[sourceVaultId];
    const targetPos = allPositions[targetVaultId];
    if (!sourcePos || !targetPos) return null;
    if (!sourcePos.oraclePrice || !targetPos.oraclePrice) return null;
    if (sourcePos.debtAmountUi <= 0 && targetPos.debtAmountUi <= 0) return null;

    const sourceDebtPrice = sourcePos.debtPrice ?? 1;
    const targetDebtPrice = targetPos.debtPrice ?? 1;

    // A = source debt value in collateral units
    // B = target debt value in collateral units
    const A = (sourcePos.debtAmountUi * sourceDebtPrice) / sourcePos.oraclePrice;
    const B = (targetPos.debtAmountUi * targetDebtPrice) / targetPos.oraclePrice;

    if (A + B === 0) return null;

    // Solve: A / (sourceCol - x) = B / (targetCol + x)
    // x = (B * sourceCol - A * targetCol) / (A + B)
    const x = (B * sourcePos.collateralAmountUi - A * targetPos.collateralAmountUi) / (A + B);

    if (x <= 0) return null; // source already needs more than target
    // Cap at 95% of source collateral to prevent over-withdrawal
    const maxSafe = sourcePos.collateralAmountUi * 0.95;
    const capped = Math.min(x, maxSafe);

    // Verify result won't exceed maxLtv
    const sourceConfig = getVaultConfig(sourceVaultId);
    const newSourceCol = sourcePos.collateralAmountUi - capped;
    if (newSourceCol > 0 && sourcePos.debtAmountUi > 0) {
      const newLtv = ((sourcePos.debtAmountUi * sourceDebtPrice) / (newSourceCol * sourcePos.oraclePrice)) * 100;
      if (newLtv > sourceConfig.maxLtv - 2) {
        // Too risky, reduce amount to stay 2% below maxLtv
        // newLtv = source.debt*debtPrice / ((source.col - x) * colPrice) * 100 = maxLtv - 2
        // x = source.col - source.debt*debtPrice / ((maxLtv-2)/100 * colPrice)
        const safeX = sourcePos.collateralAmountUi - (sourcePos.debtAmountUi * sourceDebtPrice) / ((sourceConfig.maxLtv - 2) / 100 * sourcePos.oraclePrice);
        if (safeX <= 0) return null;
        return Math.floor(safeX * 100) / 100; // round down to 2 decimals
      }
    }

    return Math.floor(capped * 100) / 100; // round down to 2 decimals
  }, [sourceVaultId, targetVaultId, allPositions]);

  // Load positions for same-collateral vaults
  const loadAllSameCollateralPositions = useCallback(async (collateralMint: string, forceRefresh = false) => {
    if (!publicKey) return;
    const sameColVaults = discoveredVaults.filter(v => v.collateralMint === collateralMint);

    // Try cache first
    if (!forceRefresh) {
      try {
        const key = getAllPositionsCacheKey(publicKey.toString(), collateralMint);
        const cached = localStorage.getItem(key);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.positions && Object.keys(data.positions).length > 0) {
            const ageMs = Date.now() - data.timestamp;
            setPositionCacheAge(ageMs);
            const results: Record<number, PositionInfo | null> = {};
            const loadPromises = Object.entries(data.positions).map(async ([vid, posData]: [string, any]) => {
              try {
                const info = await fetchPositionInfo(connection, parseInt(vid), posData.positionId, publicKey);
                if (info) results[parseInt(vid)] = info;
              } catch { /* skip */ }
            });
            await Promise.all(loadPromises);
            setAllPositions(results);
            setIsLoadingAllPositions(false);
            return;
          }
        }
      } catch { /* fall through to full scan */ }
    }

    setPositionCacheAge(null);
    setIsLoadingAllPositions(true);
    try {
      const { findUserPositionsByNFT } = await import('@/lib/find-positions-nft');
      const results: Record<number, PositionInfo | null> = {};
      const positionIdsCache: Record<number, { positionId: number }> = {};

      for (const vault of sameColVaults) {
        try {
          const positions = await findUserPositionsByNFT(connection, vault.id, publicKey);
          if (positions.length > 0) {
            const info = await fetchPositionInfo(connection, vault.id, positions[0], publicKey);
            results[vault.id] = info;
            positionIdsCache[vault.id] = { positionId: positions[0] };
          }
        } catch { /* skip */ }
      }

      setAllPositions(results);
      if (Object.keys(positionIdsCache).length > 0) {
        const key = getAllPositionsCacheKey(publicKey.toString(), collateralMint);
        localStorage.setItem(key, JSON.stringify({ positions: positionIdsCache, timestamp: Date.now() }));
      }
    } catch (e) {
      console.error('Failed to load positions:', e);
    } finally {
      setIsLoadingAllPositions(false);
    }
  }, [publicKey, discoveredVaults, connection]);

  // Load on mount
  useEffect(() => {
    if (publicKey && discoveredVaults.length > 0) {
      loadAllSameCollateralPositions(currentVaultConfig.collateralMint);
    }
  }, [publicKey, discoveredVaults.length, currentVaultConfig.collateralMint, loadAllSameCollateralPositions]);

  // Preview
  const rebalancePreview = useMemo(() => {
    if (!sourceVaultId || !targetVaultId || !amount) return null;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return null;

    const sourcePos = allPositions[sourceVaultId];
    const targetPos = allPositions[targetVaultId];
    if (!sourcePos || !targetPos) return null;

    const sourceColPrice = sourcePos.oraclePrice ?? 0;
    const targetColPrice = targetPos.oraclePrice ?? 0;
    if (!sourceColPrice || !targetColPrice) return null;

    const sourceDebtPrice = sourcePos.debtPrice;
    const targetDebtPrice = targetPos.debtPrice;
    if (sourcePos.debtAmountUi > 0 && !sourceDebtPrice) return null;
    if (targetPos.debtAmountUi > 0 && !targetDebtPrice) return null;

    const sourceNewCol = sourcePos.collateralAmountUi - amountNum;
    const targetNewCol = targetPos.collateralAmountUi + amountNum;

    const sourceLtv = sourceNewCol > 0 && sourcePos.debtAmountUi > 0 && sourceDebtPrice
      ? ((sourcePos.debtAmountUi * sourceDebtPrice) / (sourceNewCol * sourceColPrice)) * 100
      : sourceNewCol <= 0 ? Infinity : 0;
    const targetLtv = targetNewCol > 0 && targetPos.debtAmountUi > 0 && targetDebtPrice
      ? ((targetPos.debtAmountUi * targetDebtPrice) / (targetNewCol * targetColPrice)) * 100
      : 0;

    return { sourceLtv, targetLtv, sourceNewCol, targetNewCol };
  }, [allPositions, sourceVaultId, targetVaultId, amount]);

  // Execute
  const handleRebalance = useCallback(async () => {
    if (!publicKey || !signTransaction || !sourceVaultId || !targetVaultId) return;

    setIsLoading(true);
    try {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) throw new Error('Invalid amount');

      const sourcePos = allPositions[sourceVaultId];
      const targetPos = allPositions[targetVaultId];
      if (!sourcePos || !targetPos) throw new Error('Position not found');

      const sourceConfig = getVaultConfig(sourceVaultId);

      // Pre-check
      if (sourcePos.oraclePrice && sourcePos.debtPrice && sourcePos.debtAmountUi > 0) {
        const newCollateral = sourcePos.collateralAmountUi - amountNum;
        if (newCollateral <= 0) throw new Error(`Cannot withdraw ${amountNum}: exceeds available collateral (${sourcePos.collateralAmountUi.toFixed(4)})`);
        const debtValueUsd = sourcePos.debtAmountUi * sourcePos.debtPrice;
        const newCollateralValueUsd = newCollateral * sourcePos.oraclePrice;
        const newLtv = (debtValueUsd / newCollateralValueUsd) * 100;
        if (newLtv > sourceConfig.maxLtv) throw new Error(`Withdrawal would push source LTV to ${newLtv.toFixed(1)}%, exceeding max ${sourceConfig.maxLtv}%`);
      }

      const { buildRebalanceTransaction } = await import('@/lib/rebalance');
      const { sendJitoMultiTxBundle } = await import('@/lib/jito-bundle');

      const result = await buildRebalanceTransaction({
        sourceVaultId, sourcePositionId: sourcePos.positionId,
        targetVaultId, targetPositionId: targetPos.positionId,
        collateralAmount: amountNum, collateralDecimals: sourceConfig.collateralDecimals,
        userPublicKey: publicKey, connection,
      });

      if (result.mode === 'single') {
        toast({ title: '请在钱包中确认交易（原子操作）' });
        const signed = await signTransaction(result.transactions[0]);
        const sig = await connection.sendTransaction(signed, { skipPreflight: false, preflightCommitment: 'confirmed' });
        await connection.confirmTransaction(sig, 'confirmed');
        toast({ title: '再平衡成功！', description: `单笔原子交易: ${sig.slice(0, 8)}...` });
      } else {
        toast({ title: '请签名 2 个交易（Jito Bundle）' });
        const signed = [];
        for (const tx of result.transactions) signed.push(await signTransaction(tx));
        const bundleId = await sendJitoMultiTxBundle(connection, signed);
        toast({ title: '再平衡交易已发送', description: `Bundle: ${bundleId.slice(0, 8)}...` });
      }

      setAmount('');
      loadAllSameCollateralPositions(currentVaultConfig.collateralMint);
      onSuccess();
    } catch (e: any) {
      toast({ title: '再平衡失败', description: e.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, sourceVaultId, targetVaultId, amount, allPositions, currentVaultConfig, connection, toast, onSuccess, loadAllSameCollateralPositions]);

  return (
    <div className="space-y-4 p-4 rounded-lg bg-background/50 border border-border">
      {/* Cache age warning */}
      {positionCacheAge && positionCacheAge > 60 * 60 * 1000 && (
        <Alert variant="warning" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between text-xs">
            <span>仓位数据缓存于 {Math.floor(positionCacheAge / (1000 * 60 * 60))} 小时前</span>
            <button onClick={() => loadAllSameCollateralPositions(currentVaultConfig.collateralMint, true)} className="text-warning hover:text-warning/80 underline cursor-pointer ml-2">刷新</button>
          </AlertDescription>
        </Alert>
      )}

      {isLoadingAllPositions ? (
        <div className="space-y-3 py-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-2/3 mx-auto" />
          <p className="text-center text-xs text-muted-foreground">正在搜索同抵押品的池子...</p>
        </div>
      ) : rebalanceVaults.length < 2 ? (
        <div className="text-center py-4">
          <p className="text-muted-foreground text-sm">需要在至少 2 个同类池子中持有仓位</p>
          <p className="text-xs text-muted-foreground mt-1">已发现 {rebalanceVaults.length} 个 {currentVaultConfig.collateralToken} 池子</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Source */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">转出池（减少抵押品）</Label>
            <Select value={sourceVaultId?.toString() ?? ''} onValueChange={(val) => setSourceVaultId(parseInt(val))}>
              <SelectTrigger className="bg-secondary border-border text-sm"><SelectValue placeholder="选择来源池" /></SelectTrigger>
              <SelectContent>
                {rebalanceVaults.filter(v => v.vaultId !== targetVaultId).map(({ vaultId: vid, position: pos }) => {
                  const vc = getVaultConfig(vid);
                  return <SelectItem key={vid} value={vid.toString()}>{vc.name} (#{vid}) — LTV: {pos.ltv?.toFixed(1) ?? '?'}% — 抵押: {pos.collateralAmountUi.toFixed(2)}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Target */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">转入池（增加抵押品）</Label>
            <Select value={targetVaultId?.toString() ?? ''} onValueChange={(val) => setTargetVaultId(parseInt(val))}>
              <SelectTrigger className="bg-secondary border-border text-sm"><SelectValue placeholder="选择目标池" /></SelectTrigger>
              <SelectContent>
                {rebalanceVaults.filter(v => v.vaultId !== sourceVaultId).map(({ vaultId: vid, position: pos }) => {
                  const vc = getVaultConfig(vid);
                  return <SelectItem key={vid} value={vid.toString()}>{vc.name} (#{vid}) — LTV: {pos.ltv?.toFixed(1) ?? '?'}% — 抵押: {pos.collateralAmountUi.toFixed(2)}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground">转移数量</Label>
              {recommendedAmount != null && (
                <button
                  type="button"
                  onClick={() => setAmount(recommendedAmount.toString())}
                  className="flex items-center gap-1 text-xs text-rebalance hover:text-rebalance/80 transition-colors cursor-pointer"
                >
                  <Sparkles className="h-3 w-3" />
                  智能推荐: {recommendedAmount.toFixed(2)}
                </button>
              )}
            </div>
            <div className="relative">
              <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-background border-border text-foreground pr-16" step="0.01" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currentVaultConfig.collateralToken}</span>
            </div>
          </div>

          {/* Preview */}
          {rebalancePreview && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-secondary border border-border">
                <div className="text-xs text-muted-foreground mb-1">来源池 LTV 变化</div>
                <div className={`font-bold font-mono tabular-nums ${rebalancePreview.sourceLtv > 85 ? 'text-danger' : rebalancePreview.sourceLtv > 75 ? 'text-warning' : 'text-healthy'}`}>
                  {allPositions[sourceVaultId!]?.ltv?.toFixed(1) ?? '?'}% → {rebalancePreview.sourceLtv === Infinity ? '∞' : rebalancePreview.sourceLtv.toFixed(1)}%
                </div>
              </div>
              <div className="p-3 rounded-lg bg-secondary border border-border">
                <div className="text-xs text-muted-foreground mb-1">目标池 LTV 变化</div>
                <div className={`font-bold font-mono tabular-nums ${rebalancePreview.targetLtv > 85 ? 'text-danger' : rebalancePreview.targetLtv > 75 ? 'text-warning' : 'text-healthy'}`}>
                  {allPositions[targetVaultId!]?.ltv?.toFixed(1) ?? '?'}% → {rebalancePreview.targetLtv.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {/* Execute */}
          <Button
            onClick={handleRebalance}
            disabled={!publicKey || isLoading || !sourceVaultId || !targetVaultId || !amount}
            className="w-full bg-rebalance hover:bg-rebalance/90 text-rebalance-foreground shadow-glow-rebalance"
            size="lg"
          >
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />执行中...</>
            ) : (
              <><ArrowRightLeft className="mr-2 h-4 w-4" />执行跨池再平衡</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
