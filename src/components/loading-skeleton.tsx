export function LoadingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse space-y-4 px-4 py-5 md:px-8 md:py-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-slate-200" />
          <div className="h-4 w-32 rounded-lg bg-slate-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-11 w-24 rounded-2xl bg-slate-200" />
          <div className="h-11 w-24 rounded-2xl bg-slate-100" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <div className="h-6 w-24 rounded-lg bg-slate-200" />
              <div className="h-8 w-8 rounded-full bg-slate-100" />
            </div>
            <div className="mt-4 h-3 w-full rounded-full bg-slate-100" />
            <div className="mt-2 h-3 w-2/3 rounded-full bg-slate-100" />
            <div className="mt-4 flex gap-2">
              <div className="h-6 w-16 rounded-full bg-slate-100" />
              <div className="h-6 w-20 rounded-full bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
