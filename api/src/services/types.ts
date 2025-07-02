import type {Environment} from 'db';

export type ServiceContext = {
	env: Environment;
	database: ReturnType<typeof import('db').getDatabase>;
};

export type PaginationOptions = {
	page: number;
	limit: number;
};

export type SearchOptions = {
	query?: string;
	year?: number;
	language?: string;
	hasAwards?: boolean;
} & PaginationOptions;

export type MovieSelection = {
	uid: string;
	year: number;
	originalLanguage: string;
	imdbId: string | undefined;
	tmdbId: number | undefined;
	title: string;
	description: string | undefined;
	posterUrl: string | undefined;
	imdbUrl: string | undefined;
	nominations: Array<{
		uid: string;
		isWinner: boolean;
		specialMention?: string | undefined;
		category: {
			uid: string;
			name: string;
		};
		ceremony: {
			uid: string;
			number: number | undefined;
			year: number;
		};
		organization: {
			uid: string;
			name: string;
			shortName: string | undefined;
		};
	}>;
	articleLinks: Array<{
		uid: string;
		url: string;
		title: string;
		description?: string;
	}>;
};

export type DateSeedOptions = {
	locale: string;
	date?: Date;
};

export type TMDBMovieData = {
	title?: string;
	overview?: string;
	poster_path?: string;
	translations?: {
		translations: Array<{
			iso_639_1: string;
			data?: {
				title?: string;
				overview?: string;
			};
		}>;
	};
};

export type UpdateIMDBIdOptions = {
	imdbId: string;
	fetchTMDBData?: boolean;
};

export type MergeMoviesOptions = {
	sourceMovieId: string;
	targetMovieId: string;
	preserveTranslations?: boolean;
	preservePosters?: boolean;
};
