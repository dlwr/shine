type CloudflareContext = {
  cloudflare?: {env?: {PUBLIC_API_URL?: string; QUIZ_ANSWER_KEY?: string}};
};

export function resolveApiUrl(context: unknown): string {
  return (
    (context as CloudflareContext)?.cloudflare?.env?.PUBLIC_API_URL ??
    'http://localhost:8787'
  );
}

export function resolveQuizKey(context: unknown): string | undefined {
  return (context as CloudflareContext)?.cloudflare?.env?.QUIZ_ANSWER_KEY;
}
