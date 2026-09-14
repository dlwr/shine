const TURNSTILE_VERIFY_ENDPOINT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type TurnstileVerificationResponse = {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

export async function verifyTurnstileToken(
  secretKey: string | undefined,
  token: string,
  remoteIp: string,
): Promise<TurnstileVerificationResponse> {
  if (!secretKey) {
    throw new Error('TURNSTILE_SECRET_KEY is not configured');
  }

  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);

  if (remoteIp && remoteIp !== 'unknown') {
    formData.append('remoteip', remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      `Turnstile verification failed with status ${response.status}`,
    );
  }

  return (await response.json()) as TurnstileVerificationResponse;
}
