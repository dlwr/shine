export type Announcement = {
  text: string;
  url: string;
  title: string;
  description: string;
  imageUrl: string;
};

const FIELDS = ['text', 'url', 'title', 'description', 'imageUrl'] as const;

export function parseAnnouncement(raw: unknown): Announcement {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('告知ファイルはオブジェクトである必要があります');
  }

  const record = raw as Record<string, unknown>;
  const missing = FIELDS.filter(
    field => typeof record[field] !== 'string' || record[field] === '',
  );
  if (missing.length > 0) {
    throw new Error(`告知ファイルに ${missing.join(', ')} がありません`);
  }

  return Object.fromEntries(
    FIELDS.map(field => [field, record[field]]),
  ) as Announcement;
}
