'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LeveragePanel } from './LeveragePanel';
import { DeleveragePanel } from './DeleveragePanel';
import { RebalancePanel } from './RebalancePanel';
import { PositionInfo } from '@/lib/position';
import { VaultConfig } from '@/lib/vaults';
import { DiscoveredVault } from '@/lib/vault-discovery';

type TabKey = 'leverage' | 'deleverage' | 'rebalance';

interface OperationTabsProps {
  positionInfo: PositionInfo | null;
  vaultConfig: VaultConfig;
  selectedPositionId: number | null;
  discoveredVaults: DiscoveredVault[];
  onSuccess: () => void;
  onPreviewChange?: (preview: { ltv?: number; collateral?: number; debt?: number } | null) => void;
}

const tabs: { key: TabKey; label: string; icon: typeof TrendingUp; color: string; activeColor: string }[] = [
  { key: 'leverage', label: '加杠杆', icon: TrendingUp, color: 'text-slate-400', activeColor: 'border-cyan-500 bg-cyan-500/10 text-cyan-500' },
  { key: 'deleverage', label: '减杠杆', icon: TrendingDown, color: 'text-slate-400', activeColor: 'border-purple-500 bg-purple-500/10 text-purple-500' },
  { key: 'rebalance', label: '再平衡', icon: ArrowRightLeft, color: 'text-slate-400', activeColor: 'border-emerald-500 bg-emerald-500/10 text-emerald-500' },
];

export function OperationTabs({ positionInfo, vaultConfig, selectedPositionId, discoveredVaults, onSuccess, onPreviewChange }: OperationTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('deleverage');

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-3">
        <div className="grid grid-cols-3 gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key);
                  // Clear preview when switching tabs
                  if (onPreviewChange) onPreviewChange(null);
                }}
                className={`p-3 rounded-lg border-2 transition-all ${
                  isActive ? tab.activeColor : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? '' : tab.color}`} />
                  <span className={`font-semibold text-sm ${isActive ? '' : tab.color}`}>{tab.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === 'leverage' && (
          <LeveragePanel
            positionInfo={positionInfo}
            vaultConfig={vaultConfig}
            selectedPositionId={selectedPositionId}
            onSuccess={onSuccess}
            onPreviewChange={onPreviewChange}
          />
        )}
        {activeTab === 'deleverage' && (
          <DeleveragePanel
            positionInfo={positionInfo}
            vaultConfig={vaultConfig}
            selectedPositionId={selectedPositionId}
            onSuccess={onSuccess}
            onPreviewChange={onPreviewChange}
          />
        )}
        {activeTab === 'rebalance' && (
          <RebalancePanel
            discoveredVaults={discoveredVaults}
            currentVaultConfig={vaultConfig}
            onSuccess={onSuccess}
          />
        )}
      </CardContent>
    </Card>
  );
}
