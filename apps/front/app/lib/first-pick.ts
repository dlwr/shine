import type {AwardDetailData, PersonData} from './api-types';

export type FirstPick = {
  label: string;
  movie: {uid: string; title?: string; year?: number; posterUrl?: string};
};

type Credit = PersonData['credits'][number];

const CREDIT_RANKS: Array<{
  label: string;
  matches: (credit: Credit) => boolean;
}> = [
  {
    label: '受賞',
    matches: credit => credit.personAwards.some(award => award.isWinner),
  },
  {
    label: '受賞作',
    matches: credit => credit.awards.some(award => award.isWinner),
  },
  {label: '候補', matches: credit => credit.personAwards.length > 0},
  {label: '近作', matches: () => true},
];

export function personFirstPick(credits: Credit[]): FirstPick | undefined {
  const watchable = credits.filter(
    credit => credit.availabilityStatus === 'watchable',
  );

  for (const rank of CREDIT_RANKS) {
    const credit = watchable.find(candidate => rank.matches(candidate));
    if (credit) {
      return {
        label: rank.label,
        movie: {
          uid: credit.movieUid,
          title: credit.title,
          year: credit.year,
          posterUrl: credit.posterUrl,
        },
      };
    }
  }

  return undefined;
}

export function awardFirstPick(award: AwardDetailData): FirstPick | undefined {
  for (const group of award.years.slice(1)) {
    const movie = group.movies.find(
      candidate =>
        candidate.isWinner && candidate.availabilityStatus === 'watchable',
    );
    if (movie) {
      return {
        label: group.ceremonyNumber
          ? `第${group.ceremonyNumber}回`
          : String(group.year),
        movie: {
          uid: movie.uid,
          title: movie.title,
          year: movie.movieYear,
          posterUrl: movie.posterUrl,
        },
      };
    }
  }

  return undefined;
}
