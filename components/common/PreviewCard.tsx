import { ArrowRight, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    <Card className="border-border bg-secondary">
      <CardContent className="p-3 space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-foreground/80">{row.currentValue}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
              <span className={cn('font-mono', row.colorClass ?? 'text-foreground')}>
                {row.newValue}
              </span>
            </div>
          </div>
        ))}
        {warning && (
          <Alert variant="warning" className="py-2 mt-1">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-xs">{warning}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
