import process from 'node:process';
import {getDatabase} from '@shine/database';
import {parseOriginRules} from '@shine/utils';
import {loadScraperEnvironment} from '../../common/environment';
import {
  findUnannouncedMonthlyLinks,
  markLinksAnnounced,
} from '../../north-star';
import {
  fetchArticleLinkCount,
  fetchNextMonthly,
  fetchNextMonthlyTitle,
  fetchSelections,
  requireSelection,
} from '../api-client';
import {type PostPlan} from '../post-plan';
import {
  buildMonthlyLinksPostText,
  buildMonthlyLinksXPostText,
  buildMonthlyPostText,
  buildMonthlyPreviewPostText,
  buildMonthlyPreviewXPostText,
  buildMonthlyReminderPostText,
  buildMonthlyReminderXPostText,
  buildMonthlyRoundupPostText,
  buildMonthlyRoundupXPostText,
  buildMonthlyXPostText,
} from '../post-text';
import {SITE_URL} from '../site';
import {buildMovieLink, buildSelectionPostInput} from './selection';

export async function buildMonthlyPlan(): Promise<PostPlan> {
  const movie = requireSelection(await fetchSelections(), 'monthly');
  const postInput = await buildSelectionPostInput(movie);

  return {
    text: buildMonthlyPostText(postInput),
    xText: buildMonthlyXPostText({
      ...postInput,
      url: `${SITE_URL}/movies/${movie.uid}`,
    }),
    ...buildMovieLink(
      movie,
      `今月の1本『${movie.title}』。観られる場所と、観た人の記事・ポストをまとめています。`,
    ),
  };
}

export async function buildMonthlyPreviewPlan(): Promise<PostPlan> {
  const {date, movie} = await fetchNextMonthly();
  const postInput = {
    ...(await buildSelectionPostInput(movie)),
    startDate: date,
  };

  return {
    text: buildMonthlyPreviewPostText(postInput),
    xText: buildMonthlyPreviewXPostText({
      ...postInput,
      url: `${SITE_URL}/movies/${movie.uid}`,
    }),
    ...buildMovieLink(
      movie,
      `来月の1本『${movie.title}』。1日から、みんなでこれを観ます。`,
    ),
  };
}

export async function buildMonthlyReminderPlan(): Promise<PostPlan> {
  const movie = requireSelection(await fetchSelections(), 'monthly');
  const postInput = {
    ...(await buildSelectionPostInput(movie)),
    linkCount: await fetchArticleLinkCount(movie.uid),
  };

  return {
    text: buildMonthlyReminderPostText(postInput),
    xText: buildMonthlyReminderXPostText({
      ...postInput,
      url: `${SITE_URL}/movies/${movie.uid}`,
    }),
    ...buildMovieLink(
      movie,
      `今月の1本『${movie.title}』。観られる場所と、観た人の記事・ポストをまとめています。`,
    ),
  };
}

export async function buildMonthlyRoundupPlan(): Promise<PostPlan> {
  const movie = requireSelection(await fetchSelections(), 'monthly');
  const [linkCount, nextTitle] = await Promise.all([
    fetchArticleLinkCount(movie.uid),
    fetchNextMonthlyTitle(),
  ]);
  const postInput = {
    title: movie.title!,
    year: movie.year,
    linkCount,
    nextTitle,
  };

  return {
    text: buildMonthlyRoundupPostText(postInput),
    xText: buildMonthlyRoundupXPostText({
      ...postInput,
      url: `${SITE_URL}/movies/${movie.uid}`,
    }),
    ...buildMovieLink(
      movie,
      `今月の1本『${movie.title}』に集まった、観た人の記事・ポスト。`,
    ),
  };
}

export async function buildMonthlyLinksPlan(): Promise<PostPlan | undefined> {
  const database = getDatabase(loadScraperEnvironment());
  const found = await findUnannouncedMonthlyLinks(
    database,
    parseOriginRules(process.env),
  );

  if (!found) {
    return undefined;
  }

  const url = `${SITE_URL}/movies/${found.movieUid}`;
  const postInput = {
    title: found.title,
    year: found.year,
    count: found.linkUids.length,
  };

  return {
    text: buildMonthlyLinksPostText(postInput),
    xText: buildMonthlyLinksXPostText({...postInput, url}),
    link: {
      uri: `${url}#article-links`,
      title: `${found.title} | SHINE`,
      description: `今月の1本『${found.title}』に集まった、観た人の記事・ポスト。`,
    },
    imageUrl: `${SITE_URL}/og/movie.png?id=${found.movieUid}`,
    async afterPost() {
      await markLinksAnnounced(database, found.linkUids);
    },
  };
}
