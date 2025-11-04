import {useEffect, useMemo, useState} from 'react';
import type {Route} from './+types/admin.ceremonies';

type CeremonyListItem = {
  uid: string;
  organizationUid: string;
  organizationName: string;
  organizationCountry: string | null;
  year: number;
  ceremonyNumber: number | null;
  startDate: number | null;
  endDate: number | null;
  location: string | null;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  movieCount: number;
  imdbEventUrl: string | null;
};

type LoaderData = {
  apiUrl: string;
};

export function meta() {
  return [
    {title: 'セレモニー一覧 | Shine Admin'},
    {name: 'description', content: 'セレモニーの一覧と管理'},
  ];
}

export async function loader({context}: Route.LoaderArgs) {
  const cloudflareEnvironment = (
    context.cloudflare as {env?: {PUBLIC_API_URL?: string}} | undefined
  )?.env;

  return {
    apiUrl: cloudflareEnvironment?.PUBLIC_API_URL ?? 'http://localhost:8787',
  };
}

const handleLogout = () => {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    globalThis.localStorage.removeItem('adminToken');
    globalThis.location.href = '/admin/login';
  }
};

const formatYearAndNumber = (
  year: number,
  ceremonyNumber: number | null,
): string => {
  if (ceremonyNumber && ceremonyNumber > 0) {
    return `${year}年（第${ceremonyNumber}回）`;
  }

  return `${year}年`;
};

const formatDate = (value: number | null | undefined): string | undefined => {
  if (typeof value !== 'number') {
    return undefined;
  }

  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toLocaleDateString('ja-JP');
};

const formatDateRange = (
  startDate: number | null,
  endDate: number | null,
): string => {
  const startText = formatDate(startDate);
  const endText = formatDate(endDate);

  if (startText && endText) {
    return `${startText} 〜 ${endText}`;
  }

  if (startText) {
    return startText;
  }

  if (endText) {
    return endText;
  }

  return '-';
};

const formatTimestamp = (value: number): string => {
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const filterCeremonies = (
  ceremonies: CeremonyListItem[],
  query: string,
  organization: string,
) => {
  return ceremonies.filter(ceremony => {
    const matchesOrganization =
      !organization || ceremony.organizationUid === organization;

    const matchesQuery =
      !query ||
      ceremony.organizationName.toLowerCase().includes(query.toLowerCase()) ||
      (ceremony.location ?? '').toLowerCase().includes(query.toLowerCase()) ||
      ceremony.year.toString().includes(query);

    return matchesOrganization && matchesQuery;
  });
};

export default function AdminCeremonies({loaderData}: Route.ComponentProps) {
  const {apiUrl} = loaderData as LoaderData;
  const [ceremonies, setCeremonies] = useState<CeremonyListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState('');

  useEffect(() => {
    const loadCeremonies = async () => {
      if (typeof globalThis === 'undefined') {
        return;
      }

      const token = globalThis.localStorage?.getItem('adminToken');

      if (!token) {
        globalThis.location.href = '/admin/login';
        return;
      }

      setIsLoading(true);
      setError(undefined);

      try {
        const response = await fetch(`${apiUrl}/admin/ceremonies`, {
          headers: {Authorization: `Bearer ${token}`},
        });

        if (response.status === 401) {
          globalThis.localStorage?.removeItem('adminToken');
          globalThis.location.href = '/admin/login';
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }

        const data = (await response.json()) as {ceremonies: CeremonyListItem[]};
        setCeremonies(data.ceremonies ?? []);
      } catch (fetchError) {
        console.error('Failed to load ceremonies:', fetchError);
        setError('セレモニー一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    };

    void loadCeremonies();
  }, [apiUrl]);

  const organizations = useMemo(() => {
    const unique = new Map<string, string>();
    for (const ceremony of ceremonies) {
      if (!unique.has(ceremony.organizationUid)) {
        unique.set(ceremony.organizationUid, ceremony.organizationName);
      }
    }

    const options = [...unique.entries()].map(([value, label]) => ({
      value,
      label,
    }));

    // eslint-disable-next-line unicorn/no-array-sort
    return options.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [ceremonies]);

  const filteredCeremonies = useMemo(
    () => filterCeremonies(ceremonies, searchQuery, organizationFilter),
    [ceremonies, searchQuery, organizationFilter],
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">セレモニー一覧</h1>
            <p className="mt-1 text-sm text-gray-500">
              各セレモニーの基本情報と映画の紐付け状況を管理します。
            </p>
          </div>
          <div className="flex gap-3">
            <a
              href="/admin/ceremonies/new"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              ＋ セレモニーを追加
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-6 rounded-lg bg-white p-6 shadow">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-1 flex-col gap-2 lg:flex-row lg:items-center">
              <label className="flex flex-1 flex-col text-sm font-medium text-gray-700 lg:mr-4">
                キーワード検索
                <input
                  type="search"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="団体名・場所・年で検索"
                  className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>

              <label className="flex flex-col text-sm font-medium text-gray-700">
                主催団体
                <select
                  value={organizationFilter}
                  onChange={event => setOrganizationFilter(event.target.value)}
                  className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">すべて</option>
                  {organizations.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-lg bg-white shadow">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">読み込み中です…</div>
          ) : error ? (
            <div className="p-6 text-sm text-red-600">{error}</div>
          ) : filteredCeremonies.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              条件に一致するセレモニーが見つかりませんでした。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      セレモニー
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      主催団体
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      開催期間
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      場所
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      IMDb
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      映画数
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      更新日時
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredCeremonies.map(ceremony => (
                    <tr key={ceremony.uid}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium text-gray-900">
                          {formatYearAndNumber(
                            ceremony.year,
                            ceremony.ceremonyNumber,
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          UID: {ceremony.uid}
                        </div>
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
                            className="text-blue-600 underline hover:text-blue-800"
                          >
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
                        <a
                          href={`/admin/ceremonies/${ceremony.uid}`}
                          className="rounded border border-blue-600 px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
                        >
                          編集
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
