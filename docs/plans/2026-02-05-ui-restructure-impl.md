# UI Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the UI from a monolithic 1765-line component into a modular component tree with three-tab operations (Leverage/Deleverage/Rebalance), a filterable position list, and shared common components.

**Architecture:** Extract reusable UI elements (LTV bar, amount input, preview card) into `common/`, build position list with filtering in `position/`, split operation panels into `operations/`, and reduce FlashLoanInterface.tsx to a ~150-line container that wires state between children.

**Tech Stack:** React 19, Next.js 16, TypeScript, Tailwind CSS, shadcn/ui (Radix), Lucide icons

---

## Important Notes

- **Working directory:** `/home/ramu/Hachimedes/.worktrees/ui-restructure`
- **This is a UI refactor** — all `lib/` business logic stays untouched
- **Existing tests** are for `lib/` only and must keep passing after each task
- **Visual verification** replaces unit tests for UI components: `npm run dev` and check localhost:28848
- **Build verification:** `npm run build` must pass after each task
- **Baseline:** 7 test files, 52 tests passing

---

### Task 1: Create common/LtvProgressBar.tsx

**Files:**
- Create: `components/common/LtvProgressBar.tsx`

**Step 1: Create the component**

Extract the LTV progress bar from FlashLoanInterface.tsx lines 1095-1145. This is a pure presentational component.

