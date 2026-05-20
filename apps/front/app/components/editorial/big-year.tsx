type BigYearProperties = {
  year?: number;
  className?: string;
};

export function BigYear({year, className = ''}: BigYearProperties) {
  if (!year) {
    return;
  }

  const text = String(year);
  const head = text.slice(0, Math.max(0, text.length - 2));
  const tail = text.slice(Math.max(0, text.length - 2));

  return (
    <div
      className={`font-display font-black leading-[0.78] tracking-[-0.06em] ${className}`}
      aria-label={text}>
      <span>{head}</span>
      <span className="text-brand">{tail}</span>
    </div>
  );
}
