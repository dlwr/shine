import type {Route} from './+types/people.uncrowned';
import {Masthead} from '@/components/editorial/masthead';
import {PersonPortrait} from '@/components/editorial/person-portrait';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {resolveApiUrl} from '@/lib/api';

type UncrownedAward = {
  slug: string;
  name: string;
  shortLabel: string;
  organization: string;
};

type UncrownedLoss = {
  slug: string;
  year: number;
};

type UncrownedPerson = {
  uid: string;
  name: string;
  profilePath?: string;
  losses: UncrownedLoss[];
};

type PersonUncrownedData = {
  nominatedPersonCount: number;
  uncrownedPersonCount: number;
  awards: UncrownedAward[];
  topPeople: UncrownedPerson[];
};

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = loaderData as {locale?: Locale};

  return buildSocialMeta({
    title: '無冠の映画人 | SHINE',
    description:
      '監督賞・演技賞にノミネートされながら、一度も受賞していない映画人。SHINEが記録する個人賞で最も多く敗れた人たちの一覧。',
    path: '/people/uncrowned',
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl = resolveApiUrl(context);

  const response = await fetch(`${apiUrl}/people/uncrowned?locale=${locale}`, {
    signal: request.signal,
  });
  if (!response.ok) {
    throw new Response('Failed to load uncrowned people', {status: 502});
  }

  const body = (await response.json()) as PersonUncrownedData;
  return {...body, locale};
}

function LossTags({
  losses,
  awards,
}: {
  losses: UncrownedLoss[];
  awards: UncrownedAward[];
}) {
  const labels = new Map(
    awards.map(award => [award.slug, `${award.shortLabel}${award.name}`]),
  );

  return (
    <div className="flex flex-wrap gap-1">
      {losses.map(loss => (
        <a
          key={`${loss.slug}:${loss.year}`}
          href={`/awards/${loss.slug}`}
          className="border border-ink-muted px-1 py-0.5 font-mono text-[10px] text-ink-muted no-underline">
          {labels.get(loss.slug) ?? loss.slug} {loss.year}
        </a>
      ))}
    </div>
  );
}

export default function PeopleUncrowned({loaderData}: Route.ComponentProps) {
  const {
    nominatedPersonCount,
    uncrownedPersonCount,
    awards,
    topPeople,
    locale,
  } = loaderData as PersonUncrownedData & {locale: Locale};
  const [leader, ...rest] = topPeople;
  const uncrownedShare =
    nominatedPersonCount > 0
      ? ((uncrownedPersonCount / nominatedPersonCount) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="mb-2 font-display text-2xl font-black tracking-tight md:text-3xl">
          UNCROWNED PEOPLE
        </h1>
        <p className="mb-8 font-mono text-xs text-ink-muted">
          一度も勝てなかった映画人たち
        </p>

        <section className="mb-10 border-t-2 border-b-2 border-ink py-4">
          <p className="font-display text-sm leading-relaxed md:text-base">
            監督賞と演技賞は、映画ではなく人を選ぶ。
            <br />
            だが個人賞にノミネートされた
            {nominatedPersonCount.toLocaleString('en-US')}人のうち
            <span className="font-black text-brand">
              {uncrownedPersonCount.toLocaleString('en-US')}人
            </span>
            ——
            <span className="font-black">{uncrownedShare}%</span>
            ——は、まだ一度も呼ばれていない。
            <br />
            ここは、その名前たちの頁。
          </p>
        </section>

        {leader && (
          <section className="mb-10 border-2 border-ink p-4 shadow-[6px_6px_0_var(--brand)]">
            <p className="mb-3 font-mono text-xs text-ink-muted">
              最も多く敗れた映画人
            </p>
            <div className="flex gap-4">
              <a href={`/people/${leader.uid}`} className="shrink-0">
                <PersonPortrait
                  name={leader.name}
                  profilePath={leader.profilePath}
                  className="w-24 md:w-32"
                />
              </a>
              <div className="flex flex-col justify-center gap-2">
                <p className="font-display text-5xl leading-none font-black text-brand">
                  <span>{leader.losses.length}</span>
                  <span className="text-2xl">敗</span>
                </p>
                <h2 className="font-display text-xl leading-tight font-black md:text-2xl">
                  <a href={`/people/${leader.uid}`} className="text-ink">
                    {leader.name}
                  </a>
                </h2>
                <LossTags losses={leader.losses} awards={awards} />
              </div>
            </div>
          </section>
        )}

        {rest.length > 0 && (
          <section className="mb-10">
            <p className="mb-3 font-mono text-xs text-ink-muted">
              敗北を重ねた映画人
            </p>
            <ul className="grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-4">
              {rest.map(person => (
                <li key={person.uid}>
                  <a
                    href={`/people/${person.uid}`}
                    className="text-ink no-underline">
                    <PersonPortrait
                      name={person.name}
                      profilePath={person.profilePath}
                      className="w-full"
                    />
                    <span className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="font-display text-sm font-black text-brand">
                        {person.losses.length}敗
                      </span>
                      <span className="font-display text-xs leading-tight font-bold">
                        {person.name}
                      </span>
                    </span>
                  </a>
                  <div className="mt-1">
                    <LossTags losses={person.losses} awards={awards} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <a
            href="/people"
            className="inline-block border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold text-ink no-underline shadow-[3px_3px_0_var(--ink)]">
            映画人ランキング
          </a>
          <a
            href="/people/crossings"
            className="inline-block border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold text-ink no-underline shadow-[3px_3px_0_var(--ink)]">
            映画人の交差
          </a>
          <a
            href="/uncrowned"
            className="inline-block border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold text-ink no-underline shadow-[3px_3px_0_var(--ink)]">
            無冠の映画
          </a>
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
