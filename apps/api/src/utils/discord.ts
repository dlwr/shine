export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<{ok: boolean; status?: number}>;

export async function postDiscordMessage(
  webhookUrl: string | undefined,
  content: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  if (!webhookUrl) {
    return;
  }

  try {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({content}),
    });

    if (!response.ok) {
      console.error('Discord notification failed', response.status);
    }
  } catch (error) {
    console.error('Error posting Discord message:', error);
  }
}
