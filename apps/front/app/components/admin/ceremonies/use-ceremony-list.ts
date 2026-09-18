import {useEffect, useMemo, useState} from 'react';
import {adminFetch} from '@/lib/admin-fetch';
import {filterCeremonies, organizationOptions} from './ceremony-list';
import {ensureToken} from './ensure-token';
import type {CeremonyListItem} from './types';

export function useCeremonyList(apiUrl: string) {
  const [ceremonies, setCeremonies] = useState<CeremonyListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState('');

  useEffect(() => {
    const loadCeremonies = async () => {
      if (!ensureToken()) {
        return;
      }

      setIsLoading(true);
      setError(undefined);

      try {
        const response = await adminFetch(`${apiUrl}/admin/ceremonies`);

        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }

        const data = (await response.json()) as {
          ceremonies: CeremonyListItem[];
        };
        setCeremonies(data.ceremonies ?? []);
      } catch (fetchError) {
        console.error('Failed to load ceremonies:', fetchError);
        setError('セレモニー一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    };

    void loadCeremonies();
  }, [apiUrl]);

  const organizations = useMemo(
    () => organizationOptions(ceremonies),
    [ceremonies],
  );

  const filteredCeremonies = useMemo(
    () => filterCeremonies(ceremonies, searchQuery, organizationFilter),
    [ceremonies, searchQuery, organizationFilter],
  );

  return {
    isLoading,
    error,
    organizations,
    filteredCeremonies,
    searchQuery,
    setSearchQuery,
    organizationFilter,
    setOrganizationFilter,
  };
}
