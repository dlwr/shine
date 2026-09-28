type BigYearProperties = {
  year?: number;
  className?: string;
};

export function BigYear({year, className = ''}: BigYearProperties) {
  if (!year) {
    return;
  }

  return (
    <div
      className={`font-display font-bold leading-none tabular-nums ${className}`}>
      {year}
    </div>
  );
}
