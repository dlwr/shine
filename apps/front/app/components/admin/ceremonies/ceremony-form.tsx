import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {adminFetch} from '@/lib/admin-fetch';
import {ensureToken} from './ensure-token';
import {formatDateInput} from './format';
import type {AwardsOrganization, CeremonyResponse} from './types';

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

const toFormState = (
  ceremony: CeremonyResponse['ceremony'],
): CeremonyFormState => ({
  organizationUid: ceremony.organizationUid,
  year: ceremony.year.toString(),
  ceremonyNumber: ceremony.ceremonyNumber?.toString() ?? '',
  startDate: formatDateInput(ceremony.startDate),
  endDate: formatDateInput(ceremony.endDate),
  location: ceremony.location ?? '',
  description: ceremony.description ?? '',
  imdbEventUrl: ceremony.imdbEventUrl ?? '',
});

type CeremonyFormProperties = {
  apiUrl: string;
  ceremonyUid: string;
  isNew: boolean;
  ceremonyDetail: CeremonyResponse | undefined;
  awardsLoading: boolean;
  awardsError: string | undefined;
  organizations: AwardsOrganization[];
  onSaved: (saved: CeremonyResponse) => void;
  onOrganizationUidChange: (organizationUid: string) => void;
};

export function CeremonyForm({
  apiUrl,
  ceremonyUid,
  isNew,
  ceremonyDetail,
  awardsLoading,
  awardsError,
  organizations,
  onSaved,
  onOrganizationUidChange,
}: CeremonyFormProperties) {
  const [formState, setFormState] = useState<CeremonyFormState>(emptyFormState);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saveSuccess, setSaveSuccess] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const syncedUidReference = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!ceremonyDetail) {
      return;
    }

    if (syncedUidReference.current === ceremonyDetail.ceremony.uid) {
      return;
    }

    syncedUidReference.current = ceremonyDetail.ceremony.uid;
    setFormState(toFormState(ceremonyDetail.ceremony));
  }, [ceremonyDetail]);

  useEffect(() => {
    if (isNew && formState.organizationUid === '' && organizations.length > 0) {
      setFormState(current => ({
        ...current,
        organizationUid: organizations[0]?.uid ?? '',
      }));
    }
  }, [organizations, formState.organizationUid, isNew]);

  useEffect(() => {
    onOrganizationUidChange(formState.organizationUid);
  }, [formState.organizationUid, onOrganizationUidChange]);

  const handleInputChange = (
    event:
      | FormEvent<HTMLInputElement>
      | FormEvent<HTMLTextAreaElement>
      | FormEvent<HTMLSelectElement>,
  ) => {
    const target = event.target as
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
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

    if (!ensureToken()) {
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
          formState.imdbEventUrl.trim() === ''
            ? undefined
            : formState.imdbEventUrl,
      };

      const response = await adminFetch(
        `${apiUrl}/admin/ceremonies${
          isNew ? '' : `/${ceremonyDetail?.ceremony.uid ?? ceremonyUid}`
        }`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.status === 401) {
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

      onSaved(saved);
      setSaveSuccess('セレモニーを保存しました。');
      setFormState(toFormState(saved.ceremony));
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

  return (
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
                required>
                <option value="">選択してください</option>
                {organizations.map(organization => (
                  <option key={organization.uid} value={organization.uid}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-sm font-medium text-gray-700">
              開催年
              <Input
                type="number"
                name="year"
                value={formState.year}
                onChange={handleInputChange}
                placeholder="2025"
                className="mt-1"
                required
              />
            </label>

            <label className="flex flex-col text-sm font-medium text-gray-700">
              回数
              <Input
                type="number"
                name="ceremonyNumber"
                value={formState.ceremonyNumber}
                onChange={handleInputChange}
                placeholder="例: 96"
                className="mt-1"
                min={1}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm font-medium text-gray-700">
                開始日
                <Input
                  type="date"
                  name="startDate"
                  value={formState.startDate}
                  onChange={handleInputChange}
                  className="mt-1"
                />
              </label>

              <label className="flex flex-col text-sm font-medium text-gray-700">
                終了日
                <Input
                  type="date"
                  name="endDate"
                  value={formState.endDate}
                  onChange={handleInputChange}
                  className="mt-1"
                />
              </label>
            </div>

            <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700">
              開催場所
              <Input
                type="text"
                name="location"
                value={formState.location}
                onChange={handleInputChange}
                placeholder="例: ロサンゼルス"
                className="mt-1"
              />
            </label>

            <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700">
              IMDbイベントURL
              <Input
                type="url"
                name="imdbEventUrl"
                value={formState.imdbEventUrl}
                onChange={handleInputChange}
                placeholder="https://www.imdb.com/event/ev0000372/1978/1"
                className="mt-1"
              />
              <span className="mt-1 text-xs text-gray-500">
                IMDb のイベントページへの完全な URL を入力してください（任意）。
              </span>
            </label>

            <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700">
              説明
              <Textarea
                name="description"
                value={formState.description}
                onChange={handleInputChange}
                rows={4}
                placeholder="補足情報があれば記入してください"
                className="mt-1"
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
          <Button
            type="submit"
            disabled={isSaving || awardsLoading}
            className="bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">
            {isSaving ? '保存中…' : '保存する'}
          </Button>
        </div>
      </form>
    </section>
  );
}
