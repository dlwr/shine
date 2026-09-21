import {type Environment} from '@shine/database';

export type ScrapeContext = {
  environment: Environment;
  tmdbApiKey: string | undefined;
  isDryRun: boolean;
};
