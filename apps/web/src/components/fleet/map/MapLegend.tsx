/**
 * Map legend overlay showing status color indicators.
 */

export function MapLegend() {
  return (
    <div className="flex gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        Running
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
        Mixed
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
        Error
      </span>
    </div>
  );
}
