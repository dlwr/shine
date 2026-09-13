import {fetchSelections, requireSelection} from '../api-client';
import {type PostPlan} from '../post-plan';
import {buildDailyPostText, buildXPostText} from '../post-text';
import {SITE_URL} from '../site';
import {buildMovieLink, buildSelectionPostInput} from './selection';

export async function buildDailyPlan(): Promise<PostPlan> {
  const selections = await fetchSelections();
  const movie = requireSelection(selections, 'daily');
  const postInput = {
    ...(await buildSelectionPostInput(movie)),
    monthlyTitle: selections.monthly?.title,
  };

  return {
    text: buildDailyPostText(postInput),
    xText: buildXPostText({
      ...postInput,
      url: `${SITE_URL}/movies/${movie.uid}`,
    }),
    ...buildMovieLink(
      movie,
      `『${movie.title}』をいま観られるかをまとめています。`,
    ),
  };
}
