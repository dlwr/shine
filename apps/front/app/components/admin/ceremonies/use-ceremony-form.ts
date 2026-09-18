import {useEffect, useRef, useState, type FormEvent} from 'react';
import {adminFetch} from '@/lib/admin-fetch';
import {
  emptyFormState,
  toCeremonyPayload,
  toFormState,
  validateCeremonyForm,
  type CeremonyFormState,
} from './ceremony-form-state';
import {ensureToken} from './ensure-token';
import type {AwardsOrganization, CeremonyResponse} from './types';

const readErrorMessage = (body: unknown) =>
  body &&
  typeof body === 'object' &&
  'error' in body &&
  typeof (body as {error?: unknown}).error === 'string'
    ? (body as {error: string}).error
    : 'セレモニーの保存に失敗しました。';

type UseCeremonyFormOptions = {
  apiUrl: string;
  ceremonyUid: string;
  isNew: boolean;
  ceremonyDetail: CeremonyResponse | undefined;
  organizations: AwardsOrganization[];
  onSaved: (saved: CeremonyResponse) => void;
  onOrganizationUidChange: (organizationUid: string) => void;
};

export function useCeremonyForm({
  apiUrl,
  ceremonyUid,
  isNew,
  ceremonyDetail,
  organizations,
  onSaved,
  onOrganizationUidChange,
}: UseCeremonyFormOptions) {
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

    const validationError = validateCeremonyForm(formState);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    if (!ensureToken()) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await adminFetch(
        `${apiUrl}/admin/ceremonies${
          isNew ? '' : `/${ceremonyDetail?.ceremony.uid ?? ceremonyUid}`
        }`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(toCeremonyPayload(formState)),
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
        throw new Error(readErrorMessage(responseBody));
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

  return {
    formState,
    saveError,
    saveSuccess,
    isSaving,
    handleInputChange,
    handleSave,
  };
}
