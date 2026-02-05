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
  maxLabel?: string;
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
