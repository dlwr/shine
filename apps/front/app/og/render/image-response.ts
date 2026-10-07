import type {ImageResponse} from 'workers-og';

export async function createImageResponse(
  ...parameters: ConstructorParameters<typeof ImageResponse>
): Promise<ImageResponse> {
  const workersOg = await import('workers-og');
  return new workersOg.ImageResponse(...parameters);
}
