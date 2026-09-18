import {Button} from '@/components/ui/button';
import {formatDateRange, formatTimestamp, formatYearAndNumber} from './format';
import type {CeremonyListItem} from './types';

const COLUMNS = [
  'セレモニー',
  '主催団体',
  '開催期間',
  '場所',
  'IMDb',
  '映画数',
  '更新日時',
  '操作',
];

type CeremonyListTableProperties = {
  ceremonies: CeremonyListItem[];
};

export function CeremonyListTable({ceremonies}: CeremonyListTableProperties) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {COLUMNS.map(column => (
              <th
                key={column}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {ceremonies.map(ceremony => (
            <tr key={ceremony.uid}>
              <td className="px-4 py-3 text-sm text-gray-900">
                <div className="font-medium text-gray-900">
                  {formatYearAndNumber(ceremony.year, ceremony.ceremonyNumber)}
                </div>
                <div className="text-xs text-gray-500">UID: {ceremony.uid}</div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-900">
                <div className="font-medium">{ceremony.organizationName}</div>
                {ceremony.organizationCountry && (
                  <div className="text-xs text-gray-500">
                    {ceremony.organizationCountry}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-900">
                {formatDateRange(ceremony.startDate, ceremony.endDate)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-900">
                {ceremony.location ?? '-'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-900">
                {ceremony.imdbEventUrl ? (
                  <a
                    href={ceremony.imdbEventUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline hover:text-blue-800">
                    IMDb
                  </a>
                ) : (
                  '-'
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-900">
                {ceremony.movieCount}
              </td>
              <td className="px-4 py-3 text-sm text-gray-900">
                {formatTimestamp(ceremony.updatedAt)}
              </td>
              <td className="px-4 py-3 text-sm text-blue-600">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-blue-600 text-blue-600 hover:bg-blue-50">
                  <a href={`/admin/ceremonies/${ceremony.uid}`}>編集</a>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
