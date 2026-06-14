export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
      </div>
      <div className="space-y-2.5 w-full max-w-md px-4">
        <div className="h-3 rounded-full bg-[var(--surface-soft)] animate-pulse" />
        <div className="h-3 w-3/4 rounded-full bg-[var(--surface-soft)] animate-pulse" />
        <div className="h-3 w-1/2 rounded-full bg-[var(--surface-soft)] animate-pulse" />
      </div>
    </div>
  );
}
