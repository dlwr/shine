import {deliveredPosterUrl} from '@/lib/poster-delivery';
import {posterUrlForDisplay, type PosterDisplaySize} from '@/lib/poster-size';

type PosterFrameProperties = {
  posterUrl?: string;
  alt: string;
  className?: string;
  priority?: boolean;
  displaySize?: PosterDisplaySize;
  transformImages?: boolean;
};

export function PosterFrame({
  posterUrl,
  alt,
  className = '',
  priority = false,
  displaySize = 'w500',
  transformImages = false,
}: PosterFrameProperties) {
  const source = deliveredPosterUrl(
    posterUrlForDisplay(posterUrl, displaySize),
    transformImages,
  );

  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden
        className="absolute -inset-3 blur-lg"
        style={{background: 'var(--poster-glow)'}}
      />
      <div
        className="poster-glow-target relative aspect-2/3 overflow-hidden border border-ink"
        style={{background: 'var(--poster-bg)'}}>
        {source ? (
          <img
            src={source}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'auto' : 'async'}
            fetchPriority={priority ? 'high' : 'auto'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="@container flex h-full items-center justify-center">
            <span className="hidden text-center font-label text-xs leading-snug text-ink-muted @[3rem]:block">
              <span className="inline-block">ポスター</span>
              <span className="inline-block">なし</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
