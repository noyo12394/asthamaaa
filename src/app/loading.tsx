export default function Loading() {
  return (
    <div className="min-h-dvh bg-paper" aria-label="Loading PASS Equity Atlas" role="status">
      <div className="h-14 animate-pulse border-b border-hairline bg-surface" />
      <div className="mx-auto grid max-w-6xl gap-4 p-4 md:grid-cols-[260px_1fr]">
        <div className="h-80 animate-pulse rounded-md bg-surface-2" />
        <div className="h-[70vh] animate-pulse rounded-md bg-surface-2" />
      </div>
    </div>
  );
}
