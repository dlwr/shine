const URL_IN_TEXT = /https?:\/\/\S+/;

export function httpUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function sharedUrl(parameters: URLSearchParams): string | undefined {
  return (
    httpUrl(parameters.get('url') ?? undefined) ??
    httpUrl(URL_IN_TEXT.exec(parameters.get('text') ?? '')?.[0])
  );
}
