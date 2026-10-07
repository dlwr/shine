import {
  canTransformImages,
  loadApiJson,
  tryApiJson,
  type LoadContext,
} from '@/lib/api';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import type {SelectionPreviewData} from '@/lib/api-types';

export type SelectionHistoryItem = {
  uid: string;
  title: string;
  year?: number;
  selectionDate: string;
  posterUrl?: string;
  articleLinkCount?: number;
};

export type SelectionArchiveData = {
  items: SelectionHistoryItem[];
  next?: SelectionHistoryItem;
  locale: Locale;
  currentMonth: string;
  transformImages: boolean;
};

export type SelectionArchiveConfig = {
  type: 'daily' | 'weekly' | 'monthly';
  path: string;
  heading: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  formatDate?: (selectionDate: string) => string;
  showPosters?: boolean;
  calendarPath?: string;
};
export function buildArchiveMeta(
  config: SelectionArchiveConfig,
  locale: Locale | undefined,
) {
  return buildSocialMeta({
    title: config.metaTitle,
    description: config.metaDescription,
    path: config.path,
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loadNextSelection(
  type: SelectionArchiveConfig['type'],
  locale: Locale,
  context: LoadContext,
  request: Request,
): Promise<SelectionHistoryItem | undefined> {
  const preview = await tryApiJson<SelectionPreviewData>(
    context,
    `/selections/${type}/next?locale=${locale}`,
    {signal: request.signal},
  );
  if (!preview) {
    return undefined;
  }

  const {date, movie} = preview;
  return {
    uid: movie.uid,
    title: movie.title,
    year: movie.year,
    selectionDate: date,
    posterUrl: movie.posterUrl,
  };
}

export async function loadSelectionArchive(
  config: SelectionArchiveConfig,
  context: LoadContext,
  request: Request,
): Promise<SelectionArchiveData> {
  const locale = getLocaleFromRequest(request);

  const [body, next] = await Promise.all([
    loadApiJson<{items: SelectionHistoryItem[]}>(
      context,
      `/selections/${config.type}/history?locale=${locale}&limit=30`,
      {label: `${config.type} history`, signal: request.signal},
    ),
    config.type === 'monthly'
      ? loadNextSelection(config.type, locale, context, request)
      : undefined,
  ]);

  return {
    items: body.items,
    next,
    locale,
    currentMonth: new Date().toISOString().slice(0, 7),
    transformImages: canTransformImages(context),
  };
}
