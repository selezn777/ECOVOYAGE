export default function Loading() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 rounded-xl bg-[var(--surface-soft)]" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card !p-3 space-y-2">
          <div className="flex justify-between gap-2">
            <div className="h-4 w-1/2 rounded-full bg-[var(--surface-soft)]" />
            <div className="h-4 w-16 shrink-0 rounded-full bg-[var(--surface-soft)]" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 flex-1 rounded-lg bg-[var(--surface-soft)]" />
            <div className="h-8 flex-1 rounded-lg bg-[var(--surface-soft)]" />
            <div className="h-8 flex-1 rounded-lg bg-[var(--surface-soft)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
