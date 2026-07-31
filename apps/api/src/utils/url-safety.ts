type UrlValidationResult = {ok: true; url: URL} | {ok: false; reason: string};

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0']);
const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost'];

function parseIpv4(hostname: string): number | undefined {
  if (/^\d+$/.test(hostname)) {
    const value = Number(hostname);
    return value <= 0xff_ff_ff_ff ? value : undefined;
  }

  if (/^0x[\da-f]+$/i.test(hostname)) {
    const value = Number.parseInt(hostname, 16);
    return value <= 0xff_ff_ff_ff ? value : undefined;
  }

  const dottedMatch = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(
    hostname,
  );
  if (!dottedMatch) {
    return undefined;
  }

  const octets = dottedMatch.slice(1).map(Number);
  if (octets.some(octet => octet > 255)) {
    return undefined;
  }

  return (
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  );
}

function isPrivateIpv4(address: number): boolean {
  const firstOctet = address >>> 24;
  const secondOctet = (address >>> 16) & 0xff;

  return (
    firstOctet === 0 ||
    firstOctet === 10 ||
    firstOctet === 127 ||
    (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) ||
    (firstOctet === 169 && secondOctet === 254) ||
    (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
    (firstOctet === 192 && secondOctet === 168)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const address = hostname.replaceAll(/^\[|]$/g, '').toLowerCase();
  return (
    address === '::1' ||
    address === '::' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    address.startsWith('fe80') ||
    address.startsWith('::ffff:')
  );
}

export function validateExternalUrl(rawUrl: string): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {ok: false, reason: 'Invalid URL format'};
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {ok: false, reason: 'Only http and https URLs are allowed'};
  }

  if (url.port !== '') {
    return {ok: false, reason: 'Non-default ports are not allowed'};
  }

  const hostname = url.hostname.toLowerCase();

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_HOSTNAME_SUFFIXES.some(suffix => hostname.endsWith(suffix))
  ) {
    return {ok: false, reason: 'Host is not allowed'};
  }

  if (hostname.startsWith('[')) {
    if (isPrivateIpv6(hostname)) {
      return {ok: false, reason: 'Host is not allowed'};
    }

    return {ok: true, url};
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4 !== undefined && isPrivateIpv4(ipv4)) {
    return {ok: false, reason: 'Host is not allowed'};
  }

  if (ipv4 === undefined && /^[\d.x]+$/i.test(hostname)) {
    return {ok: false, reason: 'Host is not allowed'};
  }

  return {ok: true, url};
}
