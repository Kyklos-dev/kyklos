export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md bg-slate-200/90 overflow-hidden relative ${className}`}
    >
      <div className="absolute inset-0 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

export function PipelineListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-surface-3 bg-surface-1/80 p-5 animate-slide-up-fade"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <SkeletonLine className="h-4 w-48 mb-3" />
          <SkeletonLine className="h-3 w-72 mb-2" />
          <SkeletonLine className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="mb-6 animate-fade-in">
      <SkeletonLine className="h-8 w-56 mb-2" />
      <SkeletonLine className="h-3 w-32" />
    </div>
  );
}
