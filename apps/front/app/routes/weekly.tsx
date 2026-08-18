import type {Route} from './+types/weekly';
import {
  buildArchiveMeta,
  loadSelectionArchive,
  SelectionArchivePage,
  type SelectionArchiveConfig,
  type SelectionArchiveData,
} from '@/lib/selection-archive';

const CONFIG: SelectionArchiveConfig = {
  type: 'weekly',
  path: '/weekly',
  heading: 'WEEKLY PICKS',
  subtitle: '「今週の1本」の過去のセレクション（日付は週の開始日・金曜）',
  metaTitle: '今週の1本 アーカイブ | SHINE',
  metaDescription:
    '映画賞や名作リストに選ばれた映画から毎週1本を紹介する「今週の1本」の過去のセレクション一覧。',
};

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = loaderData as Partial<SelectionArchiveData>;
  return buildArchiveMeta(CONFIG, locale);
}

export async function loader({context, request}: Route.LoaderArgs) {
  return loadSelectionArchive(CONFIG, context, request);
}

export default function WeeklyArchive({loaderData}: Route.ComponentProps) {
  const {items, locale} = loaderData as SelectionArchiveData;
  return <SelectionArchivePage config={CONFIG} items={items} locale={locale} />;
}
