export default function Loading() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-10 rounded-xl bg-[var(--surface-soft)]" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="card !p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-soft)]" />
              <div className="flex-1 space-y-1">
                <div className="h-3.5 rounded-full bg-[var(--surface-soft)]" />
                <div className="h-2.5 w-2/3 rounded-full bg-[var(--surface-soft)]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
