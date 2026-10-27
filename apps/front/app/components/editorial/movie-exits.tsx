import {languageName} from '@/lib/languages';

function exitLinks(
  movieUid: string,
  originalLanguage: string,
  releaseDate: string | undefined,
): Array<{href: string; label: string}> {
  const links = [];
  if (originalLanguage) {
    links.push({
      href: `/languages/${originalLanguage}`,
      label: `${languageName(originalLanguage)}の映画`,
    });
  }

  const monthDay = /^\d{4}-(\d{2})-(\d{2})$/.exec(releaseDate ?? '');
  if (monthDay) {
    links.push({
      href: `/on-this-day?d=${monthDay[1]}-${monthDay[2]}`,
      label: `${Number(monthDay[1])}月${Number(monthDay[2])}日に初公開された映画`,
    });
  }

  links.push(
    {href: '/double-feature', label: '今日の二本立て'},
    {href: '/tonight', label: '今夜90分の1本'},
    {
      href: `/connect?from=${movieUid}`,
      label: 'この映画から別の映画への距離',
    },
    {href: '/shiritori', label: '今日の映画しりとり'},
  );
  return links;
}

export function MovieExits({
  movieUid,
  originalLanguage,
  releaseDate,
}: {
  movieUid: string;
  originalLanguage: string;
  releaseDate: string | undefined;
}) {
  return (
    <section className="mb-8">
      <p className="mb-3 font-label text-xs text-ink-muted">この映画から辿る</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {exitLinks(movieUid, originalLanguage, releaseDate).map(link => (
          <li key={link.href}>
            <a
              href={link.href}
              className="inline-block border border-ink px-3 py-1.5 font-label text-xs font-bold text-ink no-underline">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
