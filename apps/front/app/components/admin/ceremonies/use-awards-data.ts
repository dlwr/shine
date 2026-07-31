import {useCallback, useEffect, useState} from 'react';
import {adminFetch} from '@/lib/admin-fetch';
import {ensureToken} from './ensure-token';
import type {AwardsCategory, AwardsData, AwardsOrganization} from './types';

export function useAwardsData(apiUrl: string) {
  const [awardsData, setAwardsData] = useState<AwardsData | undefined>();
  const [awardsLoading, setAwardsLoading] = useState(true);
  const [awardsError, setAwardsError] = useState<string | undefined>();

  const fetchAwardsData = useCallback(async () => {
    if (!ensureToken()) {
      return;
    }

    setAwardsLoading(true);
    setAwardsError(undefined);

    try {
      const response = await adminFetch(`${apiUrl}/admin/awards`);

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        organizations: AwardsOrganization[];
        categories: AwardsCategory[];
      };

      setAwardsData({
        organizations: data.organizations ?? [],
        categories: data.categories ?? [],
      });
    } catch (error) {
      console.error('Failed to load awards data:', error);
      setAwardsError('主催団体・部門の取得に失敗しました。');
    } finally {
      setAwardsLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void fetchAwardsData();
  }, [fetchAwardsData]);

  return {awardsData, awardsLoading, awardsError};
}
