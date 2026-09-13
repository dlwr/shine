import {Link} from 'react-router';
import type {Nomination} from './types';

type NominationRowProperties = {
  nomination: Nomination;
  isDeleting: boolean;
  onEdit: (nomination: Nomination) => void;
  onDelete: (nomination: Nomination) => void;
};

export function NominationRow({
  nomination,
  isDeleting,
  onEdit,
  onDelete,
}: NominationRowProperties) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 px-3">
        <div className="text-sm">
          <div className="font-medium">{nomination.organization.name}</div>
          <div className="text-gray-500">
            ({nomination.organization.shortName})
          </div>
        </div>
      </td>
      <td className="py-2 px-3">
        <Link
          to={`/admin/ceremonies/${nomination.ceremony.uid}`}
          className="text-sm hover:underline text-blue-600">
          <div>{nomination.ceremony.year}</div>
          <div className="text-gray-500">第{nomination.ceremony.number}回</div>
        </Link>
      </td>
      <td className="py-2 px-3 text-sm">{nomination.category.name}</td>
      <td className="py-2 px-3">
        {nomination.isWinner ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            受賞
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            ノミネート
          </span>
        )}
      </td>
      <td className="py-2 px-3 text-sm text-gray-600">
        {nomination.specialMention || '-'}
      </td>
      <td className="py-2 px-3 text-sm">
        <div className="flex space-x-2">
          <button
            type="button"
            className="text-blue-600 hover:text-blue-800"
            onClick={() => onEdit(nomination)}>
            編集
          </button>
          <button
            type="button"
            className="text-red-600 hover:text-red-800 disabled:opacity-60"
            onClick={() => onDelete(nomination)}
            disabled={isDeleting}>
            {isDeleting ? '削除中...' : '削除'}
          </button>
        </div>
      </td>
    </tr>
  );
}
