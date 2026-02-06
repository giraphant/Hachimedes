'use client';

import { ArrowRight, Settings } from 'lucide-react';
import { LtvProgressBar } from '@/components/common/LtvProgressBar';
import { VaultConfig } from '@/lib/vaults';
import { PositionInfo } from '@/lib/position';

interface PositionCardProps {
  position: PositionInfo;
  vaultConfig: VaultConfig;
  selected: boolean;
  onSelect: () => void;
  onManageCollateral: () => void;
  onManageDebt: () => void;
  previewLtv?: number;
  previewCollateral?: number;
  previewDebt?: number;
}

export function PositionCard({
  position,
  vaultConfig,
  selected,
  onSelect,
  onManageCollateral,
  onManageDebt,
  previewLtv,
  previewCollateral,
  previewDebt,
}: PositionCardProps) {
  const ltv = position.ltv ?? 0;

  // Only render expanded detail view (compact rows are now in PositionList table)
  if (!selected) return null;

  return (
    <div className="rounded-lg border-2 border-blue-500/50 bg-card p-4 space-y-4">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="px-2 py-1 rounded bg-blue-950/50 text-blue-400 border border-blue-900/50">
            {vaultConfig.collateralToken}/{vaultConfig.debtToken} #{vaultConfig.id}
          </span>
        </div>
        <span className="text-muted-foreground">
          最大:{vaultConfig.maxLtv}% · 清算:{vaultConfig.liquidationLtv}%
        </span>
      </div>

      {position.ltv !== undefined && (
        <LtvProgressBar
          ltv={ltv}
          maxLtv={vaultConfig.maxLtv}
          liquidationLtv={vaultConfig.liquidationLtv}
          previewLtv={previewLtv}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          className="relative group text-center p-4 rounded-xl bg-secondary border-2 border-border hover:border-muted-foreground/30 transition-all cursor-pointer"
          onClick={onManageCollateral}
        >
          <div className="relative">
            <div className="text-xs text-muted-foreground mb-2 text-center">抵押品</div>
            <Settings className="absolute top-0 right-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
          </div>
          <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-green-400 mb-1">
            <span>{position.collateralAmountUi.toFixed(2)}</span>
            {previewCollateral !== undefined && (
              <>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                <span>{previewCollateral.toFixed(2)}</span>
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{vaultConfig.collateralToken}</div>
        </button>

        <button
          type="button"
          className="relative group text-center p-4 rounded-xl bg-secondary border-2 border-border hover:border-muted-foreground/30 transition-all cursor-pointer"
          onClick={onManageDebt}
        >
          <div className="relative">
            <div className="text-xs text-muted-foreground mb-2 text-center">债务</div>
            <Settings className="absolute top-0 right-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
          </div>
          <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-orange-400 mb-1">
            <span>{position.debtAmountUi.toFixed(2)}</span>
            {previewDebt !== undefined && (
              <>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                <span>{previewDebt.toFixed(2)}</span>
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{vaultConfig.debtToken}</div>
        </button>
      </div>
    </div>
  );
}
