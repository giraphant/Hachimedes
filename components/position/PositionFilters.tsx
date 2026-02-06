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
  collateralTypes: string[];
  debtTypes: string[];
  selectedCollateral: string;
  selectedDebt: string;
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
        <SelectTrigger className="w-auto bg-secondary border-border text-xs h-8">
          <SelectValue placeholder="抵押品" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">全部</SelectItem>
          {collateralTypes.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedDebt || '__all__'} onValueChange={(v) => onDebtChange(v === '__all__' ? '' : v)}>
        <SelectTrigger className="w-auto bg-secondary border-border text-xs h-8">
          <SelectValue placeholder="债务" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">全部</SelectItem>
          {debtTypes.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sortKey} onValueChange={(v) => onSortChange(v as SortKey)}>
        <SelectTrigger className="w-auto bg-secondary border-border text-xs h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ltv-desc">风险 高→低</SelectItem>
          <SelectItem value="ltv-asc">风险 低→高</SelectItem>
          <SelectItem value="collateral-desc">抵押品 多→少</SelectItem>
          <SelectItem value="debt-desc">债务 多→少</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
