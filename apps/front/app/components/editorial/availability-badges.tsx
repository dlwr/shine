export type AvailabilityInfo = {
  source: string;
  detail?: string;
  checkedAt: number;
};

type AvailabilityBadgesProperties = {
  availability?: AvailabilityInfo[];
  className?: string;
  movieTitle?: string;
  tmdbId?: number | string;
};

export type WatchTarget = {
  movieTitle?: string;
  tmdbId?: number | string;
};

type Badge = {
  label: string;
  title?: string;
  href?: string;
  form?: {action: string; charset: string; field: string; value: string};
};

const RENTAL_FORMS = {
  discas: {
    action: 'https://movie-tsutaya.tsite.jp/netdvd/dvd/searchDvdBd.do',
    charset: 'Shift_JIS',
    field: 'k',
  },
  geo: {
    action: 'https://rental.geo-online.co.jp/search2/',
    charset: 'euc-jp',
    field: 'q',
  },
} as const;

function watchHref(target: WatchTarget, service?: string): string | undefined {
  if (!target.movieTitle) {
    return undefined;
  }

  if (service === 'U-NEXT') {
    return `https://video.unext.jp/freeword?query=${encodeURIComponent(target.movieTitle)}`;
  }

  if (target.tmdbId) {
    return `https://www.themoviedb.org/movie/${target.tmdbId}/watch?locale=JP`;
  }

  return `https://www.justwatch.com/jp/検索?q=${encodeURIComponent(target.movieTitle)}`;
}

// tmdbソースのdetail形式: "U-NEXT(見放題), Amazon Video(レンタル), ..."
function parseTmdbOfferings(detail: string): Array<{
  service: string;
  kind: string;
}> {
  return detail
    .split(', ')
    .map(entry =>
      /^(?<service>.+)\((?<kind>見放題|レンタル|購入)\)$/.exec(entry),
    )
    .filter(match => match !== null)
    .map(match => ({
      service: match.groups!.service,
      kind: match.groups!.kind,
    }));
}

export function buildBadges(
  availability: AvailabilityInfo[],
  target: WatchTarget = {},
): Badge[] {
  const badges: Badge[] = [];

  const tmdb = availability.find(entry => entry.source === 'tmdb');
  const offerings = tmdb?.detail ? parseTmdbOfferings(tmdb.detail) : [];
  const subscriptionServices = [
    ...new Set(
      offerings
        .filter(offering => offering.kind === '見放題')
        .map(offering => offering.service),
    ),
  ];
  for (const service of subscriptionServices) {
    badges.push({
      label: `${service} 見放題`,
      title: tmdb?.detail,
      href: watchHref(target, service),
    });
  }

  const paidOfferings = offerings.filter(
    offering => offering.kind !== '見放題',
  );
  if (subscriptionServices.length === 0 && paidOfferings.length > 0) {
    badges.push({
      label: 'レンタル配信あり',
      title: paidOfferings
        .map(offering => `${offering.service}(${offering.kind})`)
        .join(', '),
      href: watchHref(target),
    });
  }

  const unext = availability.find(entry => entry.source === 'unext');
  if (unext && !subscriptionServices.includes('U-NEXT')) {
    badges.push({
      label: 'U-NEXT',
      title: unext.detail,
      href: watchHref(target, 'U-NEXT'),
    });
  }

  const hasDiscas = availability.some(entry => entry.source === 'discas');
  const rentalLabels = [
    hasDiscas ? 'TSUTAYA DISCAS' : undefined,
    availability.some(entry => entry.source === 'geo')
      ? 'ゲオ宅配レンタル'
      : undefined,
  ].filter(label => label !== undefined);
  if (rentalLabels.length > 0) {
    const rentalForm = hasDiscas ? RENTAL_FORMS.discas : RENTAL_FORMS.geo;
    badges.push({
      label: '宅配レンタル',
      title: rentalLabels.join(' / '),
      form: target.movieTitle
        ? {...rentalForm, value: target.movieTitle}
        : undefined,
    });
  }

  return badges;
}

const BADGE_CLASS =
  'inline-flex items-center rounded-sm border border-ink-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted';

const ACTION_BADGE_CLASS = `${BADGE_CLASS} border-ink text-ink underline decoration-dotted underline-offset-2 hover:bg-ink hover:text-surface transition-colors`;

function formatCheckedDate(checkedAt: number): string {
  return new Date(checkedAt * 1000).toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Tokyo',
  });
}

export function AvailabilityBadges({
  availability,
  className = '',
  movieTitle,
  tmdbId,
}: AvailabilityBadgesProperties) {
  if (!availability || availability.length === 0) {
    return;
  }

  const badges = buildBadges(availability, {movieTitle, tmdbId});
  if (badges.length === 0) {
    return;
  }

  const latestCheckedAt = Math.max(
    ...availability.map(entry => entry.checkedAt),
  );

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {badges.map(badge =>
        badge.form ? (
          // DISCAS・ゲオの検索は Shift_JIS / euc-jp のクエリしか受け付けないので、
          // href ではなくフォーム送信でブラウザに変換させる
          <form
            key={badge.label}
            action={badge.form.action}
            method="GET"
            acceptCharset={badge.form.charset}
            target="_blank"
            className="contents">
            <input
              type="hidden"
              name={badge.form.field}
              value={badge.form.value}
            />
            <button
              type="submit"
              title={badge.title}
              className={ACTION_BADGE_CLASS}>
              {badge.label}
            </button>
          </form>
        ) : badge.href ? (
          <a
            key={badge.label}
            href={badge.href}
            title={badge.title}
            target="_blank"
            rel="noopener noreferrer"
            className={ACTION_BADGE_CLASS}>
            {badge.label}
          </a>
        ) : (
          <span key={badge.label} title={badge.title} className={BADGE_CLASS}>
            {badge.label}
          </span>
        ),
      )}
      <span className="font-mono text-[10px] text-ink-muted/70">
        {formatCheckedDate(latestCheckedAt)} 時点
      </span>
    </div>
  );
}
