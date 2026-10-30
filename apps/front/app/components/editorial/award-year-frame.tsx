import type {ReactNode} from 'react';

type AwardYearFrameProperties = {
  year: number;
  ceremonyNumber?: number;
  href?: string;
  aside?: ReactNode;
  children: ReactNode;
};

export function AwardYearFrame({
  year,
  ceremonyNumber,
  href,
  aside,
  children,
}: AwardYearFrameProperties) {
  return (
    <section className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 border-t-2 border-ink pt-2 md:grid-cols-[5rem_minmax(0,1fr)]">
      <div className="pt-1">
        <h2 className="font-display text-xl font-bold leading-none tabular-nums md:text-2xl">
          {href ? (
            <a href={href} className="text-ink no-underline">
              {year}
            </a>
          ) : (
            year
          )}
        </h2>
        {ceremonyNumber && (
          <span className="mt-1 block font-label text-[10px] text-ink-muted">
            第{ceremonyNumber}回
          </span>
        )}
        {aside}
      </div>
      <div>{children}</div>
    </section>
  );
}
