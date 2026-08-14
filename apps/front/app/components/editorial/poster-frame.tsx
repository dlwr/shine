type PosterFrameProperties = {
  posterUrl?: string;
  alt: string;
  placeholderLabel?: string;
  className?: string;
  priority?: boolean;
};

export function PosterFrame({
  posterUrl,
  alt,
  placeholderLabel = 'No Poster',
  className = '',
  priority = false,
}: PosterFrameProperties) {
  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden
        className="absolute -inset-3 blur-lg"
        style={{background: 'var(--poster-glow)'}}
      />
      <div
        className="poster-glow-target relative aspect-2/3 overflow-hidden border-2 border-ink"
        style={{background: 'var(--poster-bg)'}}>
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'auto' : 'async'}
            fetchPriority={priority ? 'high' : 'auto'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-xs text-ink-muted">
            {placeholderLabel}
          </div>
        )}
      </div>
    </div>
  );
}
