import {type getDatabase} from '@shine/database';

export type MisattributedNomination = {
  organization: string;
  category: string;
  ceremonyYear: number;
  specialMention?: string | undefined;
  wrongImdbId: string;
  correctImdbId: string | undefined;
  correctTitle: string;
  correctYear: number;
};

export type FixMisattributedStats = {
  repointed: number;
  deletedDuplicate: number;
  moviesCreated: number;
  moviesRevived: number;
  skipped: number;
  failed: number;
  affectedMovieUids: string[];
};

export type Database = ReturnType<typeof getDatabase>;
