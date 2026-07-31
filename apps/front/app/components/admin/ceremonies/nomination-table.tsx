import {Button} from '@/components/ui/button';
import type {CeremonyResponse} from './types';

type NominationTableProperties = {
  nominations: CeremonyResponse['nominations'];
  onRemove: (nominationUid: string) => void;
};

export function NominationTable({
  nominations,
  onRemove,
}: NominationTableProperties) {
  if (nominations.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
        登録されている映画はありません。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              映画
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              部門
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              受賞
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              特記事項
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {nominations.map(nomination => (
            <tr key={nomination.uid}>
              <td className="px-4 py-3 text-sm text-gray-900">
                <div className="font-medium text-gray-900">
                  <a
                    href={`/admin/movies/${nomination.movie.uid}`}
                    className="text-blue-600 hover:underline">
                    {nomination.movie.title}
                  </a>
                </div>
                <div className="text-xs text-gray-500">
                  UID: {nomination.movie.uid}
                  {nomination.movie.year ? ` / ${nomination.movie.year}年` : ''}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-900">
                {nomination.category.name}
              </td>
              <td className="px-4 py-3 text-sm text-gray-900">
                {nomination.isWinner ? '受賞' : 'ノミネート'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-900">
                {nomination.specialMention ?? '-'}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-red-600 text-red-600 hover:bg-red-50"
                  onClick={() => onRemove(nomination.uid)}>
                  削除
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
