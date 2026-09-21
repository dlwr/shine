type FetchInput = Parameters<typeof fetch>[0];

export function resolveRequestTimeout(
  value: string | undefined,
): number | undefined {
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined;
}

export function createTimeoutFetch(timeoutMs: number) {
  return async (input: FetchInput, init?: RequestInit): Promise<Response> =>
    fetch(input, {...init, signal: AbortSignal.timeout(timeoutMs)});
}
