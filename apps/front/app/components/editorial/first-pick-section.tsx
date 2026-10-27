import {FilmCard} from './film-card';
import type {FirstPick} from '@/lib/first-pick';

export function FirstPickSection({pick}: {pick: FirstPick}) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 font-label text-xs text-ink-muted">
        まず観るなら（日本で観られる）
      </h2>
      <FilmCard
        movie={pick.movie}
        variant="compact"
        locale="ja"
        label={pick.label}
      />
    </section>
  );
}
