import { ArrowRight } from 'lucide-react';
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
        <span className="text-sm text-muted-foreground">健康度 (LTV)</span>
        <div className="flex items-center gap-2">
          <div className={cn('text-4xl font-bold', getColor(ltv))}>
            {ltv.toFixed(1)}%
            <span className="sr-only">当前 LTV {ltv.toFixed(1)}%</span>
          </div>
          {previewLtv !== undefined && (
            <>
              <ArrowRight className="h-5 w-5 text-muted-foreground/40" />
              <div className={cn('text-4xl font-bold', getColor(previewLtv))}>
                {previewLtv.toFixed(1)}%
                <span className="sr-only">预测 LTV {previewLtv.toFixed(1)}%</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className="relative h-3 bg-muted rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={ltv}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`LTV ${ltv.toFixed(1)}%，清算线 ${liquidationLtv}%`}
      >
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all ease-out', getBarColor(ltv))}
          style={{ width: `${Math.min(ltv, 100)}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-red-500/50"
          style={{ left: `${liquidationLtv}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{ltv.toFixed(1)}%</span>
        <span>清算线 {liquidationLtv}%</span>
      </div>
    </div>
  );
}
