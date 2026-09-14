import {type getDatabase} from '@shine/database';

export type ImdbEventAwardConfig = {
  organizationName: string;
  organizationCountry: string;
  establishedYear: number;
  categoryName: string;
  categoryShortName?: string;
  ceremonyNumber: (year: number) => number | undefined;
  isCompetitionCategory: (category: string | null) => boolean;
  minimumFilmsPerEdition: number;
  /** 個人賞のとき、人物をどのクレジットから引き当てるか */
  personRole?: 'director' | 'actor';
  /** ノミネーションのnotesをspecialMentionとして保存する */
  useNotesAsSpecialMention?: boolean;
  winnerCorrections?: Array<{
    year: number;
    imdbId: string;
    isWinner: boolean;
  }>;
};

export type ImdbEventNominationTitle = {
  imdbId: string;
  title: string | null;
  originalTitle: string | null;
};

type ImdbEventNominationPerson = {
  name: string;
};

export type ImdbEventNomination = {
  isWinner: boolean;
  notes: string | null;
  titles: ImdbEventNominationTitle[];
  /** 個人賞の受賞者・候補者。指定すると作品だけの行は作らない */
  people?: ImdbEventNominationPerson[];
};

export type ImdbEventCategory = {
  category: string | null;
  total: number | null;
  nominations: ImdbEventNomination[];
};

export type ImdbEventEdition = {
  year: number;
  awardNames: string[];
  targetAward: Array<{
    categories: ImdbEventCategory[];
  }>;
};

export type ImdbEventCollectedData = {
  collectedAt: string;
  source: string;
  editions: ImdbEventEdition[];
};

export type AwardPerson = {
  name: string;
  isWinner: boolean;
};

export type AwardFilm = {
  imdbId: string;
  title: string | null;
  originalTitle: string | null;
  isWinner: boolean;
  specialMention?: string;
  people?: AwardPerson[];
};

export type AwardEdition = {
  year: number;
  films: AwardFilm[];
};

export type ImdbEventImportStats = {
  editionsProcessed: number;
  moviesCreated: number;
  moviesExisting: number;
  skippedSoftDeleted: number;
  nominationsCreated: number;
  winnersUpdated: number;
  tmdbNotFound: number;
  peopleUnresolved: number;
  failed: number;
};

export type PersonRole = NonNullable<ImdbEventAwardConfig['personRole']>;

export type DatabaseClient = ReturnType<typeof getDatabase>;

export type ImportContext = {
  database: DatabaseClient;
  config: ImdbEventAwardConfig;
  tmdbApiKey: string | undefined;
  throttleMs: number;
  stats: ImdbEventImportStats;
  personOverrides: ReadonlyMap<string, number>;
};
