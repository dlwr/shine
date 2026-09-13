import {NominationRow} from './nomination-row';
import type {Nomination} from './types';

type NominationTableProperties = {
  nominations: Nomination[];
  deletingNominationId: string | undefined;
  onEdit: (nomination: Nomination) => void;
  onDelete: (nomination: Nomination) => void;
};

export function NominationTable({
  nominations,
  deletingNominationId,
  onEdit,
  onDelete,
}: NominationTableProperties) {
  if (nominations.length === 0) {
    return <p className="text-gray-500 italic">ノミネートがありません</p>;
  }

  return (
    <table className="min-w-full table-auto">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="text-left py-2 px-3 font-medium text-gray-900">
            組織
          </th>
          <th className="text-left py-2 px-3 font-medium text-gray-900">年</th>
          <th className="text-left py-2 px-3 font-medium text-gray-900">
            カテゴリ
          </th>
          <th className="text-left py-2 px-3 font-medium text-gray-900">
            結果
          </th>
          <th className="text-left py-2 px-3 font-medium text-gray-900">
            特記事項
          </th>
          <th className="text-left py-2 px-3 font-medium text-gray-900">
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        {nominations.map(nomination => (
          <NominationRow
            key={nomination.uid}
            nomination={nomination}
            isDeleting={deletingNominationId === nomination.uid}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  );
}
