export function MovieDetailErrorView({
  error,
  status,
}: {
  error: string;
  status?: number;
}) {
  const title =
    status === 404 ? '映画が見つかりません' : 'エラーが発生しました';

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="max-w-md w-full bg-surface border-2 border-ink p-6">
        <h1 className="text-xl font-bold text-brand mb-4">{title}</h1>
        <p className="text-ink mb-6">{error}</p>
        <a
          href="/"
          className="inline-block border-2 border-ink px-4 py-2 font-mono text-sm shadow-[2px_2px_0_var(--ink)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all">
          ← SHINE
        </a>
      </div>
    </div>
  );
}
