import {useState} from 'react';

const FOLD_THRESHOLD = 100;

export function MovieSynopsis({description}: {description: string}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isFoldable = description.length > FOLD_THRESHOLD;
  const isFolded = isFoldable && !isExpanded;

  return (
    <section className="mb-8">
      <p className="font-label text-xs text-ink-muted mb-3">あらすじ</p>
      <p
        id="movie-synopsis"
        className={`text-sm leading-relaxed text-ink ${isFolded ? 'line-clamp-4' : ''}`}>
        {description}
      </p>
      {isFoldable && (
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls="movie-synopsis"
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          className="mt-2 text-sm font-bold text-ink underline underline-offset-4 cursor-pointer">
          {isExpanded ? '閉じる' : '続きを読む'}
        </button>
      )}
    </section>
  );
}
