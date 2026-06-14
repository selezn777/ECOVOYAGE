export default function Loading() {
  return (
    <div className="space-y-4">
      {/* Date tabs skeleton */}
      <div className="flex overflow-hidden rounded-xl ring-1 ring-[var(--border)] animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1 py-2.5 bg-[var(--surface-soft)]">
            <div className="h-3.5 w-16 rounded-full bg-[var(--border)]" />
            <div className="h-2.5 w-20 rounded-full bg-[var(--border)]" />
          </div>
        ))}
      </div>
      {/* Tour cards skeleton */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl ring-1 ring-[var(--border)] animate-pulse">
          <div className="bg-[var(--surface)] px-3 py-3 space-y-2">
            <div className="flex justify-between gap-2">
              <div className="h-4 w-2/3 rounded-full bg-[var(--surface-soft)]" />
              <div className="h-5 w-10 shrink-0 rounded-lg bg-[var(--surface-soft)]" />
            </div>
            <div className="h-3 w-1/3 rounded-full bg-[var(--surface-soft)]" />
          </div>
          <div className="flex gap-1.5 border-t border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
            <div className="h-5 w-20 rounded-md bg-[var(--border)]" />
            <div className="h-5 w-20 rounded-md bg-[var(--border)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
