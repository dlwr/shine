const TRANSFORMATION_PREFIX = '/cdn-cgi/image/format=auto,quality=80/';

export function transformedImageUrl(path: string, isEnabled: boolean): string {
  if (!isEnabled) {
    return path;
  }

  return `${TRANSFORMATION_PREFIX}${path.replace(/^\//, '')}`;
}
