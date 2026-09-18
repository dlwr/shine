import {Button} from '@/components/ui/button';
import {CeremonyFormFields} from './ceremony-form-fields';
import {useCeremonyForm} from './use-ceremony-form';
import type {AwardsOrganization, CeremonyResponse} from './types';

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
  const {
    formState,
    saveError,
    saveSuccess,
    isSaving,
    handleInputChange,
    handleSave,
  } = useCeremonyForm({
    apiUrl,
    ceremonyUid,
    isNew,
    ceremonyDetail,
    organizations,
    onSaved,
    onOrganizationUidChange,
  });

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
          <CeremonyFormFields
            formState={formState}
            organizations={organizations}
            onChange={handleInputChange}
          />
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
