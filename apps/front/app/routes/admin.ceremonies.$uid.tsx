import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {useNavigate} from 'react-router';
import type {Route} from './+types/admin.ceremonies.$uid';

type LoaderData = {
  apiUrl: string;
  ceremonyUid: string;
};

type CeremonyNavigationItem = {
  uid: string;
  year: number;
  ceremonyNumber?: number;
};

type CeremonyResponse = {
  ceremony: {
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
    imdbEventUrl: string | null;
    createdAt: number;
    updatedAt: number;
  };
  nominations: Array<{
    uid: string;
    movie: {
      uid: string;
      title: string;
      year: number | null;
    };
    category: {
      uid: string;
      name: string;
    };
    isWinner: boolean;
    specialMention: string | null;
  }>;
  navigation: {
    previous: CeremonyNavigationItem | null;
    next: CeremonyNavigationItem | null;
  };
};

type AwardsOrganization = {
  uid: string;
  name: string;
  country: string | null;
  shortName: string | null;
};

type AwardsCategory = {
  uid: string;
  organizationUid: string;
  name: string;
};

type AwardsData = {
  organizations: AwardsOrganization[];
  categories: AwardsCategory[];
};

type CeremonyFormState = {
  organizationUid: string;
  year: string;
  ceremonyNumber: string;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  imdbEventUrl: string;
};

type MovieSearchResult = {
  uid: string;
  title: string;
  year: number | null;
  imdbUrl?: string | null;
};

const emptyFormState: CeremonyFormState = {
  organizationUid: '',
  year: '',
  ceremonyNumber: '',
  startDate: '',
  endDate: '',
  location: '',
  description: '',
  imdbEventUrl: '',
};

const formatDateInput = (value: number | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
};

