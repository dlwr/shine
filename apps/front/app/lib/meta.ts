import type {MetaDescriptor} from 'react-router';
import type {Locale} from './locale';

export const SITE_URL = 'https://shine-film.com';
export const SITE_NAME = 'SHINE';

const OPEN_GRAPH_LOCALES: Record<Locale, string> = {
  ja: 'ja_JP',
  en: 'en_US',
};

const TMDB_SIZED_POSTER_PATTERN =
  /^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+(\/)/;

export function upgradePosterForSharing(url?: string): string | undefined {
  return url?.replace(TMDB_SIZED_POSTER_PATTERN, '$1w780$2');
}

type SocialMetaInput = {
  title: string;
  description: string;
  path: string;
  locale: Locale;
  imageUrl?: string;
  type?: 'website' | 'article';
};

export function buildSocialMeta({
  title,
  description,
  path,
  locale,
  imageUrl,
  type = 'website',
}: SocialMetaInput): MetaDescriptor[] {
  const url = new URL(path, SITE_URL).toString();

  const descriptors: MetaDescriptor[] = [
    {title},
    {name: 'description', content: description},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:type', content: type},
    {property: 'og:url', content: url},
    {property: 'og:site_name', content: SITE_NAME},
    {property: 'og:locale', content: OPEN_GRAPH_LOCALES[locale]},
    {name: 'twitter:card', content: 'summary'},
  ];

  if (imageUrl) {
    descriptors.push(
      {property: 'og:image', content: imageUrl},
      {name: 'twitter:image', content: imageUrl},
    );
  }

  return descriptors;
}
