import type {Route} from './+types/daily';
import {
  buildArchiveMeta,
  loadSelectionArchive,
  type SelectionArchiveConfig,
  type SelectionArchiveData,
} from '@/lib/selection-archive';
import {SelectionArchivePage} from '@/components/selection-archive/selection-archive-page';

const CONFIG: SelectionArchiveConfig = {
  type: 'daily',
  path: '/daily',
  heading: '今日の1本',
  subtitle: '「今日の1本」の過去のセレクション',
  metaTitle: '今日の1本 アーカイブ | SHINE',
  metaDescription:
    '映画賞や名作リストに選ばれた映画から毎日1本を紹介する「今日の1本」の過去のセレクション一覧。',
};

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = loaderData as Partial<SelectionArchiveData>;
  return buildArchiveMeta(CONFIG, locale);
}

export async function loader({context, request}: Route.LoaderArgs) {
  return loadSelectionArchive(CONFIG, context, request);
}

export default function DailyArchive({loaderData}: Route.ComponentProps) {
  return (
    <SelectionArchivePage
      config={CONFIG}
      {...(loaderData as SelectionArchiveData)}
    />
  );
}
