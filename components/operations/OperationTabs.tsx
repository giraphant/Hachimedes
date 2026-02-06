'use client';

import { TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LeveragePanel } from './LeveragePanel';
import { DeleveragePanel } from './DeleveragePanel';
import { RebalancePanel } from './RebalancePanel';
import { PositionInfo } from '@/lib/position';
import { VaultConfig } from '@/lib/vaults';
import { DiscoveredVault } from '@/lib/vault-discovery';

interface OperationTabsProps {
  positionInfo: PositionInfo | null;
  vaultConfig: VaultConfig;
  selectedPositionId: number | null;
  discoveredVaults: DiscoveredVault[];
  onSuccess: () => void;
  onPreviewChange?: (preview: { ltv?: number; collateral?: number; debt?: number } | null) => void;
}

export function OperationTabs({ positionInfo, vaultConfig, selectedPositionId, discoveredVaults, onSuccess, onPreviewChange }: OperationTabsProps) {
  return (
    <Card className="border-border bg-card">
      <Tabs
        defaultValue="deleverage"
        onValueChange={() => {
          if (onPreviewChange) onPreviewChange(null);
        }}
      >
        <CardHeader className="pb-3">
          <TabsList className="grid w-full grid-cols-3 bg-muted">
            <TabsTrigger
              value="leverage"
              className="gap-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-500 data-[state=active]:shadow-none"
            >
              <TrendingUp className="h-4 w-4 flex-shrink-0" />
              <span className="font-semibold text-sm">加杠杆</span>
            </TabsTrigger>
            <TabsTrigger
              value="deleverage"
              className="gap-2 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-500 data-[state=active]:shadow-none"
            >
              <TrendingDown className="h-4 w-4 flex-shrink-0" />
              <span className="font-semibold text-sm">减杠杆</span>
            </TabsTrigger>
            <TabsTrigger
              value="rebalance"
              className="gap-2 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-500 data-[state=active]:shadow-none"
            >
              <ArrowRightLeft className="h-4 w-4 flex-shrink-0" />
              <span className="font-semibold text-sm">再平衡</span>
            </TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent>
          <TabsContent value="leverage" className="mt-0">
            <LeveragePanel
              positionInfo={positionInfo}
              vaultConfig={vaultConfig}
              selectedPositionId={selectedPositionId}
              onSuccess={onSuccess}
              onPreviewChange={onPreviewChange}
            />
          </TabsContent>
          <TabsContent value="deleverage" className="mt-0">
            <DeleveragePanel
              positionInfo={positionInfo}
              vaultConfig={vaultConfig}
              selectedPositionId={selectedPositionId}
              onSuccess={onSuccess}
              onPreviewChange={onPreviewChange}
            />
          </TabsContent>
          <TabsContent value="rebalance" className="mt-0">
            <RebalancePanel
              discoveredVaults={discoveredVaults}
              currentVaultConfig={vaultConfig}
              onSuccess={onSuccess}
            />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
