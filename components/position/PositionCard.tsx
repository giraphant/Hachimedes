'use client';

import { Settings } from 'lucide-react';
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
    <div className="rounded-lg border-2 border-blue-500/50 bg-slate-900/40 p-4 space-y-4">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="px-2 py-1 rounded bg-blue-950/50 text-blue-400 border border-blue-900/50">
            {vaultConfig.collateralToken}/{vaultConfig.debtToken} #{vaultConfig.id}
          </span>
        </div>
        <span className="text-slate-500">
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
        <div className="relative group">
          <div
            className="text-center p-4 rounded-xl bg-slate-900/30 border-2 border-slate-700/40 hover:border-slate-600 transition-all cursor-pointer"
            onClick={onManageCollateral}
          >
            <div className="relative">
              <div className="text-xs text-slate-500 mb-2 text-center">抵押品</div>
              <Settings className="absolute top-0 right-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-green-400 mb-1">
              <span>{position.collateralAmountUi.toFixed(2)}</span>
              {previewCollateral !== undefined && (
                <>
                  <span className="text-slate-600">→</span>
                  <span>{previewCollateral.toFixed(2)}</span>
                </>
              )}
            </div>
            <div className="text-xs text-slate-400">{vaultConfig.collateralToken}</div>
          </div>
        </div>

        <div className="relative group">
          <div
            className="text-center p-4 rounded-xl bg-slate-900/30 border-2 border-slate-700/40 hover:border-slate-600 transition-all cursor-pointer"
            onClick={onManageDebt}
          >
            <div className="relative">
              <div className="text-xs text-slate-500 mb-2 text-center">债务</div>
              <Settings className="absolute top-0 right-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-orange-400 mb-1">
              <span>{position.debtAmountUi.toFixed(2)}</span>
              {previewDebt !== undefined && (
                <>
                  <span className="text-slate-600">→</span>
                  <span>{previewDebt.toFixed(2)}</span>
                </>
              )}
            </div>
            <div className="text-xs text-slate-400">{vaultConfig.debtToken}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
