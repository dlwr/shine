import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseAnnouncement} from '../announcement';
import {type PostPlan} from '../post-plan';
import {
  buildAnnouncementPostText,
  buildAnnouncementXPostText,
} from '../post-text/announcement';

const ANNOUNCEMENTS_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../data/sns-announcements',
);

export async function buildAnnouncementPlan(name: string): Promise<PostPlan> {
  if (!/^[\w-]+$/.test(name)) {
    throw new Error(`告知名が不正です: ${name}`);
  }

  const filePath = path.join(ANNOUNCEMENTS_DIRECTORY, `${name}.json`);
  const announcement = parseAnnouncement(
    JSON.parse(await fs.readFile(filePath, 'utf8')),
  );

  return {
    text: buildAnnouncementPostText(announcement),
    xText: buildAnnouncementXPostText(announcement),
    link: {
      uri: announcement.url,
      title: announcement.title,
      description: announcement.description,
    },
    imageUrl: announcement.imageUrl,
  };
}
