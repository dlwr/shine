type MetaLineProperties = {
  items: string[];
  className?: string;
};

export function MetaLine({items, className = ''}: MetaLineProperties) {
  if (items.length === 0) {
    return;
  }

  return (
    <p className={`font-mono text-xs text-ink-muted ${className}`}>
      {items.join(' · ')}
    </p>
  );
}
