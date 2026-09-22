// Workers Logs は console.error に渡した Error の cause を落とすので、別の行に文字で出す
export function logErrorWithCause(heading: string, error: unknown): void {
  console.error(heading, error);
  if (!(error instanceof Error) || error.cause === undefined) {
    return;
  }

  const {cause} = error;
  console.error(
    'Caused by:',
    cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
  );
}
