import type {ImdbEventAwardConfig} from './imdb-event-award';
import {veniceCeremonyNumber} from './venice-ceremony';

export const veniceConfig: ImdbEventAwardConfig = {
  organizationName: 'Venice Film Festival',
  organizationCountry: 'Italy',
  establishedYear: 1932,
  categoryName: 'Golden Lion',
  ceremonyNumber: veniceCeremonyNumber,
  isCompetitionCategory: category =>
    category === null || category === 'Best Film',
  minimumFilmsPerEdition: 2,
};