const formatTimestamp = (value: number) => {
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

const formatNavigationLabel = (item: CeremonyNavigationItem) => {
  if (item.ceremonyNumber && item.ceremonyNumber > 0) {
    return `${item.year}年・第${item.ceremonyNumber}回`;
  }

  return `${item.year}年`;
};

const ensureToken = () => {
  if (typeof globalThis === 'undefined') {
    return;
  }

  const token = globalThis.localStorage?.getItem('adminToken');
  if (!token) {
    globalThis.location.href = '/admin/login';
    return;
  }

  return token;
};

export function meta() {
  return [
    {title: 'セレモニー編集 | Shine Admin'},
    {name: 'description', content: 'セレモニー情報と映画の紐付けを編集します。'},
  ];
}

export async function loader({context, params}: Route.LoaderArgs) {
  const ceremonyUid = params.uid;
  if (!ceremonyUid) {
    throw new Response('Not Found', {status: 404});
  }

  const cloudflareEnvironment = (
    context.cloudflare as {env?: {PUBLIC_API_URL?: string}} | undefined
  )?.env;

  return {
    apiUrl: cloudflareEnvironment?.PUBLIC_API_URL ?? 'http://localhost:8787',
    ceremonyUid,
  };
}

export default function AdminCeremonyEdit({loaderData}: Route.ComponentProps) {
  const {apiUrl, ceremonyUid} = loaderData as LoaderData;
  const navigate = useNavigate();
  const isNew = ceremonyUid === 'new';

  const [awardsData, setAwardsData] = useState<AwardsData | undefined>();
  const [awardsLoading, setAwardsLoading] = useState(true);
  const [awardsError, setAwardsError] = useState<string | undefined>();

  const [ceremonyDetail, setCeremonyDetail] = useState<CeremonyResponse | undefined>();
  const [detailLoading, setDetailLoading] = useState(!isNew);
  const [detailError, setDetailError] = useState<string | undefined>();

  const [formState, setFormState] = useState<CeremonyFormState>(emptyFormState);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saveSuccess, setSaveSuccess] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);

  const [movieSearchQuery, setMovieSearchQuery] = useState('');
  const [movieSearchResults, setMovieSearchResults] = useState<
    MovieSearchResult[]
  >([]);
  const [isSearchingMovies, setIsSearchingMovies] = useState(false);
  const [movieSearchError, setMovieSearchError] = useState<string | undefined>();
  const [selectedMovie, setSelectedMovie] = useState<MovieSearchResult>();

  const [newNominationCategoryUid, setNewNominationCategoryUid] = useState('');
  const [newNominationIsWinner, setNewNominationIsWinner] = useState(false);
  const [newNominationSpecialMention, setNewNominationSpecialMention] =
    useState('');
  const [isAddingNomination, setIsAddingNomination] = useState(false);
  const [nominationMessage, setNominationMessage] = useState<
    string | undefined
  >();

  const fetchAwardsData = useCallback(async () => {
    const token = ensureToken();
    if (!token) {
      return;
    }

    setAwardsLoading(true);
    setAwardsError(undefined);

    try {
      const response = await fetch(`${apiUrl}/admin/awards`, {
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

      const data = (await response.json()) as {
        organizations: AwardsOrganization[];
        categories: AwardsCategory[];
      };

      setAwardsData({
        organizations: data.organizations ?? [],
        categories: data.categories ?? [],
      });
    } catch (error) {
      console.error('Failed to load awards data:', error);
      setAwardsError('主催団体・部門の取得に失敗しました。');
    } finally {
      setAwardsLoading(false);
    }
  }, [apiUrl]);

  const fetchCeremony = useCallback(
    async (token: string, options?: {syncForm?: boolean; showSpinner?: boolean}) => {
      const {syncForm = true, showSpinner = true} = options ?? {};

      if (showSpinner) {
        setDetailLoading(true);
      }
      setDetailError(undefined);

      try {
        const response = await fetch(`${apiUrl}/admin/ceremonies/${ceremonyUid}`, {
          headers: {Authorization: `Bearer ${token}`},
        });

        if (response.status === 401) {
          globalThis.localStorage?.removeItem('adminToken');
          globalThis.location.href = '/admin/login';
          return;
        }

        if (response.status === 404) {
          setDetailError('セレモニーが見つかりませんでした。');
          setCeremonyDetail(undefined);
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }

        const data = (await response.json()) as CeremonyResponse;
        setCeremonyDetail(data);

        if (syncForm) {
          setFormState({
            organizationUid: data.ceremony.organizationUid,
            year: data.ceremony.year.toString(),
            ceremonyNumber:
              data.ceremony.ceremonyNumber?.toString() ?? '',
            startDate: formatDateInput(data.ceremony.startDate),
            endDate: formatDateInput(data.ceremony.endDate),
            location: data.ceremony.location ?? '',
            description: data.ceremony.description ?? '',
            imdbEventUrl: data.ceremony.imdbEventUrl ?? '',
          });
        }
      } catch (error) {
        console.error('Failed to load ceremony detail:', error);
        setDetailError('セレモニー情報の取得に失敗しました。');
        setCeremonyDetail(undefined);
      } finally {
        if (showSpinner) {
          setDetailLoading(false);
        }
      }
    },
    [apiUrl, ceremonyUid],
  );

  useEffect(() => {
    void fetchAwardsData();
  }, [fetchAwardsData]);

  useEffect(() => {
    if (isNew) {
      setDetailLoading(false);
      setCeremonyDetail(undefined);
      return;
    }

    const token = ensureToken();
    if (!token) {
      return;
    }

    void fetchCeremony(token, {syncForm: true, showSpinner: true});
  }, [fetchCeremony, isNew]);

  useEffect(() => {
    if (
      isNew &&
      formState.organizationUid === '' &&
      awardsData &&
      awardsData.organizations.length > 0
    ) {
      setFormState(current => ({
        ...current,
        organizationUid: awardsData.organizations[0]?.uid ?? '',
      }));
    }
  }, [awardsData, formState.organizationUid, isNew]);

  const organizationOptions = useMemo<AwardsOrganization[]>(() => {
    if (awardsData === undefined) {
      return [];
    }

    return awardsData.organizations;
  }, [awardsData]);

  const categoriesForOrganization = useMemo(() => {
    if (awardsData === undefined) {
      return [];
    }

    const filtered: AwardsCategory[] = awardsData.categories.filter(
      category => category.organizationUid === formState.organizationUid,
    );

    // eslint-disable-next-line unicorn/no-array-sort
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [awardsData, formState.organizationUid]);

  const navigation = ceremonyDetail?.navigation;

  const handleInputChange = (
    event:
      | FormEvent<HTMLInputElement>
      | FormEvent<HTMLTextAreaElement>
      | FormEvent<HTMLSelectElement>,
  ) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const {name, value} = target;

    setFormState(current => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(undefined);
    setSaveSuccess(undefined);

    if (!formState.organizationUid) {
      setSaveError('主催団体を選択してください。');
      return;
    }

    if (!formState.year) {
      setSaveError('開催年を入力してください。');
      return;
    }

    const token = ensureToken();
    if (!token) {
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        organizationUid: formState.organizationUid,
        year: formState.year,
        ceremonyNumber: formState.ceremonyNumber
          ? Number.parseInt(formState.ceremonyNumber, 10)
          : undefined,
        startDate: formState.startDate || undefined,
        endDate: formState.endDate || undefined,
        location: formState.location || undefined,
        description: formState.description || undefined,
        imdbEventUrl:
          formState.imdbEventUrl.trim() === '' ? undefined : formState.imdbEventUrl,
      };

      const response = await fetch(
        `${apiUrl}/admin/ceremonies${
          isNew ? '' : `/${ceremonyDetail?.ceremony.uid ?? ceremonyUid}`
        }`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        // ignore parse errors
      }

      if (!response.ok) {
        const errorMessage =
          responseBody &&
          typeof responseBody === 'object' &&
          'error' in responseBody &&
          typeof (responseBody as {error?: unknown}).error === 'string'
            ? (responseBody as {error: string}).error
            : 'セレモニーの保存に失敗しました。';
        throw new Error(errorMessage);
      }

      const saved = responseBody as CeremonyResponse;

      setCeremonyDetail(saved);
      setSaveSuccess('セレモニーを保存しました。');

      if (isNew) {
        navigate(`/admin/ceremonies/${saved.ceremony.uid}`, {replace: true});
      }

      setFormState({
        organizationUid: saved.ceremony.organizationUid,
        year: saved.ceremony.year.toString(),
        ceremonyNumber:
          saved.ceremony.ceremonyNumber?.toString() ?? '',
        startDate: formatDateInput(saved.ceremony.startDate),
        endDate: formatDateInput(saved.ceremony.endDate),
        location: saved.ceremony.location ?? '',
        description: saved.ceremony.description ?? '',
        imdbEventUrl: saved.ceremony.imdbEventUrl ?? '',
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'セレモニーの保存に失敗しました。';
      setSaveError(message);
      console.error('Save ceremony error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCeremony = async () => {
    if (!ceremonyDetail) {
      return;
    }

    if (typeof globalThis !== 'undefined') {
      const confirmed = globalThis.confirm?.(
        'このセレモニーを削除しますか？関連するノミネートも削除されます。',
      );
      if (!confirmed) {
        return;
      }
    }

    const token = ensureToken();
    if (!token) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(undefined);

    try {
      const response = await fetch(
        `${apiUrl}/admin/ceremonies/${ceremonyDetail.ceremony.uid}`,
        {
          method: 'DELETE',
          headers: {Authorization: `Bearer ${token}`},
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(data.error || 'セレモニーの削除に失敗しました。');
      }

      navigate('/admin/ceremonies');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'セレモニーの削除に失敗しました。';
      setDeleteError(message);
      console.error('Delete ceremony error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSearchMovies = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMovieSearchError(undefined);
    setMovieSearchResults([]);

    const trimmedQuery = movieSearchQuery.trim();
    if (trimmedQuery.length < 2) {
      setMovieSearchError('2文字以上のキーワードを入力してください。');
      return;
    }

    const token = ensureToken();
    if (!token) {
      return;
    }

    setIsSearchingMovies(true);

    try {
      const response = await fetch(
        `${apiUrl}/admin/movies?limit=10&search=${encodeURIComponent(trimmedQuery)}`,
        {headers: {Authorization: `Bearer ${token}`}},
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        movies: Array<{
          uid: string;
          title: string;
          year: number | null;
          imdbUrl?: string | null;
        }>;
      };

      setMovieSearchResults(data.movies ?? []);
    } catch (error) {
      console.error('Movie search error:', error);
      setMovieSearchError('映画の検索に失敗しました。');
    } finally {
      setIsSearchingMovies(false);
    }
  };

  const handleAddNomination = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNominationMessage(undefined);

    if (!ceremonyDetail) {
      setNominationMessage('映画を追加する前にセレモニーを保存してください。');
      return;
    }

    if (!selectedMovie) {
      setNominationMessage('映画を選択してください。');
      return;
    }

    if (!newNominationCategoryUid) {
      setNominationMessage('部門を選択してください。');
      return;
    }

    const token = ensureToken();
    if (!token) {
      return;
    }

    setIsAddingNomination(true);

    try {
      const response = await fetch(
        `${apiUrl}/admin/movies/${selectedMovie.uid}/nominations`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ceremonyUid: ceremonyDetail.ceremony.uid,
            categoryUid: newNominationCategoryUid,
            isWinner: newNominationIsWinner,
            specialMention:
              newNominationSpecialMention.trim() === ''
                ? undefined
                : newNominationSpecialMention.trim(),
          }),
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(data.error || '映画の追加に失敗しました。');
      }

      const tokenAfter = ensureToken();
      if (!tokenAfter) {
        return;
      }

      await fetchCeremony(tokenAfter, {syncForm: false, showSpinner: true});
      setNominationMessage('映画を追加しました。');
      setSelectedMovie(undefined);
      setMovieSearchQuery('');
      setMovieSearchResults([]);
      setNewNominationCategoryUid('');
      setNewNominationIsWinner(false);
      setNewNominationSpecialMention('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '映画の追加に失敗しました。';
      setNominationMessage(message);
      console.error('Add nomination error:', error);
    } finally {
      setIsAddingNomination(false);
    }
  };

  const handleRemoveNomination = async (nominationUid: string) => {
    if (typeof globalThis !== 'undefined') {
      const confirmed = globalThis.confirm?.('この映画との紐付けを削除しますか？');
      if (!confirmed) {
        return;
      }
    }

    const token = ensureToken();
    if (!token) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/admin/nominations/${nominationUid}`, {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${token}`},
      });

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(data.error || '紐付けの削除に失敗しました。');
      }

      const tokenAfter = ensureToken();
      if (!tokenAfter) {
        return;
      }

      await fetchCeremony(tokenAfter, {syncForm: false, showSpinner: false});
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '紐付けの削除に失敗しました。';
      setNominationMessage(message);
      console.error('Remove nomination error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                セレモニー{isNew ? 'の新規作成' : '編集'}
              </h1>
              {ceremonyDetail && (
                <p className="mt-1 text-sm text-gray-500">
                  最終更新: {formatTimestamp(ceremonyDetail.ceremony.updatedAt)}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              {!isNew && navigation && (
                <div className="flex justify-end gap-2">
                  {navigation.previous ? (
                    <a
                      href={`/admin/ceremonies/${navigation.previous.uid}`}
                      className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      ← {formatNavigationLabel(navigation.previous)}
                    </a>
                  ) : (
                    <span className="rounded border border-gray-200 px-3 py-1 text-sm font-medium text-gray-300">
                      ← 前へ
                    </span>
                  )}
                  {navigation.next ? (
                    <a
                      href={`/admin/ceremonies/${navigation.next.uid}`}
                      className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {formatNavigationLabel(navigation.next)} →
                    </a>
                  ) : (
                    <span className="rounded border border-gray-200 px-3 py-1 text-sm font-medium text-gray-300">
                      次へ →
                    </span>
                  )}
                </div>
              )}
              {!isNew && ceremonyDetail?.ceremony.imdbEventUrl && (
                <a
                  href={ceremonyDetail.ceremony.imdbEventUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                >
                  IMDbで表示
                </a>
              )}
              <div className="flex gap-3">
                <a
                  href="/admin/ceremonies"
                  className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  一覧に戻る
                </a>
                {!isNew && (
                  <button
                    type="button"
                    onClick={handleDeleteCeremony}
                    disabled={isDeleting}
                    className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? '削除中…' : 'セレモニーを削除'}
                  </button>
                )}
              </div>
            </div>
          </div>
          {deleteError && (
            <p className="mt-2 text-sm text-red-600">{deleteError}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">基本情報</h2>
          <p className="mt-1 text-sm text-gray-500">
            主催団体や開催期間などの基本情報を編集できます。
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleSave}>
            {awardsLoading ? (
              <div className="rounded bg-gray-50 px-4 py-3 text-sm text-gray-500">
                主催団体を読み込み中です…
              </div>
            ) : awardsError ? (
              <div className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">
                {awardsError}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col text-sm font-medium text-gray-700">
                  主催団体
                  <select
                    name="organizationUid"
                    value={formState.organizationUid}
                    onChange={handleInputChange}
                    className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  >
                    <option value="">選択してください</option>
                    {organizationOptions.map(organization => (
                      <option key={organization.uid} value={organization.uid}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col text-sm font-medium text-gray-700">
                  開催年
                  <input
                    type="number"
                    name="year"
                    value={formState.year}
                    onChange={handleInputChange}
                    placeholder="2025"
                    className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </label>

                <label className="flex flex-col text-sm font-medium text-gray-700">
                  回数
                  <input
                    type="number"
                    name="ceremonyNumber"
                    value={formState.ceremonyNumber}
                    onChange={handleInputChange}
                    placeholder="例: 96"
                    className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    min={1}
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col text-sm font-medium text-gray-700">
                    開始日
                    <input
                      type="date"
                      name="startDate"
                      value={formState.startDate}
                      onChange={handleInputChange}
                      className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex flex-col text-sm font-medium text-gray-700">
                    終了日
                    <input
                      type="date"
                      name="endDate"
                      value={formState.endDate}
                      onChange={handleInputChange}
                      className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                </div>

                <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700">
                  開催場所
                  <input
                    type="text"
                    name="location"
                    value={formState.location}
                    onChange={handleInputChange}
                    placeholder="例: ロサンゼルス"
                    className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>

                <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700">
                  IMDbイベントURL
                  <input
                    type="url"
                    name="imdbEventUrl"
                    value={formState.imdbEventUrl}
                    onChange={handleInputChange}
                    placeholder="https://www.imdb.com/event/ev0000372/1978/1"
                    className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="mt-1 text-xs text-gray-500">
                    IMDb のイベントページへの完全な URL を入力してください（任意）。
                  </span>
                </label>

                <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700">
                  説明
                  <textarea
                    name="description"
                    value={formState.description}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder="補足情報があれば記入してください"
                    className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
              </div>
            )}

            {saveError && (
              <div className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">
                {saveError}
              </div>
            )}

            {saveSuccess && (
              <div className="rounded bg-green-50 px-4 py-3 text-sm text-green-700">
                {saveSuccess}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="submit"
                disabled={isSaving || awardsLoading}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? '保存中…' : '保存する'}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-lg bg-white p-6 shadow">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                紐付いている映画
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                ノミネート・受賞作品を追加・削除できます。
              </p>
            </div>
            {ceremonyDetail && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
                {ceremonyDetail.nominations.length} 件
              </span>
            )}
          </div>

          {detailLoading ? (
            <div className="mt-6 rounded bg-gray-50 px-4 py-3 text-sm text-gray-500">
              ノミネート情報を読み込み中です…
            </div>
          ) : detailError ? (
            <div className="mt-6 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
              {detailError}
            </div>
          ) : ceremonyDetail ? (
            <div className="mt-6 space-y-6">
              {ceremonyDetail.nominations.length === 0 ? (
                <div className="rounded border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                  登録されている映画はありません。
                </div>
              ) : (
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
                      {ceremonyDetail.nominations.map(nomination => (
                        <tr key={nomination.uid}>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div className="font-medium text-gray-900">
                              {nomination.movie.title}
                            </div>
                            <div className="text-xs text-gray-500">
                              UID: {nomination.movie.uid}
                              {nomination.movie.year
                                ? ` / ${nomination.movie.year}年`
                                : ''}
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
                            <button
                              type="button"
                              onClick={() => handleRemoveNomination(nomination.uid)}
                              className="rounded border border-red-600 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                            >
                              削除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 p-4">
                <h3 className="text-md font-semibold text-gray-900">
                  映画を追加
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  映画を検索し、部門を選択して追加します。
                </p>

                <div className="mt-4 space-y-6">
                  <form
                    className="flex flex-col gap-3 md:flex-row md:items-end"
                    onSubmit={handleSearchMovies}
                  >
                    <label className="flex flex-1 flex-col text-sm font-medium text-gray-700">
                      キーワード検索
                      <input
                        type="search"
                        value={movieSearchQuery}
                        onChange={event => setMovieSearchQuery(event.target.value)}
                        placeholder="作品名など"
                        className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSearchingMovies}
                    >
                      {isSearchingMovies ? '検索中…' : '検索'}
                    </button>
                  </form>

                  {movieSearchError && (
                    <div className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">
                      {movieSearchError}
                    </div>
                  )}

                  {selectedMovie && (
                    <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                      選択中: {selectedMovie.title}
                      {selectedMovie.year ? `（${selectedMovie.year}年）` : ''}
                      <button
                        type="button"
                        onClick={() => setSelectedMovie(undefined)}
                        className="ml-3 text-xs underline hover:text-blue-900"
                      >
                        解除
                      </button>
                    </div>
                  )}

                  {movieSearchResults.length > 0 && (
                    <div className="rounded border border-gray-200">
                      <ul className="divide-y divide-gray-200">
                        {movieSearchResults.map(result => (
                          <li key={result.uid} className="flex items-center justify-between px-4 py-3 text-sm">
                            <div>
                              <div className="font-medium text-gray-900">
                                {result.title}
                              </div>
                              <div className="text-xs text-gray-500">
                                UID: {result.uid}
                                {result.year ? ` / ${result.year}年` : ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMovie(result);
                                setMovieSearchResults([]);
                              }}
                              className="rounded border border-blue-600 px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
                            >
                              選択
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <form className="space-y-4" onSubmit={handleAddNomination}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col text-sm font-medium text-gray-700">
                        部門
                        <select
                          value={newNominationCategoryUid}
                          onChange={event =>
                            setNewNominationCategoryUid(event.target.value)
                          }
                          className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          required
                          disabled={categoriesForOrganization.length === 0}
                        >
                          <option value="">選択してください</option>
                          {categoriesForOrganization.map(category => (
                            <option key={category.uid} value={category.uid}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={newNominationIsWinner}
                          onChange={event =>
                            setNewNominationIsWinner(event.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        受賞として登録
                      </label>
                    </div>

                    <label className="flex flex-col text-sm font-medium text-gray-700">
                      特記事項
                      <input
                        type="text"
                        value={newNominationSpecialMention}
                        onChange={event =>
                          setNewNominationSpecialMention(event.target.value)
                        }
                        placeholder="コメント等（任意）"
                        className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </label>

                    {nominationMessage && (
                      <div className="rounded bg-blue-50 px-4 py-3 text-sm text-blue-700">
                        {nominationMessage}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={!selectedMovie || isAddingNomination}
                        className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isAddingNomination ? '追加中…' : '映画を追加'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
              まずセレモニー情報を保存してください。
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
