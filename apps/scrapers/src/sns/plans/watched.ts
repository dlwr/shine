import {fetchWatchedLists, fetchWinnerCount} from '../api-client';
import {type PostPlan} from '../post-plan';
import {
  buildWatchedPostText,
  buildWatchedXPostText,
} from '../post-text/watched';
import {SITE_URL} from '../site';
import {pickWeeklyItem} from '../weekly-rotation';

export async function buildWatchedPlan(): Promise<PostPlan> {
  const list = pickWeeklyItem(await fetchWatchedLists(), new Date());
  if (!list) {
    throw new Error('No watched lists found');
  }

  const heading =
    list.organization === list.name
      ? list.name
      : `${list.organization} ${list.name}`;
  const total = await fetchWinnerCount(list.slug);
  const url = `${SITE_URL}/watched/${list.slug}`;

  return {
    text: buildWatchedPostText({heading, total}),
    xText: buildWatchedXPostText({heading, total, url}),
    link: {
      uri: url,
      title: `${heading}受賞作、何本観た？ | SHINE`,
      description: `${heading}の歴代受賞作${total}本にチェックを付けて、観た本数と割合を共有できます。`,
    },
    imageUrl: `${SITE_URL}/og/watched.png?slug=${list.slug}`,
  };
}