```tsx
// components/common/LtvProgressBar.tsx
import { cn } from '@/lib/utils';

interface LtvProgressBarProps {
  ltv: number;
  maxLtv: number;
  liquidationLtv: number;
  previewLtv?: number;
}

export function LtvProgressBar({ ltv, maxLtv, liquidationLtv, previewLtv }: LtvProgressBarProps) {
  const getColor = (value: number) =>
    value < 70 ? 'text-green-400' : value < maxLtv ? 'text-yellow-400' : 'text-red-400';

  const getBarColor = (value: number) =>
    value < 70
      ? 'bg-gradient-to-r from-green-500 to-green-400'
      : value < maxLtv
      ? 'bg-gradient-to-r from-yellow-500 to-yellow-400'
      : 'bg-gradient-to-r from-red-500 to-red-400';

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <span className="text-sm text-slate-400">清算阈线(LTV)</span>
        <div className="flex items-center gap-2">
          <div className={cn('text-4xl font-bold', getColor(ltv))}>
            {ltv.toFixed(1)}%
          </div>
          {previewLtv !== undefined && (
            <>
              <span className="text-2xl text-slate-600">→</span>
              <div className={cn('text-4xl font-bold', getColor(previewLtv))}>
                {previewLtv.toFixed(1)}%
              </div>
            </>
          )}
        </div>
      </div>

      <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all', getBarColor(ltv))}
          style={{ width: `${Math.min(ltv, 100)}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-red-500/50"
          style={{ left: `${liquidationLtv}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-slate-500">
        <span>{ltv.toFixed(1)}%</span>
        <span>清算:{liquidationLtv}%</span>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds (component is created but not yet imported anywhere)

**Step 3: Commit**

```bash
git add components/common/LtvProgressBar.tsx
git commit -m "feat(ui): extract LtvProgressBar common component"
```

---

### Task 2: Create common/AmountInput.tsx

**Files:**
- Create: `components/common/AmountInput.tsx`

**Step 1: Create the component**

Extract the amount input + slider pattern used in FlashLoanInterface.tsx lines 1424-1482 and PositionManageDialog.tsx lines 397-463.

```tsx
// components/common/AmountInput.tsx
'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

interface AmountInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxAmount: number;
  maxLabel?: string;       // e.g. "可用" — shown next to max value
  step?: string;
  disabled?: boolean;
}

export function AmountInput({
  label,
  value,
  onChange,
  maxAmount,
  maxLabel = '可用',
  step = '0.000001',
  disabled = false,
}: AmountInputProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-slate-300">{label}</Label>
        <div className="text-xs text-slate-400">
          {maxLabel}: <span className="font-mono text-slate-300">{maxAmount.toFixed(4)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-slate-900 border-slate-700 text-white flex-1"
          step={step}
          max={maxAmount}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(maxAmount.toFixed(6))}
          disabled={maxAmount === 0 || disabled}
          className="px-3"
        >
          MAX
        </Button>
      </div>

      <div className="space-y-2">
        <Slider
          value={[parseFloat(value) || 0]}
          onValueChange={([v]) => {
            if (!isNaN(v) && isFinite(v)) {
              onChange(v.toFixed(6));
            }
          }}
          max={maxAmount > 0 ? maxAmount : 1}
          step={maxAmount > 0 ? maxAmount / 100 : 0.01}
          disabled={maxAmount === 0 || disabled}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>0</span>
          <span>{maxAmount > 0 ? (maxAmount * 0.5).toFixed(2) : '0.00'}</span>
          <span>{maxAmount > 0 ? maxAmount.toFixed(2) : '0.00'}</span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/common/AmountInput.tsx
git commit -m "feat(ui): extract AmountInput common component"
```

---

### Task 3: Create common/PreviewCard.tsx

**Files:**
- Create: `components/common/PreviewCard.tsx`

**Step 1: Create the component**

A generic preview card for showing before→after values. Used by leverage, deleverage, and rebalance panels.

```tsx
// components/common/PreviewCard.tsx
import { cn } from '@/lib/utils';

interface PreviewRow {
  label: string;
  currentValue: string;
  newValue: string;
  colorClass?: string;   // optional override; defaults to text-slate-200
}

interface PreviewCardProps {
  rows: PreviewRow[];
  warning?: string;       // e.g. "LTV exceeds max"
}

export function PreviewCard({ rows, warning }: PreviewCardProps) {
  return (
    <div className="p-3 rounded-lg bg-slate-900/30 border border-slate-700/40 space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{row.label}</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-300">{row.currentValue}</span>
            <span className="text-slate-600">→</span>
            <span className={cn('font-mono', row.colorClass ?? 'text-slate-200')}>
              {row.newValue}
            </span>
          </div>
        </div>
      ))}
      {warning && (
        <div className="text-xs text-red-400 mt-1">⚠️ {warning}</div>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/common/PreviewCard.tsx
git commit -m "feat(ui): extract PreviewCard common component"
```

---

### Task 4: Create position/PositionCard.tsx

**Files:**
- Create: `components/position/PositionCard.tsx`

**Step 1: Create the component**

Single position card with compact/expanded states. Extract from FlashLoanInterface.tsx lines 1083-1199.

```tsx
// components/position/PositionCard.tsx
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
  const ltvColor = ltv < 70 ? 'text-green-400' : ltv < vaultConfig.maxLtv ? 'text-yellow-400' : 'text-red-400';

  if (!selected) {
    // Compact view
    return (
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left p-3 rounded-lg border border-slate-700/40 bg-slate-900/20 hover:border-slate-600 transition-all"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-slate-600" />
            <span className="text-sm font-medium text-slate-300">
              {vaultConfig.name} #{vaultConfig.id}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className={ltvColor}>LTV {ltv.toFixed(1)}%</span>
            <span className="text-slate-500">
              {position.collateralAmountUi.toFixed(2)} {vaultConfig.collateralToken} | {position.debtAmountUi.toFixed(0)} {vaultConfig.debtToken}
            </span>
          </div>
        </div>
      </button>
    );
  }

  // Expanded view
  return (
    <div className="rounded-lg border-2 border-blue-500/50 bg-slate-900/40 p-4 space-y-4">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="px-2 py-1 rounded bg-blue-950/50 text-blue-400 border border-blue-900/50">
            {vaultConfig.name} #{vaultConfig.id}
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
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/position/PositionCard.tsx
git commit -m "feat(ui): create PositionCard with compact/expanded views"
```

---

### Task 5: Create position/PositionFilters.tsx

**Files:**
- Create: `components/position/PositionFilters.tsx`

**Step 1: Create the component**

New component for filtering by collateral type, debt type, and sorting.

```tsx
// components/position/PositionFilters.tsx
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type SortKey = 'ltv-desc' | 'ltv-asc' | 'collateral-desc' | 'debt-desc';

interface PositionFiltersProps {
  collateralTypes: string[];     // unique collateral token symbols
  debtTypes: string[];           // unique debt token symbols
  selectedCollateral: string;    // '' means all
  selectedDebt: string;          // '' means all
  sortKey: SortKey;
  onCollateralChange: (value: string) => void;
  onDebtChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
}

export function PositionFilters({
  collateralTypes,
  debtTypes,
  selectedCollateral,
  selectedDebt,
  sortKey,
  onCollateralChange,
  onDebtChange,
  onSortChange,
}: PositionFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selectedCollateral || '__all__'} onValueChange={(v) => onCollateralChange(v === '__all__' ? '' : v)}>
        <SelectTrigger className="w-auto bg-slate-900/70 border-slate-700 text-xs h-8">
          <SelectValue placeholder="抵押品" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">全部抵押品</SelectItem>
          {collateralTypes.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedDebt || '__all__'} onValueChange={(v) => onDebtChange(v === '__all__' ? '' : v)}>
        <SelectTrigger className="w-auto bg-slate-900/70 border-slate-700 text-xs h-8">
          <SelectValue placeholder="债务" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">全部债务</SelectItem>
          {debtTypes.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sortKey} onValueChange={(v) => onSortChange(v as SortKey)}>
        <SelectTrigger className="w-auto bg-slate-900/70 border-slate-700 text-xs h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ltv-desc">健康度 ↓ (高风险优先)</SelectItem>
          <SelectItem value="ltv-asc">健康度 ↑ (低风险优先)</SelectItem>
          <SelectItem value="collateral-desc">抵押品 ↓</SelectItem>
          <SelectItem value="debt-desc">债务 ↓</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/position/PositionFilters.tsx
git commit -m "feat(ui): create PositionFilters with collateral/debt/sort controls"
```

---

### Task 6: Create position/PositionList.tsx

**Files:**
- Create: `components/position/PositionList.tsx`

**Step 1: Create the component**

Combines PositionFilters + PositionCard list. Manages filter/sort state internally, receives positions and selection from parent.

```tsx
// components/position/PositionList.tsx
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
import { PositionCard } from './PositionCard';
import { PositionFilters, SortKey } from './PositionFilters';
import { PositionInfo } from '@/lib/position';
import { VaultConfig, getAvailableVaults } from '@/lib/vaults';

interface PositionEntry {
  position: PositionInfo;
  vaultConfig: VaultConfig;
}

interface PositionListProps {
  positions: PositionEntry[];
  selectedPositionKey: string | null;  // "vaultId-positionId"
  isLoading: boolean;
  onSelectPosition: (vaultId: number, positionId: number) => void;
  onManageCollateral: (vaultId: number, positionId: number) => void;
  onManageDebt: (vaultId: number, positionId: number) => void;
  onFindPositions: () => void;
  isFinding: boolean;
  // Manual load
  onManualLoad: (vaultId: number, positionId: number) => void;
  // Preview data for the selected position (from operation panels)
  previewLtv?: number;
  previewCollateral?: number;
  previewDebt?: number;
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
}: PositionListProps) {
  // Filter state
  const [filterCollateral, setFilterCollateral] = useState('');
  const [filterDebt, setFilterDebt] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ltv-desc');

  // Manual load state
  const [manualVaultId, setManualVaultId] = useState('');
  const [manualPositionId, setManualPositionId] = useState('');

  // Derive unique types
  const collateralTypes = useMemo(
    () => [...new Set(positions.map((p) => p.vaultConfig.collateralToken))].sort(),
    [positions]
  );
  const debtTypes = useMemo(
    () => [...new Set(positions.map((p) => p.vaultConfig.debtToken))].sort(),
    [positions]
  );

  // Filter and sort
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
          <CardTitle className="text-white text-lg">我的仓位</CardTitle>
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
                查找中
              </>
            ) : (
              <>
                <RefreshCw className="mr-1 h-3 w-3" />
                自动查找
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
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

        {/* Position list */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-slate-400 py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>加载仓位信息...</span>
          </div>
        ) : filteredPositions.length > 0 ? (
          <div className="space-y-2">
            {filteredPositions.map((entry) => {
              const key = `${entry.vaultConfig.id}-${entry.position.positionId}`;
              const isSelected = key === selectedPositionKey;
              return (
                <PositionCard
                  key={key}
                  position={entry.position}
                  vaultConfig={entry.vaultConfig}
                  selected={isSelected}
                  onSelect={() => onSelectPosition(entry.vaultConfig.id, entry.position.positionId)}
                  onManageCollateral={() => onManageCollateral(entry.vaultConfig.id, entry.position.positionId)}
                  onManageDebt={() => onManageDebt(entry.vaultConfig.id, entry.position.positionId)}
                  previewLtv={isSelected ? previewLtv : undefined}
                  previewCollateral={isSelected ? previewCollateral : undefined}
                  previewDebt={isSelected ? previewDebt : undefined}
                />
              );
            })}
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

        {/* Manual load */}
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
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/position/PositionList.tsx
git commit -m "feat(ui): create PositionList with filtering and sorting"
```

---

### Task 7: Create operations/AdvancedSettings.tsx

**Files:**
- Create: `components/operations/AdvancedSettings.tsx`

**Step 1: Create the component**

Extract from FlashLoanInterface.tsx lines 1484-1703.

```tsx
// components/operations/AdvancedSettings.tsx
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

export function AdvancedSettings({ slippageBps, priorityFee, selectedDexes, onlyDirectRoutes, useJitoBundle, maxAccounts, onChange }: AdvancedSettingsProps) {
  const toggleDex = (dex: string) => {
    onChange({
      selectedDexes: selectedDexes.includes(dex)
        ? selectedDexes.filter((d) => d !== dex)
        : [...selectedDexes, dex],
    });
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/30 border border-slate-700/40">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-300">高级设置</span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs">
            滑点: {(slippageBps / 100).toFixed(2)}%
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 bg-slate-900 border-slate-700 max-h-[85vh] overflow-y-auto">
          <div className="space-y-3">
            <div className="space-y-1 pb-2">
              <h4 className="font-medium text-white flex items-center gap-2 text-sm">
                <SlidersHorizontal className="h-4 w-4" />
                交易设置
              </h4>
            </div>

            {/* Slippage */}
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">滑点容忍度</Label>
              <div className="flex gap-1.5">
                <Button type="button" variant={slippageBps === 5 ? 'default' : 'outline'} size="sm" onClick={() => onChange({ slippageBps: 5 })} className="flex-1 text-xs h-8 rounded-lg">0.05%</Button>
                <Button type="button" variant={slippageBps === 10 ? 'default' : 'outline'} size="sm" onClick={() => onChange({ slippageBps: 10 })} className="flex-1 text-xs h-8 rounded-lg">0.1%</Button>
                <div className="flex-1 flex items-center gap-1 bg-slate-800/50 rounded-lg px-2 border border-slate-700">
                  <Input
                    type="number"
                    value={slippageBps / 100 || ''}
                    placeholder="0.00"
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) * 100;
                      if (!isNaN(value) && value >= 0 && value <= 5000) onChange({ slippageBps: Math.round(value) });
                      else if (e.target.value === '') onChange({ slippageBps: 0 });
                    }}
                    className="bg-transparent border-0 text-white text-xs text-center w-full p-0 h-6 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    step="0.1" min="0" max="50"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </div>
            </div>

            {/* Mode */}
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Mode</Label>
              <div className="flex gap-1.5">
                <Button type="button" variant={!useJitoBundle ? 'default' : 'outline'} size="sm" onClick={() => onChange({ useJitoBundle: false })} className="flex-1 text-xs h-8">Flash Loan</Button>
                <Button type="button" variant={useJitoBundle ? 'default' : 'outline'} size="sm" onClick={() => onChange({ useJitoBundle: true })} className="flex-1 text-xs h-8">Jito Bundle</Button>
              </div>
            </div>

            {/* Priority fee */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-slate-300 text-xs">优先费用</Label>
                <span className="text-xs text-slate-500">
                  {priorityFee === 'default' && '默认'}
                  {priorityFee === 'fast' && '快'}
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
                <Label className="text-slate-300 text-xs">路由类型</Label>
                <span className="text-xs text-slate-500">{onlyDirectRoutes ? '直接' : '智能'}</span>
              </div>
              <div className="flex gap-1.5">
                <Button type="button" variant={!onlyDirectRoutes ? 'default' : 'outline'} size="sm" onClick={() => onChange({ onlyDirectRoutes: false })} className="flex-1 text-xs h-8">智能路由</Button>
                <Button type="button" variant={onlyDirectRoutes ? 'default' : 'outline'} size="sm" onClick={() => onChange({ onlyDirectRoutes: true })} className="flex-1 text-xs h-8">直接路由</Button>
              </div>
            </div>

            {/* DEX selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-slate-300 text-xs">DEX 限制</Label>
                <span className="text-xs text-slate-500">{selectedDexes.length === 0 ? '自动' : selectedDexes.length}</span>
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
                <Label className="text-slate-300 text-xs">最大账户数</Label>
                <span className="text-xs text-slate-500">{maxAccounts}</span>
              </div>
              <div className="flex gap-1.5">
                {[32, 28, 24, 20].map((value) => (
                  <Button key={value} type="button" variant={maxAccounts === value ? 'default' : 'outline'} size="sm" onClick={() => onChange({ maxAccounts: value })} className="flex-1 text-xs h-8">{value}</Button>
                ))}
              </div>
              <p className="text-xs text-slate-500">交易过大时降低此值 (32→28→24→20)</p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/operations/AdvancedSettings.tsx
git commit -m "feat(ui): extract AdvancedSettings component"
```

---

### Task 8: Create operations/LeveragePanel.tsx

**Files:**
- Create: `components/operations/LeveragePanel.tsx`

**Step 1: Create the component**

Leverage (加杠杆) operation panel. Extracts the leverage-specific logic from FlashLoanInterface.tsx.

```tsx
// components/operations/LeveragePanel.tsx
'use client';

import { useState, useMemo, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/common/AmountInput';
import { PreviewCard } from '@/components/common/PreviewCard';
import { AdvancedSettings, AdvancedSettingsState } from './AdvancedSettings';
import { useToast } from '@/hooks/use-toast';
import { PositionInfo } from '@/lib/position';
import { VaultConfig } from '@/lib/vaults';

interface LeveragePanelProps {
  positionInfo: PositionInfo | null;
  vaultConfig: VaultConfig;
  selectedPositionId: number | null;
  onSuccess: () => void;
  // Expose preview data for parent to pass to PositionCard
  onPreviewChange?: (preview: { ltv?: number; collateral?: number; debt?: number } | null) => void;
}

export function LeveragePanel({ positionInfo, vaultConfig, selectedPositionId, onSuccess, onPreviewChange }: LeveragePanelProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();

  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<AdvancedSettingsState>({
    slippageBps: 5,
    priorityFee: 'default',
    selectedDexes: [],
    onlyDirectRoutes: false,
    useJitoBundle: false,
    maxAccounts: 32,
  });

  // Max amount calculation
  const maxAmount = useMemo(() => {
    if (!positionInfo || !positionInfo.ltv) return 0;
    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;
    if (currentCollateral === 0 || positionInfo.ltv === 0 || currentDebt === 0) return 0;
    const currentPrice = currentDebt / (currentCollateral * positionInfo.ltv / 100);
    const safeLtvRatio = 0.78;
    const numerator = safeLtvRatio * currentCollateral * currentPrice - currentDebt;
    const denominator = 1 - safeLtvRatio;
    return Math.max(0, numerator / denominator);
  }, [positionInfo]);

  // Preview
  const previewData = useMemo(() => {
    if (!positionInfo || !amount || isNaN(parseFloat(amount)) || positionInfo.ltv === undefined) return null;
    const amountNum = parseFloat(amount);
    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;
    if (currentCollateral === 0 || positionInfo.ltv === 0 || currentDebt === 0) return null;
    const currentPrice = currentDebt / (currentCollateral * positionInfo.ltv / 100);

    const newCollateral = currentCollateral + (amountNum / currentPrice);
    const newDebt = currentDebt + amountNum;
    const newLtv = (newDebt / (newCollateral * currentPrice)) * 100;

    return { newCollateral, newDebt, newLtv, exceedsMax: newLtv > 78 };
  }, [positionInfo, amount]);

  // Notify parent of preview changes
  useMemo(() => {
    if (onPreviewChange) {
      onPreviewChange(previewData ? { ltv: previewData.newLtv, collateral: previewData.newCollateral, debt: previewData.newDebt } : null);
    }
  }, [previewData, onPreviewChange]);

  const handleExecute = useCallback(async () => {
    if (!publicKey || !signTransaction || !amount || selectedPositionId === null) return;

    if (settings.onlyDirectRoutes) {
      toast({ title: '⚠️ 使用直接路由', description: '直接路由可能导致较高磨损，请注意检查交易详情' });
    }

    setIsLoading(true);
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const collateralMintPk = new PublicKey(vaultConfig.collateralMint);
      const debtMintPk = new PublicKey(vaultConfig.debtMint);

      let transaction: any;
      let transactions: any[] = [];
      let positionId: any;
      let swapQuote: any;

      if (settings.useJitoBundle) {
        toast({ title: '正在构建 Jito Bundle (3 TX)', description: 'Borrow → Swap → Deposit' });
        const { buildLeverageJitoBundle } = await import('@/lib/leverage-jito-bundle');
        const result = await buildLeverageJitoBundle({
          collateralMint: collateralMintPk, debtMint: debtMintPk, borrowAmount: parseFloat(amount),
          userPublicKey: publicKey, vaultId: vaultConfig.id, positionId: selectedPositionId, connection,
          slippageBps: settings.slippageBps, preferredDexes: settings.selectedDexes.length > 0 ? settings.selectedDexes : undefined,
          onlyDirectRoutes: settings.onlyDirectRoutes, maxAccounts: settings.maxAccounts,
          debtDecimals: vaultConfig.debtDecimals, collateralDecimals: vaultConfig.collateralDecimals,
        });
        transactions = result.transactions; positionId = result.positionId; swapQuote = result.swapQuote;
      } else {
        toast({ title: '正在构建 Flash Loan 交易', description: 'Flash Borrow → Swap → Deposit + Borrow → Flash Payback' });
        const { buildLeverageFlashLoanSwap } = await import('@/lib/leverage-flashloan-swap');
        const result = await buildLeverageFlashLoanSwap({
          collateralMint: collateralMintPk, debtMint: debtMintPk, flashLoanAmount: parseFloat(amount),
          userPublicKey: publicKey, vaultId: vaultConfig.id, positionId: selectedPositionId, connection,
          slippageBps: settings.slippageBps, preferredDexes: settings.selectedDexes.length > 0 ? settings.selectedDexes : undefined,
          onlyDirectRoutes: settings.onlyDirectRoutes, maxAccounts: settings.maxAccounts, useJitoBundle: false,
          debtDecimals: vaultConfig.debtDecimals, collateralDecimals: vaultConfig.collateralDecimals,
        });
        transaction = result.transaction; positionId = result.positionId; swapQuote = result.swapQuote;
      }

      // Price warning
      let priceWarning = '';
      if (swapQuote && positionInfo) {
        const debtScale = Math.pow(10, vaultConfig.debtDecimals);
        const collateralScale = Math.pow(10, vaultConfig.collateralDecimals);
        const inputAmt = parseInt(swapQuote.inputAmount) / debtScale;
        const outputAmt = parseInt(swapQuote.outputAmount) / collateralScale;
        const tradePrice = inputAmt / outputAmt;
        if (positionInfo.oraclePrice) {
          const oraclePrice = positionInfo.oraclePrice;
          const deviation = ((tradePrice - oraclePrice) / oraclePrice) * 100;
          priceWarning = `\n📊 预言机价格: $${oraclePrice.toFixed(4)}\n💱 交易价格: $${tradePrice.toFixed(4)}\n📉 价格偏差: ${deviation > 0 ? '+' : ''}${deviation.toFixed(2)}%\n⚠️ 请检查价格是否合理`;
        } else {
          priceWarning = `\n💱 交易价格: $${tradePrice.toFixed(4)} ${vaultConfig.debtToken}/${vaultConfig.collateralToken}\n⚠️ 请检查价格是否合理`;
        }
      }

      toast({ title: '请在钱包中确认交易', description: settings.useJitoBundle ? `需要签名 3 个交易${priceWarning}` : `正在等待签名...${priceWarning}` });

      let signedTransactions: any[] = [];
      if (settings.useJitoBundle) {
        for (const tx of transactions) signedTransactions.push(await signTransaction(tx));
      } else {
        signedTransactions = [await signTransaction(transaction)];
      }

      let signature: string;
      if (settings.useJitoBundle) {
        toast({ title: '正在通过 Jito Bundle 发送', description: `发送 ${signedTransactions.length} 个交易的原子 Bundle...` });
        const { sendJitoMultiTxBundle } = await import('@/lib/jito-bundle');
        signature = await sendJitoMultiTxBundle(connection, signedTransactions);
      } else {
        toast({ title: '正在发送交易', description: '请稍候...' });
        signature = await connection.sendTransaction(signedTransactions[0], { skipPreflight: false, preflightCommitment: 'confirmed' });
      }

      toast({ title: '正在确认交易', description: '这可能需要几秒钟...' });
      await connection.confirmTransaction(signature, 'confirmed');

      toast({
        title: 'Leverage + Swap 执行成功！',
        description: (
          <div className="mt-2 space-y-1">
            {positionId && <p>Position ID: {positionId}</p>}
            <p>交易签名: {signature.slice(0, 8)}...{signature.slice(-8)}</p>
            <a href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs">在 Solscan 上查看</a>
          </div>
        ),
      });

      setAmount('');
      onSuccess();
    } catch (error: any) {
      console.error('Leverage error:', error);
      const isTxTooLarge = error.message && (error.message.includes('Transaction exceeds maximum size') || error.message.includes('Transaction too large'));
      if (isTxTooLarge) {
        const suggestions = [];
        if (settings.maxAccounts > 20) suggestions.push(`降低「最大账户数」到 ${settings.maxAccounts === 32 ? 28 : settings.maxAccounts === 28 ? 24 : 20}`);
        if (!settings.onlyDirectRoutes) suggestions.push('切换到「仅直接路由」');
        if (!settings.useJitoBundle) suggestions.push('启用 Jito Bundle');
        toast({ title: '⚠️ 交易过大（超过 1232 bytes）', description: `请在高级设置中尝试：${suggestions.join('、')}`, variant: 'destructive' });
      } else {
        toast({ title: '闪电贷执行失败', description: error.message || '发生未知错误', variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, amount, selectedPositionId, settings, vaultConfig, connection, positionInfo, toast, onSuccess]);

  const ltvColor = (v: number) => v < 70 ? 'text-green-400' : v < 78 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* Context */}
      {positionInfo && (
        <div className="text-xs text-slate-400">
          当前: {vaultConfig.name} #{selectedPositionId}
        </div>
      )}

      {/* Amount */}
      <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800">
        <AmountInput
          label={`Flash Borrow 数量 (${vaultConfig.debtToken})`}
          value={amount}
          onChange={setAmount}
          maxAmount={maxAmount}
        />
      </div>

      {/* Preview */}
      {previewData && positionInfo && (
        <PreviewCard
          rows={[
            { label: 'LTV', currentValue: `${positionInfo.ltv!.toFixed(1)}%`, newValue: `${previewData.newLtv.toFixed(1)}%`, colorClass: ltvColor(previewData.newLtv) },
            { label: '抵押品', currentValue: `${positionInfo.collateralAmountUi.toFixed(2)} ${vaultConfig.collateralToken}`, newValue: `${previewData.newCollateral.toFixed(2)} ${vaultConfig.collateralToken}` },
            { label: '债务', currentValue: `${positionInfo.debtAmountUi.toFixed(2)} ${vaultConfig.debtToken}`, newValue: `${previewData.newDebt.toFixed(2)} ${vaultConfig.debtToken}` },
          ]}
          warning={previewData.exceedsMax ? `LTV 将超过安全阈值 78%` : undefined}
        />
      )}

      {/* Advanced settings */}
      <AdvancedSettings {...settings} onChange={(partial) => setSettings((prev) => ({ ...prev, ...partial }))} />

      {/* Execute */}
      <Button
        onClick={handleExecute}
        disabled={!publicKey || isLoading || !amount || selectedPositionId === null}
        className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
        size="lg"
      >
        {isLoading ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />执行中...</>
        ) : (
          <><Zap className="mr-2 h-4 w-4" />执行加杠杆</>
        )}
      </Button>

      {/* Warning */}
      {publicKey && amount && (
        <div className="p-3 rounded-lg bg-yellow-950/20 border border-yellow-800/50">
          <p className="text-xs text-yellow-400 mb-1">⚠️ 注意事项:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs text-yellow-300/80">
            <li>Flash Loan 原子操作，要么全部成功，要么全部失败</li>
            <li>确保钱包有足够的 SOL 支付交易费（约 0.001-0.005 SOL）</li>
            <li>交易不可逆，请仔细检查参数</li>
          </ul>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/operations/LeveragePanel.tsx
git commit -m "feat(ui): create LeveragePanel component"
```

---

### Task 9: Create operations/DeleveragePanel.tsx

**Files:**
- Create: `components/operations/DeleveragePanel.tsx`

**Step 1: Create the component**

Deleverage (减杠杆) panel. Similar structure to LeveragePanel but with deleverage-specific logic: borrows collateral (JLP), swaps to debt token, repays debt.

```tsx
// components/operations/DeleveragePanel.tsx
'use client';

import { useState, useMemo, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/common/AmountInput';
import { PreviewCard } from '@/components/common/PreviewCard';
import { AdvancedSettings, AdvancedSettingsState } from './AdvancedSettings';
import { useToast } from '@/hooks/use-toast';
import { PositionInfo } from '@/lib/position';
import { VaultConfig } from '@/lib/vaults';

interface DeleveragePanelProps {
  positionInfo: PositionInfo | null;
  vaultConfig: VaultConfig;
  selectedPositionId: number | null;
  onSuccess: () => void;
  onPreviewChange?: (preview: { ltv?: number; collateral?: number; debt?: number } | null) => void;
}

export function DeleveragePanel({ positionInfo, vaultConfig, selectedPositionId, onSuccess, onPreviewChange }: DeleveragePanelProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();

  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<AdvancedSettingsState>({
    slippageBps: 5,
    priorityFee: 'default',
    selectedDexes: [],
    onlyDirectRoutes: false,
    useJitoBundle: false,
    maxAccounts: 32,
  });

  // Max amount: min(currentCollateral, currentDebt / price)
  const maxAmount = useMemo(() => {
    if (!positionInfo || !positionInfo.ltv) return 0;
    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;
    if (currentCollateral === 0 || positionInfo.ltv === 0 || currentDebt === 0) return 0;
    const currentPrice = currentDebt / (currentCollateral * positionInfo.ltv / 100);
    if (currentDebt === 0) return currentCollateral;
    return Math.min(currentCollateral, currentDebt / currentPrice);
  }, [positionInfo]);

  // Preview
  const previewData = useMemo(() => {
    if (!positionInfo || !amount || isNaN(parseFloat(amount)) || positionInfo.ltv === undefined) return null;
    const amountNum = parseFloat(amount);
    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;
    if (currentCollateral === 0 || positionInfo.ltv === 0 || currentDebt === 0) return null;
    const currentPrice = currentDebt / (currentCollateral * positionInfo.ltv / 100);

    const newCollateral = currentCollateral - amountNum;
    const newDebt = currentDebt - (amountNum * currentPrice);
    const newLtv = newCollateral > 0 && newDebt > 0 ? (newDebt / (newCollateral * currentPrice)) * 100 : 0;

    return { newCollateral, newDebt, newLtv, exceedsMax: newLtv > vaultConfig.maxLtv };
  }, [positionInfo, amount, vaultConfig.maxLtv]);

  // Notify parent
  useMemo(() => {
    if (onPreviewChange) {
      onPreviewChange(previewData ? { ltv: previewData.newLtv, collateral: previewData.newCollateral, debt: previewData.newDebt } : null);
    }
  }, [previewData, onPreviewChange]);

  const handleExecute = useCallback(async () => {
    if (!publicKey || !signTransaction || !amount || selectedPositionId === null) return;

    if (settings.onlyDirectRoutes) {
      toast({ title: '⚠️ 使用直接路由', description: '直接路由可能导致较高磨损，请注意检查交易详情' });
    }

    setIsLoading(true);
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const collateralMintPk = new PublicKey(vaultConfig.collateralMint);
      const debtMintPk = new PublicKey(vaultConfig.debtMint);

      let transaction: any;
      let transactions: any[] = [];
      let positionId: any;
      let swapQuote: any;

      if (settings.useJitoBundle) {
        toast({ title: '正在构建 Jito Bundle (3 TX)', description: 'Withdraw → Swap → Repay' });
        const { buildDeleverageJitoBundle } = await import('@/lib/deleverage-jito-bundle');
        const result = await buildDeleverageJitoBundle({
          collateralMint: collateralMintPk, debtMint: debtMintPk, withdrawAmount: parseFloat(amount),
          userPublicKey: publicKey, vaultId: vaultConfig.id, positionId: selectedPositionId, connection,
          slippageBps: settings.slippageBps, preferredDexes: settings.selectedDexes.length > 0 ? settings.selectedDexes : undefined,
          onlyDirectRoutes: settings.onlyDirectRoutes, maxAccounts: settings.maxAccounts,
          debtDecimals: vaultConfig.debtDecimals, collateralDecimals: vaultConfig.collateralDecimals,
        });
        transactions = result.transactions; positionId = result.positionId; swapQuote = result.swapQuote;
      } else {
        toast({ title: '正在构建 Flash Loan 交易', description: 'Flash Borrow → Swap → Repay → Flash Payback' });
        const { buildDeleverageFlashLoanSwap } = await import('@/lib/deleverage-flashloan-swap');
        const result = await buildDeleverageFlashLoanSwap({
          collateralMint: collateralMintPk, debtMint: debtMintPk, flashLoanAmount: parseFloat(amount),
          userPublicKey: publicKey, vaultId: vaultConfig.id, positionId: selectedPositionId, connection,
          slippageBps: settings.slippageBps, preferredDexes: settings.selectedDexes.length > 0 ? settings.selectedDexes : undefined,
          onlyDirectRoutes: settings.onlyDirectRoutes, maxAccounts: settings.maxAccounts, useJitoBundle: false,
          debtDecimals: vaultConfig.debtDecimals, collateralDecimals: vaultConfig.collateralDecimals,
        });
        transaction = result.transaction; positionId = result.positionId; swapQuote = result.swapQuote;
      }

      // Price warning
      let priceWarning = '';
      if (swapQuote && positionInfo) {
        const debtScale = Math.pow(10, vaultConfig.debtDecimals);
        const collateralScale = Math.pow(10, vaultConfig.collateralDecimals);
        const inputAmt = parseInt(swapQuote.inputAmount) / collateralScale;
        const outputAmt = parseInt(swapQuote.outputAmount) / debtScale;
        const tradePrice = outputAmt / inputAmt;
        if (positionInfo.oraclePrice) {
          const oraclePrice = positionInfo.oraclePrice;
          const deviation = ((tradePrice - oraclePrice) / oraclePrice) * 100;
          priceWarning = `\n📊 预言机价格: $${oraclePrice.toFixed(4)}\n💱 交易价格: $${tradePrice.toFixed(4)}\n📉 价格偏差: ${deviation > 0 ? '+' : ''}${deviation.toFixed(2)}%\n⚠️ 请检查价格是否合理`;
        } else {
          priceWarning = `\n💱 交易价格: $${tradePrice.toFixed(4)} ${vaultConfig.debtToken}/${vaultConfig.collateralToken}\n⚠️ 请检查价格是否合理`;
        }
      }

      toast({ title: '请在钱包中确认交易', description: settings.useJitoBundle ? `需要签名 3 个交易${priceWarning}` : `正在等待签名...${priceWarning}` });

      let signedTransactions: any[] = [];
      if (settings.useJitoBundle) {
        for (const tx of transactions) signedTransactions.push(await signTransaction(tx));
      } else {
        signedTransactions = [await signTransaction(transaction)];
      }

      let signature: string;
      if (settings.useJitoBundle) {
        toast({ title: '正在通过 Jito Bundle 发送', description: `发送 ${signedTransactions.length} 个交易的原子 Bundle...` });
        const { sendJitoMultiTxBundle } = await import('@/lib/jito-bundle');
        signature = await sendJitoMultiTxBundle(connection, signedTransactions);
      } else {
        toast({ title: '正在发送交易', description: '请稍候...' });
        signature = await connection.sendTransaction(signedTransactions[0], { skipPreflight: false, preflightCommitment: 'confirmed' });
      }

      toast({ title: '正在确认交易', description: '这可能需要几秒钟...' });
      await connection.confirmTransaction(signature, 'confirmed');

      toast({
        title: 'Deleverage + Swap 执行成功！',
        description: (
          <div className="mt-2 space-y-1">
            {positionId && <p>Position ID: {positionId}</p>}
            <p>交易签名: {signature.slice(0, 8)}...{signature.slice(-8)}</p>
            <a href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs">在 Solscan 上查看</a>
          </div>
        ),
      });

      setAmount('');
      onSuccess();
    } catch (error: any) {
      console.error('Deleverage error:', error);
      const isTxTooLarge = error.message && (error.message.includes('Transaction exceeds maximum size') || error.message.includes('Transaction too large'));
      if (isTxTooLarge) {
        const suggestions = [];
        if (settings.maxAccounts > 20) suggestions.push(`降低「最大账户数」到 ${settings.maxAccounts === 32 ? 28 : settings.maxAccounts === 28 ? 24 : 20}`);
        if (!settings.onlyDirectRoutes) suggestions.push('切换到「仅直接路由」');
        if (!settings.useJitoBundle) suggestions.push('启用 Jito Bundle');
        toast({ title: '⚠️ 交易过大（超过 1232 bytes）', description: `请在高级设置中尝试：${suggestions.join('、')}`, variant: 'destructive' });
      } else {
        toast({ title: '闪电贷执行失败', description: error.message || '发生未知错误', variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, amount, selectedPositionId, settings, vaultConfig, connection, positionInfo, toast, onSuccess]);

  const ltvColor = (v: number) => v < 70 ? 'text-green-400' : v < vaultConfig.maxLtv ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {positionInfo && (
        <div className="text-xs text-slate-400">
          当前: {vaultConfig.name} #{selectedPositionId}
        </div>
      )}

      <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800">
        <AmountInput
          label={`Flash Borrow 数量 (${vaultConfig.collateralToken})`}
          value={amount}
          onChange={setAmount}
          maxAmount={maxAmount}
        />
      </div>

      {previewData && positionInfo && (
        <PreviewCard
          rows={[
            { label: 'LTV', currentValue: `${positionInfo.ltv!.toFixed(1)}%`, newValue: `${previewData.newLtv.toFixed(1)}%`, colorClass: ltvColor(previewData.newLtv) },
            { label: '抵押品', currentValue: `${positionInfo.collateralAmountUi.toFixed(2)} ${vaultConfig.collateralToken}`, newValue: `${previewData.newCollateral.toFixed(2)} ${vaultConfig.collateralToken}` },
            { label: '债务', currentValue: `${positionInfo.debtAmountUi.toFixed(2)} ${vaultConfig.debtToken}`, newValue: `${previewData.newDebt.toFixed(2)} ${vaultConfig.debtToken}` },
          ]}
          warning={previewData.exceedsMax ? `LTV 将超过最大值 ${vaultConfig.maxLtv}%` : undefined}
        />
      )}

      <AdvancedSettings {...settings} onChange={(partial) => setSettings((prev) => ({ ...prev, ...partial }))} />

      <Button
        onClick={handleExecute}
        disabled={!publicKey || isLoading || !amount || selectedPositionId === null}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
        size="lg"
      >
        {isLoading ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />执行中...</>
        ) : (
          <><Zap className="mr-2 h-4 w-4" />执行减杠杆</>
        )}
      </Button>

      {publicKey && amount && (
        <div className="p-3 rounded-lg bg-yellow-950/20 border border-yellow-800/50">
          <p className="text-xs text-yellow-400 mb-1">⚠️ 注意事项:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs text-yellow-300/80">
            <li>Flash Loan 原子操作，要么全部成功，要么全部失败</li>
            <li>确保钱包有足够的 SOL 支付交易费（约 0.001-0.005 SOL）</li>
            <li>交易不可逆，请仔细检查参数</li>
          </ul>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/operations/DeleveragePanel.tsx
git commit -m "feat(ui): create DeleveragePanel component"
```

---

### Task 10: Create operations/RebalancePanel.tsx

**Files:**
- Create: `components/operations/RebalancePanel.tsx`

**Step 1: Create the component**

Rebalance panel. Extracts from FlashLoanInterface.tsx lines 1288-1420 + related logic (lines 688-944).

```tsx
// components/operations/RebalancePanel.tsx
'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Loader2, ArrowRightLeft } from 'lucide-react';
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
          const positions = await findUserPositionsByNFT(connection, vault.id, publicKey, 100000);
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
        toast({ title: 'Rebalance 成功！', description: `单笔原子交易: ${sig.slice(0, 8)}...` });
      } else {
        toast({ title: '请签名 2 个交易（Jito Bundle）' });
        const signed = [];
        for (const tx of result.transactions) signed.push(await signTransaction(tx));
        const bundleId = await sendJitoMultiTxBundle(connection, signed);
        toast({ title: 'Rebalance Bundle 已发送', description: `Bundle: ${bundleId.slice(0, 8)}...` });
      }

      setAmount('');
      loadAllSameCollateralPositions(currentVaultConfig.collateralMint);
      onSuccess();
    } catch (e: any) {
      toast({ title: 'Rebalance 失败', description: e.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, sourceVaultId, targetVaultId, amount, allPositions, currentVaultConfig, connection, toast, onSuccess, loadAllSameCollateralPositions]);

  return (
    <div className="space-y-4 p-4 rounded-lg bg-slate-950/50 border border-slate-800">
      {/* Cache age warning */}
      {positionCacheAge && positionCacheAge > 60 * 60 * 1000 && (
        <div className="flex items-center justify-between p-2 rounded bg-yellow-900/20 border border-yellow-700/30 text-xs">
          <span className="text-yellow-400">仓位数据缓存于 {Math.floor(positionCacheAge / (1000 * 60 * 60))} 小时前</span>
          <button onClick={() => loadAllSameCollateralPositions(currentVaultConfig.collateralMint, true)} className="text-yellow-300 hover:text-yellow-100 underline">刷新</button>
        </div>
      )}

      {isLoadingAllPositions ? (
        <div className="flex items-center justify-center gap-2 text-slate-400 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">正在搜索同抵押品池子的仓位...</span>
        </div>
      ) : rebalanceVaults.length < 2 ? (
        <div className="text-center py-4">
          <p className="text-slate-400 text-sm">需要在至少 2 个同抵押品池子中有仓位才能 Rebalance</p>
          <p className="text-xs text-slate-500 mt-1">找到 {rebalanceVaults.length} 个有仓位的池子（{currentVaultConfig.collateralToken} 抵押品）</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Source */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">转出池（健康的）</Label>
            <Select value={sourceVaultId?.toString() ?? ''} onValueChange={(val) => setSourceVaultId(parseInt(val))}>
              <SelectTrigger className="bg-slate-900/70 border-slate-700 text-sm"><SelectValue placeholder="选择转出池" /></SelectTrigger>
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
            <Label className="text-slate-300 text-sm">转入池（需要补充的）</Label>
            <Select value={targetVaultId?.toString() ?? ''} onValueChange={(val) => setTargetVaultId(parseInt(val))}>
              <SelectTrigger className="bg-slate-900/70 border-slate-700 text-sm"><SelectValue placeholder="选择转入池" /></SelectTrigger>
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
            <Label className="text-slate-300 text-sm">转移数量 ({currentVaultConfig.collateralToken})</Label>
            <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-slate-900 border-slate-700 text-white" step="0.01" />
          </div>

          {/* Preview */}
          {rebalancePreview && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-slate-900/30 border border-slate-700/40">
                <div className="text-xs text-slate-500 mb-1">转出池 LTV</div>
                <div className={`font-bold ${rebalancePreview.sourceLtv > 85 ? 'text-red-400' : rebalancePreview.sourceLtv > 75 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {allPositions[sourceVaultId!]?.ltv?.toFixed(1) ?? '?'}% → {rebalancePreview.sourceLtv === Infinity ? '∞' : rebalancePreview.sourceLtv.toFixed(1)}%
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/30 border border-slate-700/40">
                <div className="text-xs text-slate-500 mb-1">转入池 LTV</div>
                <div className={`font-bold ${rebalancePreview.targetLtv > 85 ? 'text-red-400' : rebalancePreview.targetLtv > 75 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {allPositions[targetVaultId!]?.ltv?.toFixed(1) ?? '?'}% → {rebalancePreview.targetLtv.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {/* Execute */}
          <Button
            onClick={handleRebalance}
            disabled={!publicKey || isLoading || !sourceVaultId || !targetVaultId || !amount}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            size="lg"
          >
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />执行中...</>
            ) : (
              <><ArrowRightLeft className="mr-2 h-4 w-4" />执行 Rebalance（跨池平衡）</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/operations/RebalancePanel.tsx
git commit -m "feat(ui): create RebalancePanel component"
```

---

### Task 11: Create operations/OperationTabs.tsx

**Files:**
- Create: `components/operations/OperationTabs.tsx`

**Step 1: Create the component**

Three-tab container that renders the correct operation panel.

```tsx
// components/operations/OperationTabs.tsx
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
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/operations/OperationTabs.tsx
git commit -m "feat(ui): create OperationTabs three-tab container"
```

---

### Task 12: Rewrite FlashLoanInterface.tsx as thin container

**Files:**
- Modify: `components/FlashLoanInterface.tsx` (rewrite)

**Step 1: Rewrite the component**

Replace the entire 1765-line file with a ~150-line thin container that wires together PositionList, OperationTabs, and PositionManageDialog.

```tsx
// components/FlashLoanInterface.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletButton } from '@/components/WalletButton';
import { Card, CardContent } from '@/components/ui/card';
import { Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getVaultConfig, setDiscoveredVaults, DEFAULT_VAULT_ID } from '@/lib/vaults';
import { discoverAllVaults, onVaultsRefreshed, DiscoveredVault } from '@/lib/vault-discovery';
import { fetchPositionInfo, PositionInfo } from '@/lib/position';
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

  // Find all user positions across discovered vaults
  const findPositions = useCallback(async () => {
    if (!publicKey || discoveredVaults.length === 0) return;

    setIsFinding(true);
    try {
      const { findUserPositionsByNFT } = await import('@/lib/find-positions-nft');
      const entries: PositionEntry[] = [];

      for (const vault of discoveredVaults) {
        try {
          const positionIds = await findUserPositionsByNFT(connection, vault.id, publicKey, 100000);
          for (const pid of positionIds) {
            const info = await fetchPositionInfo(connection, vault.id, pid, publicKey);
            if (info) {
              entries.push({ position: info, vaultConfig: getVaultConfig(vault.id) });
            }
          }
        } catch {
          // skip failed vaults
        }
      }

      setPositions(entries);
      if (entries.length > 0 && !selectedKey) {
        setSelectedKey(`${entries[0].vaultConfig.id}-${entries[0].position.positionId}`);
      }

      toast({
        title: entries.length > 0 ? '找到仓位' : '未找到仓位',
        description: entries.length > 0
          ? `找到 ${entries.length} 个仓位`
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

  // Auto-find positions when wallet connects
  useEffect(() => {
    if (publicKey && discoveredVaults.length > 0 && positions.length === 0) {
      findPositions();
    }
  }, [publicKey, discoveredVaults.length]);

  // Clear state on disconnect
  useEffect(() => {
    if (!publicKey) {
      setPositions([]);
      setSelectedKey(null);
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
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds. Fix any TypeScript errors that arise from prop mismatches.

**Step 3: Verify existing tests still pass**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 7 files, 52 tests passing (these are lib/ tests, should be unaffected)

**Step 4: Commit**

```bash
git add components/FlashLoanInterface.tsx
git commit -m "refactor(ui): rewrite FlashLoanInterface as thin container

Replace 1765-line monolithic component with ~150-line container that
composes PositionList, OperationTabs, and PositionManageDialog.
All business logic in lib/ unchanged."
```

---

### Task 13: Final verification and cleanup

**Step 1: Full build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors

**Step 2: Full test suite**

Run: `npx vitest run`
Expected: 7 files, 52 tests passing

**Step 3: Check for unused imports or dead code in old FlashLoanInterface**

Grep the worktree for any remaining references to removed functions/state that may have been missed:

Run: `grep -r "operationType\|rebalanceSourceVaultId\|rebalanceTargetVaultId\|allPositions\|positionCacheAge" components/ --include="*.tsx" -l`
Expected: Only the new component files that properly use these

**Step 4: Verify the component tree is clean**

Run: `find components/ -name "*.tsx" | sort`
Expected:
```
components/FlashLoanInterface.tsx
components/PositionManageDialog.tsx
components/WalletButton.tsx
components/WalletProvider.tsx
components/common/AmountInput.tsx
components/common/LtvProgressBar.tsx
components/common/PreviewCard.tsx
components/operations/AdvancedSettings.tsx
components/operations/DeleveragePanel.tsx
components/operations/LeveragePanel.tsx
components/operations/OperationTabs.tsx
components/operations/RebalancePanel.tsx
components/position/PositionCard.tsx
components/position/PositionFilters.tsx
components/position/PositionList.tsx
components/ui/button.tsx
components/ui/card.tsx
components/ui/dialog.tsx
components/ui/input.tsx
components/ui/label.tsx
components/ui/popover.tsx
components/ui/select.tsx
components/ui/slider.tsx
components/ui/toast.tsx
components/ui/toaster.tsx
components/ui/tooltip.tsx
```

**Step 5: Commit any cleanup**

```bash
git add -A
git commit -m "chore: final cleanup after UI restructure"
```
