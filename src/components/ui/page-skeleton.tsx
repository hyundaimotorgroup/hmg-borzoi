export function PageSkeleton() {
  return (
    <div className="p-8 space-y-4">
      <div className="h-8 w-48 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
      <div className="h-4 w-96 bg-gray-100 dark:bg-slate-800 rounded animate-pulse" />
      <div className="grid grid-cols-3 gap-4 mt-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-100 dark:bg-slate-800 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}
