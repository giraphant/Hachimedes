'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlidersHorizontal } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface AdvancedSettingsState {
  slippageBps: number;
  priorityFee: 'default' | 'fast' | 'turbo';
  selectedDexes: string[];
  onlyDirectRoutes: boolean;
  useJitoBundle: boolean;
  maxAccounts: number;
}

interface AdvancedSettingsProps extends AdvancedSettingsState {
  onChange: (partial: Partial<AdvancedSettingsState>) => void;
}

export function AdvancedSettings({
  slippageBps,
  priorityFee,
  selectedDexes,
  onlyDirectRoutes,
  useJitoBundle,
  maxAccounts,
  onChange,
}: AdvancedSettingsProps) {
  const toggleDex = (dex: string) => {
    onChange({
      selectedDexes: selectedDexes.includes(dex)
        ? selectedDexes.filter((d) => d !== dex)
        : [...selectedDexes, dex],
    });
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary border border-border">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">交易参数</span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs">
            滑点: {(slippageBps / 100).toFixed(2)}%
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 bg-popover border-border max-h-[85vh] overflow-y-auto">
          <div className="space-y-3">
            <div className="space-y-1 pb-2">
              <h4 className="font-medium text-foreground flex items-center gap-2 text-sm">
                <SlidersHorizontal className="h-4 w-4" />
                交易设置
              </h4>
            </div>

            {/* Slippage */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">滑点容忍度</Label>
              <div className="flex gap-1.5">
                <Button type="button" variant={slippageBps === 5 ? 'default' : 'outline'} size="sm" onClick={() => onChange({ slippageBps: 5 })} className="flex-1 text-xs h-8 rounded-lg">0.05%</Button>
                <Button type="button" variant={slippageBps === 10 ? 'default' : 'outline'} size="sm" onClick={() => onChange({ slippageBps: 10 })} className="flex-1 text-xs h-8 rounded-lg">0.1%</Button>
                <div className="flex-1 flex items-center gap-1 bg-secondary rounded-lg px-2 border border-border">
                  <Input
                    type="number"
                    value={slippageBps / 100 || ''}
                    placeholder="0.00"
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) * 100;
                      if (!isNaN(value) && value >= 0 && value <= 5000) onChange({ slippageBps: Math.round(value) });
                      else if (e.target.value === '') onChange({ slippageBps: 0 });
                    }}
                    className="bg-transparent border-0 text-foreground text-xs text-center w-full p-0 h-6 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    step="0.1" min="0" max="50"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            {/* Mode */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">执行模式</Label>
              <div className="flex gap-1.5">
                <Button type="button" variant={!useJitoBundle ? 'default' : 'outline'} size="sm" onClick={() => onChange({ useJitoBundle: false })} className="flex-1 text-xs h-8">Flash Loan</Button>
                <Button type="button" variant={useJitoBundle ? 'default' : 'outline'} size="sm" onClick={() => onChange({ useJitoBundle: true })} className="flex-1 text-xs h-8">Jito Bundle</Button>
              </div>
            </div>

            {/* Priority fee */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs">优先费用</Label>
                <span className="text-xs text-muted-foreground">
                  {priorityFee === 'default' && '默认'}
                  {priorityFee === 'fast' && '快速'}
                  {priorityFee === 'turbo' && '极速'}
                </span>
              </div>
              <div className="flex gap-1.5">
                {(['default', 'fast', 'turbo'] as const).map((fee) => (
                  <Button key={fee} type="button" variant={priorityFee === fee ? 'default' : 'outline'} size="sm" onClick={() => onChange({ priorityFee: fee })} className="flex-1 text-xs h-8">
                    {fee === 'default' ? '默认' : fee === 'fast' ? '快速' : '极速'}
                  </Button>
                ))}
              </div>
            </div>

            {/* Route type */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs">路由类型</Label>
                <span className="text-xs text-muted-foreground">{onlyDirectRoutes ? '直接' : '智能'}</span>
              </div>
              <div className="flex gap-1.5">
                <Button type="button" variant={!onlyDirectRoutes ? 'default' : 'outline'} size="sm" onClick={() => onChange({ onlyDirectRoutes: false })} className="flex-1 text-xs h-8">智能路由</Button>
                <Button type="button" variant={onlyDirectRoutes ? 'default' : 'outline'} size="sm" onClick={() => onChange({ onlyDirectRoutes: true })} className="flex-1 text-xs h-8">直接路由</Button>
              </div>
            </div>

            {/* DEX selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs">DEX 偏好</Label>
                <span className="text-xs text-muted-foreground">{selectedDexes.length === 0 ? '自动选择' : selectedDexes.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {['Orca', 'Raydium', 'Whirlpool', 'Meteora'].map((dex) => (
                  <Button key={dex} type="button" variant={selectedDexes.includes(dex) ? 'default' : 'outline'} size="sm" onClick={() => toggleDex(dex)} className="text-xs h-7">{dex}</Button>
                ))}
              </div>
            </div>

            {/* Max accounts */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs">最大账户数</Label>
                <span className="text-xs text-muted-foreground">{maxAccounts}</span>
              </div>
              <div className="flex gap-1.5">
                {[32, 28, 24, 20].map((value) => (
                  <Button key={value} type="button" variant={maxAccounts === value ? 'default' : 'outline'} size="sm" onClick={() => onChange({ maxAccounts: value })} className="flex-1 text-xs h-8">{value}</Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">交易失败时可尝试降低此值</p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
