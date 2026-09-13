import {fetchProminentPeople} from '../api-client';
import {pickPersonOfWeek} from '../person-rotation';
import {type PostPlan} from '../post-plan';
import {buildPersonPostText, buildPersonXPostText} from '../post-text';
import {SITE_URL} from '../site';

export async function buildPersonPlan(): Promise<PostPlan> {
  const person = pickPersonOfWeek(await fetchProminentPeople(), new Date());
  if (!person) {
    throw new Error('No awarded people found');
  }

  const url = `${SITE_URL}/people/${person.uid}`;
  const postInput = {
    name: person.name,
    role: person.role,
    wonCount: person.wonCount,
    nominatedCount: person.nominatedCount,
    topMovies: person.topMovies
      .filter(movie => movie.title)
      .map(movie => ({title: movie.title!, year: movie.year})),
  };

  return {
    text: buildPersonPostText(postInput),
    xText: buildPersonXPostText({...postInput, url}),
    link: {
      uri: url,
      title: `${person.name}の映画 | SHINE`,
      description: `${person.name}の受賞歴と関わった映画を、SHINEに収録された映画賞の受賞作・ノミネート作から一覧できます。`,
    },
    imageUrl: `${SITE_URL}/og/person.png?id=${person.uid}`,
  };
}
