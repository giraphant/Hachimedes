'use client';

import { useState, useMemo } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PositionFilters, SortKey } from './PositionFilters';
import { PositionInfo } from '@/lib/position';
import { VaultConfig, getAvailableVaults } from '@/lib/vaults';
import { formatCacheAge } from '@/lib/position-cache';
import { cn } from '@/lib/utils';

export interface PositionEntry {
  position: PositionInfo;
  vaultConfig: VaultConfig;
}

interface PositionListProps {
  positions: PositionEntry[];
  selectedPositionKey: string | null;
  isLoading: boolean;
  onSelectPosition: (vaultId: number, positionId: number) => void;
  onFindPositions: () => void;
  isFinding: boolean;
  onManualLoad: (vaultId: number, positionId: number) => void;
  lastScanned?: number | null;
  isBackgroundScanning?: boolean;
}

function LtvBadge({ ltv, maxLtv }: { ltv: number; maxLtv: number }) {
  const color =
    ltv < 70
      ? 'bg-green-500/15 text-green-400 border-green-500/30'
      : ltv < maxLtv
      ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
      : 'bg-red-500/15 text-red-400 border-red-500/30';
  return (
    <Badge variant="outline" className={cn('font-mono text-xs tabular-nums', color)}>
      {ltv.toFixed(1)}%
    </Badge>
  );
}

export function PositionList({
  positions,
  selectedPositionKey,
  isLoading,
  onSelectPosition,
  onFindPositions,
  isFinding,
  onManualLoad,
  lastScanned,
  isBackgroundScanning,
}: PositionListProps) {
  const [filterCollateral, setFilterCollateral] = useState('');
  const [filterDebt, setFilterDebt] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ltv-desc');

  const [manualVaultId, setManualVaultId] = useState('');
  const [manualPositionId, setManualPositionId] = useState('');

  const collateralTypes = useMemo(
    () => [...new Set(positions.map((p) => p.vaultConfig.collateralToken))].sort(),
    [positions]
  );
  const debtTypes = useMemo(
    () => [...new Set(positions.map((p) => p.vaultConfig.debtToken))].sort(),
    [positions]
  );

  const filteredPositions = useMemo(() => {
    let result = positions;

    if (filterCollateral) {
      result = result.filter((p) => p.vaultConfig.collateralToken === filterCollateral);
    }
    if (filterDebt) {
      result = result.filter((p) => p.vaultConfig.debtToken === filterDebt);
    }

    result = [...result].sort((a, b) => {
      const aLtv = a.position.ltv ?? 0;
      const bLtv = b.position.ltv ?? 0;
      switch (sortKey) {
        case 'ltv-desc': return bLtv - aLtv;
        case 'ltv-asc': return aLtv - bLtv;
        case 'collateral-desc': return b.position.collateralAmountUi - a.position.collateralAmountUi;
        case 'debt-desc': return b.position.debtAmountUi - a.position.debtAmountUi;
        default: return 0;
      }
    });

    return result;
  }, [positions, filterCollateral, filterDebt, sortKey]);

  const handleManualLoad = () => {
    const vid = parseInt(manualVaultId);
    const pid = parseInt(manualPositionId);
    if (!isNaN(vid) && !isNaN(pid) && pid >= 0) {
      onManualLoad(vid, pid);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-foreground text-lg">我的仓位</CardTitle>
            {positions.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {positions.length}
              </Badge>
            )}
          </div>
          <Button
            onClick={onFindPositions}
            disabled={isFinding}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            {isFinding ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                扫描中
              </>
            ) : (
              <>
                <RefreshCw className="mr-1 h-3 w-3" />
                重新扫描
              </>
            )}
          </Button>
        </div>
        {/* Cache status */}
        {(lastScanned || isBackgroundScanning) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            {isBackgroundScanning && (
              <span className="flex items-center gap-1 text-blue-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                后台扫描中
              </span>
            )}
            {lastScanned && (
              <span>上次扫描: {formatCacheAge(lastScanned)}</span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {positions.length > 0 && (
          <PositionFilters
            collateralTypes={collateralTypes}
            debtTypes={debtTypes}
            selectedCollateral={filterCollateral}
            selectedDebt={filterDebt}
            sortKey={sortKey}
            onCollateralChange={setFilterCollateral}
            onDebtChange={setFilterDebt}
            onSortChange={setSortKey}
          />
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-14 ml-auto" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
            <p className="text-center text-xs text-muted-foreground py-2">加载仓位信息...</p>
          </div>
        ) : filteredPositions.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground text-xs h-9 px-3">池子</TableHead>
                  <TableHead className="text-muted-foreground text-xs h-9 px-3 text-right">LTV</TableHead>
                  <TableHead className="text-muted-foreground text-xs h-9 px-3 text-right">抵押品</TableHead>
                  <TableHead className="text-muted-foreground text-xs h-9 px-3 text-right">债务</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPositions.map((entry) => {
                  const key = `${entry.vaultConfig.id}-${entry.position.positionId}`;
                  const isSelected = key === selectedPositionKey;
                  const ltv = entry.position.ltv ?? 0;

                  return (
                    <TableRow
                      key={key}
                      data-state={isSelected ? 'selected' : undefined}
                      onClick={() => onSelectPosition(entry.vaultConfig.id, entry.position.positionId)}
                      className={cn(
                        'cursor-pointer border-border/50 transition-colors',
                        isSelected
                          ? 'bg-blue-500/10 hover:bg-blue-500/15'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <TableCell className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-1.5 h-1.5 rounded-full flex-shrink-0',
                            isSelected ? 'bg-blue-500' : 'bg-muted-foreground/40'
                          )} />
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {entry.vaultConfig.collateralToken}/{entry.vaultConfig.debtToken}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              #{entry.vaultConfig.id}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <LtvBadge ltv={ltv} maxLtv={entry.vaultConfig.maxLtv} />
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <div className="font-mono text-sm text-foreground">
                          {entry.position.collateralAmountUi.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.vaultConfig.collateralToken}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <div className="font-mono text-sm text-foreground">
                          {entry.position.debtAmountUi.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.vaultConfig.debtToken}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-2">未找到仓位</p>
            <p className="text-xs text-muted-foreground/70">
              点击"自动查找"搜索，或手动输入 Position ID
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground text-sm">无匹配的仓位</p>
          </div>
        )}

        <div className="pt-2">
          <Separator className="mb-3" />
          <Label className="text-muted-foreground text-xs mb-2 block">手动加载仓位</Label>
          <div className="flex items-center gap-2">
            <Select value={manualVaultId} onValueChange={setManualVaultId}>
              <SelectTrigger className="w-auto bg-secondary border-border text-xs h-8">
                <SelectValue placeholder="Vault" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {getAvailableVaults().map((vault) => (
                  <SelectItem key={vault.id} value={vault.id.toString()}>
                    {vault.name} (#{vault.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Position ID"
              value={manualPositionId}
              onChange={(e) => setManualPositionId(e.target.value)}
              className="w-28 bg-secondary border-border text-xs h-8"
            />
            <Button onClick={handleManualLoad} size="sm" variant="outline" className="text-xs h-8">
              加载
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
