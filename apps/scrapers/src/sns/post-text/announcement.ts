import {withBareUrl, withHashtag} from './framing';

type AnnouncementPostInput = {
  text: string;
};

export function buildAnnouncementPostText({
  text,
}: AnnouncementPostInput): string {
  return withHashtag(text);
}

export function buildAnnouncementXPostText({
  text,
  url,
}: AnnouncementPostInput & {url: string}): string {
  return withBareUrl(text, url);
}
