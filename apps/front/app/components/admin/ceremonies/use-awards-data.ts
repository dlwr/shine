import {useCallback, useEffect, useState} from 'react';
import {adminJson} from '@/lib/admin-fetch';
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
      const data = await adminJson<{
        organizations: AwardsOrganization[];
        categories: AwardsCategory[];
      }>(`${apiUrl}/admin/awards`, 'Failed to fetch awards');
      if (!data) {
        return;
      }

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
