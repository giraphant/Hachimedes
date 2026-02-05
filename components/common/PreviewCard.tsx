import { cn } from '@/lib/utils';

interface PreviewRow {
  label: string;
  currentValue: string;
  newValue: string;
  colorClass?: string;
}

interface PreviewCardProps {
  rows: PreviewRow[];
  warning?: string;
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
