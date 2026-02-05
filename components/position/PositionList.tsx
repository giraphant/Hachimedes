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
import { PositionCard } from './PositionCard';
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
  onManageCollateral: (vaultId: number, positionId: number) => void;
  onManageDebt: (vaultId: number, positionId: number) => void;
  onFindPositions: () => void;
  isFinding: boolean;
  onManualLoad: (vaultId: number, positionId: number) => void;
  previewLtv?: number;
  previewCollateral?: number;
  previewDebt?: number;
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
  onManageCollateral,
  onManageDebt,
  onFindPositions,
  isFinding,
  onManualLoad,
  previewLtv,
  previewCollateral,
  previewDebt,
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
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-white text-lg">我的仓位</CardTitle>
            {positions.length > 0 && (
              <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-xs">
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
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
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
          <div className="flex items-center justify-center gap-2 text-slate-400 py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>加载仓位信息...</span>
          </div>
        ) : filteredPositions.length > 0 ? (
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs h-9 px-3">池子</TableHead>
                  <TableHead className="text-slate-500 text-xs h-9 px-3 text-right">LTV</TableHead>
                  <TableHead className="text-slate-500 text-xs h-9 px-3 text-right">抵押品</TableHead>
                  <TableHead className="text-slate-500 text-xs h-9 px-3 text-right">债务</TableHead>
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
                        'cursor-pointer border-slate-800/50 transition-colors',
                        isSelected
                          ? 'bg-blue-500/10 hover:bg-blue-500/15'
                          : 'hover:bg-slate-800/50'
                      )}
                    >
                      <TableCell className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-1.5 h-1.5 rounded-full flex-shrink-0',
                            isSelected ? 'bg-blue-500' : 'bg-slate-600'
                          )} />
                          <div>
                            <div className="text-sm font-medium text-slate-200">
                              {entry.vaultConfig.collateralToken}/{entry.vaultConfig.debtToken}
                            </div>
                            <div className="text-xs text-slate-500">
                              #{entry.vaultConfig.id}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <LtvBadge ltv={ltv} maxLtv={entry.vaultConfig.maxLtv} />
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <div className="font-mono text-sm text-slate-200">
                          {entry.position.collateralAmountUi.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {entry.vaultConfig.collateralToken}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <div className="font-mono text-sm text-slate-200">
                          {entry.position.debtAmountUi.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-500">
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
            <p className="text-slate-500 mb-2">未找到仓位</p>
            <p className="text-xs text-slate-600">
              点击"自动查找"搜索，或手动输入 Position ID
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-slate-500 text-sm">无匹配的仓位</p>
          </div>
        )}

        {/* Selected position detail */}
        {selectedPositionKey && filteredPositions.length > 0 && (() => {
          const entry = filteredPositions.find(
            (e) => `${e.vaultConfig.id}-${e.position.positionId}` === selectedPositionKey
          );
          if (!entry) return null;
          return (
            <PositionCard
              position={entry.position}
              vaultConfig={entry.vaultConfig}
              selected={true}
              onSelect={() => {}}
              onManageCollateral={() => onManageCollateral(entry.vaultConfig.id, entry.position.positionId)}
              onManageDebt={() => onManageDebt(entry.vaultConfig.id, entry.position.positionId)}
              previewLtv={previewLtv}
              previewCollateral={previewCollateral}
              previewDebt={previewDebt}
            />
          );
        })()}

        <div className="pt-2 border-t border-slate-800">
          <Label className="text-slate-500 text-xs mb-2 block">手动加载仓位</Label>
          <div className="flex items-center gap-2">
            <Select value={manualVaultId} onValueChange={setManualVaultId}>
              <SelectTrigger className="w-auto bg-slate-900/70 border-slate-700 text-xs h-8">
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
              className="w-28 bg-slate-900/70 border-slate-700 text-xs h-8"
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
