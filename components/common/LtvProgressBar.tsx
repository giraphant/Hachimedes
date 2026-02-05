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
