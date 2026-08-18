import {useEffect, useState} from 'react';
import type {AvailabilityInfo} from '@/components/editorial/availability-badges';

type CheckResponse = {
  available?: boolean;
  availability?: AvailabilityInfo[];
};

export function useOnDemandAvailability(options: {
  movieUid: string;
  apiUrl: string;
  initial?: AvailabilityInfo[];
}): {availability: AvailabilityInfo[]; checking: boolean} {
  const {movieUid, apiUrl, initial} = options;
  const hasInitial = Boolean(initial && initial.length > 0);
  const isSkip = hasInitial || movieUid === '';
  const [availability, setAvailability] = useState<AvailabilityInfo[]>(
    initial ?? [],
  );
  const [checking, setChecking] = useState(!isSkip);

  useEffect(() => {
    if (isSkip) {
      return;
    }

    let isCancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `${apiUrl}/movies/${movieUid}/availability/check`,
          {method: 'POST'},
        );
        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as CheckResponse;
        if (!isCancelled) {
          setAvailability(body.availability ?? []);
        }
      } catch {
        // 確認に失敗してもページ表示には影響させない
      } finally {
        if (!isCancelled) {
          setChecking(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [movieUid, apiUrl, isSkip]);

  return {availability, checking};
}
