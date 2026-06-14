export default function Loading() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 rounded-xl bg-[var(--surface-soft)]" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card !p-3 space-y-1.5">
          <div className="h-4 w-3/4 rounded-full bg-[var(--surface-soft)]" />
          <div className="h-3 w-1/2 rounded-full bg-[var(--surface-soft)]" />
          <div className="flex gap-2 pt-1">
            <div className="h-6 w-16 rounded-md bg-[var(--surface-soft)]" />
            <div className="h-6 w-16 rounded-md bg-[var(--surface-soft)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
