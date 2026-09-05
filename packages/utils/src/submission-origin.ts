export const DEFAULT_OWNER_URL_PREFIXES = ['https://scrapbox.io/yuta25/'];

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', 'localhost']);

export type SubmissionOrigin = 'owner' | 'test' | 'other';

export type OriginRules = {
  ownerUrlPrefixes: string[];
  ownerIps: string[];
};

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function parseOriginRules(source: {
  NORTH_STAR_OWNER_URL_PREFIXES?: string;
  NORTH_STAR_OWNER_IPS?: string;
}): OriginRules {
  const prefixes = parseList(source.NORTH_STAR_OWNER_URL_PREFIXES);

  return {
    ownerUrlPrefixes:
      prefixes.length > 0 ? prefixes : [...DEFAULT_OWNER_URL_PREFIXES],
    ownerIps: parseList(source.NORTH_STAR_OWNER_IPS),
  };
}

export function classifySubmission(
  link: {
    url?: string | undefined | null;
    submitterIp?: string | undefined | null;
  },
  rules: OriginRules,
): SubmissionOrigin {
  const ip = link.submitterIp ?? '';

  if (rules.ownerIps.includes(ip)) {
    return 'owner';
  }

  const url = link.url ?? '';

  if (url && rules.ownerUrlPrefixes.some(prefix => url.startsWith(prefix))) {
    return 'owner';
  }

  if (LOOPBACK_IPS.has(ip)) {
    return 'test';
  }

  return 'other';
}
