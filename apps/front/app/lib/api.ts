type CloudflareContext = {
  cloudflare?: {env?: {PUBLIC_API_URL?: string}};
};

export function resolveApiUrl(context: unknown): string {
  return (
    (context as CloudflareContext)?.cloudflare?.env?.PUBLIC_API_URL ??
    'http://localhost:8787'
  );
}
