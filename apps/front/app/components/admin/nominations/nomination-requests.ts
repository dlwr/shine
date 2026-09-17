import type {EditValues, NewNominationValues} from './nomination-editor-state';

type NominationRequest = {url: string; init: RequestInit};

const trimmedOrUndefined = (value: string) =>
  value.trim() === '' ? undefined : value.trim();

const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

export const isNewNominationComplete = (values: NewNominationValues) =>
  Boolean(values.organizationUid && values.ceremonyUid && values.categoryUid);

export const createNominationRequest = (
  apiUrl: string,
  movieId: string,
  values: NewNominationValues,
): NominationRequest => ({
  url: `${apiUrl}/admin/movies/${movieId}/nominations`,
  init: jsonRequest('POST', {
    ceremonyUid: values.ceremonyUid,
    categoryUid: values.categoryUid,
    isWinner: values.isWinner,
    specialMention: trimmedOrUndefined(values.specialMention),
  }),
});

export const updateNominationRequest = (
  apiUrl: string,
  nominationId: string,
  values: EditValues,
): NominationRequest => ({
  url: `${apiUrl}/admin/nominations/${nominationId}`,
  init: jsonRequest('PUT', {
    isWinner: values.isWinner,
    specialMention: trimmedOrUndefined(values.specialMention),
  }),
});

export const deleteNominationRequest = (
  apiUrl: string,
  nominationId: string,
): NominationRequest => ({
  url: `${apiUrl}/admin/nominations/${nominationId}`,
  init: {method: 'DELETE'},
});
