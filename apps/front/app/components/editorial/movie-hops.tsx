import {useState} from 'react';
import {PosterFrame} from '@/components/editorial/poster-frame';
import type {ConnectHopsData} from '@/lib/api-types';

type Hop = ConnectHopsData['hops'][number];

const PAGE_SIZE = 3;

export const ROLE_LABELS: Record<Hop['links'][number]['role'], string> = {
  director: '監督',
  cast: '出演',
  'director-and-cast': '監督と出演',
};

function HopPath({links}: {links: Hop['links']}) {
  return (
    <p className="font-label text-xs text-ink-muted mt-1 break-words">
      {links.map((link, index) => (
        <span key={link.person.uid}>
          {index > 0 && `『${links[index - 1].movie.title}』`}
          <a href={`/people/${link.person.uid}`} className="text-ink-muted">
            {link.person.name}
          </a>
          が{ROLE_LABELS[link.role]}
        </span>
      ))}
    </p>
  );
}

export function MovieHops({hops}: {hops: Hop[]}) {
  const [offset, setOffset] = useState(0);
  if (hops.length === 0) {
    return;
  }

  const shown = Array.from(
    {length: Math.min(PAGE_SIZE, hops.length)},
    (_, index) => hops[(offset + index) % hops.length],
  );
  return (
    <section className="mb-8">
      <p className="font-label text-xs text-ink-muted mb-3">2手先の映画</p>
      <ul className="m-0 list-none p-0">
        {shown.map(hop => {
          const destination = hop.links.at(-1)!.movie;
          return (
            <li
              key={destination.uid}
              className="flex gap-3 border-b border-rule py-3">
              <a href={`/movies/${destination.uid}`} className="shrink-0">
                <PosterFrame
                  posterUrl={hop.posterUrl}
                  alt=""
                  className="w-14"
                  displaySize="w185"
                />
              </a>
              <div className="min-w-0">
                <a
                  href={`/movies/${destination.uid}`}
                  className="font-display font-bold leading-tight break-words no-underline text-ink">
                  『{destination.title}』
                  {destination.year && (
                    <span className="ml-2 font-label text-xs font-normal text-ink-muted">
                      {destination.year}年
                    </span>
                  )}
                </a>
                <HopPath links={hop.links} />
              </div>
            </li>
          );
        })}
      </ul>
      {hops.length > PAGE_SIZE && (
        <button
          type="button"
          onClick={() => {
            setOffset((offset + PAGE_SIZE) % hops.length);
          }}
          className="mt-3 border border-ink px-3 py-1.5 font-label text-xs font-bold text-ink">
          別の道
        </button>
      )}
    </section>
  );
}
