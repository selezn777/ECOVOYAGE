export default function Loading() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card animate-pulse space-y-2 !p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="h-4 w-2/3 rounded-full bg-[var(--surface-soft)]" />
            <div className="h-5 w-12 shrink-0 rounded-lg bg-[var(--surface-soft)]" />
          </div>
          <div className="h-3 w-1/3 rounded-full bg-[var(--surface-soft)]" />
          <div className="flex gap-2 pt-1">
            <div className="h-7 flex-1 rounded-lg bg-[var(--surface-soft)]" />
            <div className="h-7 flex-1 rounded-lg bg-[var(--surface-soft)]" />
            <div className="h-7 flex-1 rounded-lg bg-[var(--surface-soft)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
