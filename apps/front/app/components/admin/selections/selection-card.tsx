import {MovieCard} from '@/components/molecules/movie-card';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  SELECTION_TYPE_COLORS,
  SELECTION_TYPE_LABELS,
  type SelectionData,
  type SelectionType,
} from './types';

type SelectionCardProperties = {
  type: SelectionType;
  selection: SelectionData | undefined;
  locale: string;
  adminToken: string | undefined;
  onOverride: (type: SelectionType) => void;
};

export function SelectionCard({
  type,
  selection,
  locale,
  adminToken,
  onOverride,
}: SelectionCardProperties) {
  return (
    <Card
      data-testid={`${type}-selection`}
      className="overflow-hidden shadow-lg">
      <CardHeader
        className={`bg-gradient-to-r ${SELECTION_TYPE_COLORS[type]} text-white`}>
        <CardTitle className="text-white">
          {SELECTION_TYPE_LABELS[type]}
        </CardTitle>
        {selection && (
          <CardDescription className="text-white/90">
            選択日時: {new Date(selection.date).toLocaleDateString('ja-JP')}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {selection?.movie ? (
          <div className="space-y-6">
            <div className="flex justify-center">
              <MovieCard
                movie={selection.movie}
                locale={locale}
                adminToken={adminToken}
              />
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => onOverride(type)}
                className="flex-1 bg-blue-600 text-white hover:bg-blue-500">
                Override Selection
              </Button>
              <Button
                asChild
                variant="secondary"
                className="flex-1 bg-slate-700 text-white hover:bg-slate-600">
                <a href={`/admin/movies/${selection.movie.uid}`}>Edit Movie</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-center text-gray-500">
            <p>選択された映画がありません</p>
            <Button
              onClick={() => onOverride(type)}
              className="bg-blue-600 text-white hover:bg-blue-500">
              映画を選択
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
