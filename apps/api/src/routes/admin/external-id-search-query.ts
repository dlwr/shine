import {sanitizeText} from '../../middleware/sanitizer';

type ExternalIdSearchOptions = {
  query?: string;
  language?: 'ja-JP' | 'en-US';
  year?: number;
  limit?: number;
};

type Parsed =
  {ok: true; options: ExternalIdSearchOptions} | {ok: false; error: string};

function toLanguage(raw: string | undefined): 'ja-JP' | 'en-US' | undefined {
  if (!raw) {
    return undefined;
  }

  const sanitized = sanitizeText(raw);
  if (/^ja/i.test(sanitized)) {
    return 'ja-JP';
  }

  if (/^en/i.test(sanitized)) {
    return 'en-US';
  }

  return undefined;
}

export function parseExternalIdSearchQuery(raw: {
  query?: string;
  language?: string;
  year?: string;
  limit?: string;
}): Parsed {
  const year = raw.year ? Number(raw.year) : undefined;
  if (year !== undefined && Number.isNaN(year)) {
    return {ok: false, error: 'Invalid year parameter'};
  }

  const limit = raw.limit ? Number(raw.limit) : undefined;
  if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
    return {ok: false, error: 'Invalid limit parameter'};
  }

  const options: ExternalIdSearchOptions = {};
  if (raw.query) {
    options.query = sanitizeText(raw.query);
  }

  const language = toLanguage(raw.language);
  if (language) {
    options.language = language;
  }

  if (year !== undefined) {
    options.year = year;
  }

  if (limit !== undefined) {
    options.limit = limit;
  }

  return {ok: true, options};
}
