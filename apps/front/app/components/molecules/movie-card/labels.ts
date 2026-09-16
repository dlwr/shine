const LABELS = {
  en: {
    noPoster: 'No Poster',
    winner: 'Winner',
    nominee: 'Nominee',
    relatedArticles: 'Submitted Links',
    addArticle: 'Add Link',
    showMore: 'Show details',
    showLess: 'Hide details',
    searchOn: 'Search on',
    adminEdit: 'Edit Movie',
  },
  ja: {
    noPoster: 'ポスターなし',
    winner: '受賞',
    nominee: 'ノミネート',
    relatedArticles: '投稿されたリンク',
    addArticle: 'リンクを追加',
    showMore: '詳細を表示',
    showLess: '詳細を隠す',
    searchOn: '検索する',
    adminEdit: '映画を編集',
  },
} as const;

export type MovieCardLabels = (typeof LABELS)[keyof typeof LABELS];

export function movieCardLabels(locale: string): MovieCardLabels {
  return LABELS[locale as keyof typeof LABELS] ?? LABELS.en;
}
