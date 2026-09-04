import type {Route} from './+types/monthly';
import {
  buildArchiveMeta,
  loadSelectionArchive,
  SelectionArchivePage,
  type SelectionArchiveConfig,
  type SelectionArchiveData,
} from '@/lib/selection-archive';

const CONFIG: SelectionArchiveConfig = {
  type: 'monthly',
  path: '/monthly',
  heading: 'MONTHLY PICKS',
  subtitle: '「今月の1本」の過去のセレクション',
  metaTitle: '今月の1本 アーカイブ | なんか見る',
  metaDescription:
    '映画賞や名作リストに選ばれた映画から毎月1本を紹介する「今月の1本」の過去のセレクション一覧。',
  formatDate: selectionDate => selectionDate.slice(0, 7),
};

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = loaderData as Partial<SelectionArchiveData>;
  return buildArchiveMeta(CONFIG, locale);
}

export async function loader({context, request}: Route.LoaderArgs) {
  return loadSelectionArchive(CONFIG, context, request);
}

export default function MonthlyArchive({loaderData}: Route.ComponentProps) {
  const {items, locale} = loaderData as SelectionArchiveData;
  return <SelectionArchivePage config={CONFIG} items={items} locale={locale} />;
}
