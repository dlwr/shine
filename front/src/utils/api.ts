/**
 * Get the API URL for the current environment
 * Handles both development and production environments consistently
 */
export function getApiUrl(astroLocals?: {
  runtime?: { env?: Record<string, string> };
}): string {
  // For Cloudflare Workers runtime environment
  const runtimeEnvironment = astroLocals?.runtime?.env;

  // Priority order:
  // 1. Runtime environment variable (Cloudflare Workers/Pages)
  // 2. Build-time environment variable (Astro)
  // 3. Development fallback
  return (
    runtimeEnvironment?.PUBLIC_API_URL ||
    import.meta.env.PUBLIC_API_URL ||
    "http://localhost:8787"
  );
}

/**
 * Client-side API URL getter (for use in browser scripts)
 */
export function getClientApiUrl(): string {
  return import.meta.env.PUBLIC_API_URL || "http://localhost:8787";
}
