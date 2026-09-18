import {formatDateInput} from './format';
import type {CeremonyResponse} from './types';

export type CeremonyFormState = {
  organizationUid: string;
  year: string;
  ceremonyNumber: string;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  imdbEventUrl: string;
};

export const emptyFormState: CeremonyFormState = {
  organizationUid: '',
  year: '',
  ceremonyNumber: '',
  startDate: '',
  endDate: '',
  location: '',
  description: '',
  imdbEventUrl: '',
};

export const toFormState = (
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

export const toCeremonyPayload = (formState: CeremonyFormState) => ({
  organizationUid: formState.organizationUid,
  year: formState.year,
  ceremonyNumber: formState.ceremonyNumber
    ? Number(formState.ceremonyNumber)
    : undefined,
  startDate: formState.startDate || undefined,
  endDate: formState.endDate || undefined,
  location: formState.location || undefined,
  description: formState.description || undefined,
  imdbEventUrl:
    formState.imdbEventUrl.trim() === '' ? undefined : formState.imdbEventUrl,
});

export const validateCeremonyForm = (formState: CeremonyFormState) => {
  if (!formState.organizationUid) {
    return '主催団体を選択してください。';
  }

  if (!formState.year) {
    return '開催年を入力してください。';
  }

  return;
};
