import {useEffect, useState} from 'react';
import {adminJson, getAdminToken} from '@/lib/admin-fetch';
import type {AwardsData} from './types';

export function useAwardsData(apiUrl: string) {
  const [awardsData, setAwardsData] = useState<AwardsData | undefined>();
  const [loadingAwards, setLoadingAwards] = useState(true);
  const [awardsError, setAwardsError] = useState<string | undefined>();

  useEffect(() => {
    const loadAwards = async () => {
      if (globalThis.window === undefined) {
        return;
      }

      if (!getAdminToken()) {
        location.assign('/admin/login');
        return;
      }

      setLoadingAwards(true);
      setAwardsError(undefined);

      try {
        const data = await adminJson<AwardsData>(
          `${apiUrl}/admin/awards`,
          'Failed to fetch awards data',
        );
        if (!data) {
          return;
        }

        setAwardsData(data);
      } catch (error) {
        console.error('Error loading awards data:', error);
        setAwardsError('授賞データの取得に失敗しました');
      } finally {
        setLoadingAwards(false);
      }
    };

    void loadAwards();
  }, [apiUrl]);

  return {awardsData, loadingAwards, awardsError};
}
