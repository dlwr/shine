import {sanitizeText, sanitizeUrl} from '../middleware/sanitizer';
import {ValidationError} from './errors';

export type CeremonyBody = {
  organizationUid?: unknown;
  year?: unknown;
  ceremonyNumber?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  location?: unknown;
  description?: unknown;
  imdbEventUrl?: unknown;
};

export type CeremonyInput = {
  organizationUid: string;
  year: number;
  ceremonyNumber?: number;
  startDate?: number;
  endDate?: number;
  location?: string;
  description?: string;
  imdbEventUrl?: string;
};

const parseInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return;
};

const parseYear = (value: unknown): number | undefined => {
  const parsed = parseInteger(value);
  if (parsed === undefined || parsed < 1880 || parsed > 9999) {
    return;
  }
  return parsed;
};

const parseCeremonyNumber = (value: unknown): number | undefined => {
  const parsed = parseInteger(value);
  if (parsed === undefined) {
    return;
  }
  return parsed > 0 ? parsed : undefined;
};

const parseUnixTimestamp = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return Math.floor(parsed.getTime() / 1000);
    }
  }

  return;
};

const sanitizeOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return;
  }

  const sanitized = sanitizeText(value).trim();
  return sanitized.length > 0 ? sanitized : undefined;
};

const parseOptionalUrl = (value: unknown): string | undefined => {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'string') {
    throw new TypeError('Invalid URL');
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return;
  }

  return sanitizeUrl(trimmed);
};

export function parseCeremonyBody(body: CeremonyBody): CeremonyInput {
  const rawOrganizationUid = body.organizationUid;
  if (
    typeof rawOrganizationUid !== 'string' ||
    rawOrganizationUid.trim() === ''
  ) {
    throw new ValidationError('organizationUid is required');
  }

  const organizationUid = sanitizeText(rawOrganizationUid).trim();
  if (organizationUid === '') {
    throw new ValidationError('organizationUid is required');
  }

  const year = parseYear(body.year);
  if (year === undefined) {
    throw new ValidationError('year must be a valid number (1880-9999)');
  }

  const ceremonyNumber = parseCeremonyNumber(body.ceremonyNumber);
  const startDate = parseUnixTimestamp(body.startDate);
  const endDate = parseUnixTimestamp(body.endDate);

  if (startDate !== undefined && endDate !== undefined && endDate < startDate) {
    throw new ValidationError('endDate must be the same as or after startDate');
  }

  const location = sanitizeOptionalText(body.location);
  const description = sanitizeOptionalText(body.description);

  let imdbEventUrl: string | undefined;
  try {
    imdbEventUrl = parseOptionalUrl(body.imdbEventUrl);
  } catch {
    throw new ValidationError('imdbEventUrl must be a valid http(s) URL');
  }

  return {
    organizationUid,
    year,
    ceremonyNumber,
    startDate,
    endDate,
    location,
    description,
    imdbEventUrl,
  };
}
