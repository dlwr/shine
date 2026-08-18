import type {MetaDescriptor} from 'react-router';
import type {Locale} from './locale';

export const SITE_URL = 'https://shine-film.com';
export const SITE_NAME = 'SHINE';

const OPEN_GRAPH_LOCALES: Record<Locale, string> = {
  ja: 'ja_JP',
  en: 'en_US',
};

const TMDB_SIZED_POSTER_PATTERN =
  /^(https:\/\/image\.tmdb\.org\/t\/p\/)(?:original|w\d+)(\/)/;

export function upgradePosterForSharing(url?: string): string | undefined {
  return url?.replace(TMDB_SIZED_POSTER_PATTERN, '$1w780$2');
}

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

type SocialMetaInput = {
  title: string;
  description: string;
  path: string;
  locale: Locale;
  imageUrl?: string;
  /**
  1200x630の生成カードを使うときに指定。twitter:cardと寸法が切り替わる
  */
  largeImage?: boolean;
  type?: 'website' | 'article';
};

export function buildSocialMeta({
  title,
  description,
  path,
  locale,
  imageUrl,
  largeImage = false,
  type = 'website',
}: SocialMetaInput): MetaDescriptor[] {
  const url = new URL(path, SITE_URL).toString();
  const useLargeCard = Boolean(imageUrl) && largeImage;

  const descriptors: MetaDescriptor[] = [
    {title},
    {name: 'description', content: description},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:type', content: type},
    {property: 'og:url', content: url},
    {property: 'og:site_name', content: SITE_NAME},
    {property: 'og:locale', content: OPEN_GRAPH_LOCALES[locale]},
    {
      name: 'twitter:card',
      content: useLargeCard ? 'summary_large_image' : 'summary',
    },
  ];

  if (imageUrl) {
    descriptors.push(
      {property: 'og:image', content: imageUrl},
      {name: 'twitter:image', content: imageUrl},
    );
  }

  if (useLargeCard) {
    descriptors.push(
      {property: 'og:image:width', content: String(OG_IMAGE_WIDTH)},
      {property: 'og:image:height', content: String(OG_IMAGE_HEIGHT)},
    );
  }

  return descriptors;
}
