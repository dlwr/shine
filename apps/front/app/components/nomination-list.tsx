type Nomination = {
  uid: string;
  isWinner: boolean;
  specialMention: string | undefined;
  category: {
    uid: string;
    name: string;
  };
  ceremony: {
    uid: string;
    number: number;
    year: number;
  };
  organization: {
    uid: string;
    name: string;
    shortName: string;
  };
};

type NominationListProperties = {
  nominations: Nomination[];
};

export default function NominationList({nominations}: NominationListProperties) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">ノミネート</h3>
      {nominations.length === 0 ? (
        <p className="text-gray-500 italic">ノミネートがありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  組織
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  年
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  カテゴリ
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  結果
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  特記事項
                </th>
              </tr>
            </thead>
            <tbody>
              {nominations.map(nomination => (
                <tr key={nomination.uid} className="border-b border-gray-100">
                  <td className="py-2 px-3">
                    <div className="text-sm">
                      <div className="font-medium">
                        {nomination.organization.name}
                      </div>
                      <div className="text-gray-500">
                        ({nomination.organization.shortName})
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="text-sm">
                      <div>{nomination.ceremony.year}</div>
                      <div className="text-gray-500">
                        第{nomination.ceremony.number}回
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-sm">
                    {nomination.category.name}
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
