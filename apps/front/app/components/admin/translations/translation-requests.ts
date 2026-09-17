import type {TranslationValues} from './types';

type TranslationRequest = {url: string; init: RequestInit};

export const hasRequiredTranslationFields = (values: TranslationValues) =>
  Boolean(values.languageCode.trim() && values.content.trim());

export const saveTranslationRequest = (
  apiUrl: string,
  movieId: string,
  values: TranslationValues,
): TranslationRequest => ({
  url: `${apiUrl}/movies/${movieId}/translations`,
  init: {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      languageCode: values.languageCode.trim(),
      content: values.content.trim(),
      isDefault: values.isDefault,
    }),
  },
});

export const deleteTranslationRequest = (
  apiUrl: string,
  movieId: string,
  languageCode: string,
): TranslationRequest => ({
  url: `${apiUrl}/movies/${movieId}/translations/${languageCode}`,
  init: {method: 'DELETE'},
});
