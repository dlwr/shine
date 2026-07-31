/**
 * 可用性チェック結果を投稿用ラベルへ変換する。
 * apps/front の AvailabilityBadges と同じ表記に揃える。
 */
export type AvailabilityEntry = {
  source: string;
  detail?: string;
};

const OFFERING_PATTERN = /^(?<service>.+)\((?<kind>見放題|レンタル|購入)\)$/;

export function buildAvailabilityLabels(
  availability: AvailabilityEntry[],
): string[] {
  const labels: string[] = [];

  const tmdb = availability.find(entry => entry.source === 'tmdb');
  const offerings = (tmdb?.detail ?? '')
    .split(', ')
    .map(entry => OFFERING_PATTERN.exec(entry)?.groups)
    .filter(groups => groups !== undefined);

  const subscriptionServices = [
    ...new Set(
      offerings
        .filter(offering => offering.kind === '見放題')
        .map(offering => offering.service),
    ),
  ];
  for (const service of subscriptionServices) {
    labels.push(`${service} 見放題`);
  }

  if (
    subscriptionServices.length === 0 &&
    offerings.some(offering => offering.kind !== '見放題')
  ) {
    labels.push('レンタル配信あり');
  }

  if (
    availability.some(entry => entry.source === 'unext') &&
    !subscriptionServices.includes('U-NEXT')
  ) {
    labels.push('U-NEXT');
  }

  if (availability.some(entry => entry.source === 'discas')) {
    labels.push('宅配レンタル');
  }

  return labels;
}
