import {useEffect, useState} from 'react';
import {getAdminToken} from '@/lib/admin-fetch';

export function useAdminToken() {
  const [adminToken, setAdminToken] = useState<string | undefined>();

  useEffect(() => {
    if (globalThis.window === undefined) {
      return;
    }

    setAdminToken(getAdminToken());

    const handleAdminLogin = () => {
      setAdminToken(getAdminToken());
    };

    const handleAdminLogout = () => {
      setAdminToken(undefined);
    };

    addEventListener('adminLogin', handleAdminLogin);
    addEventListener('adminLogout', handleAdminLogout);

    return () => {
      removeEventListener('adminLogin', handleAdminLogin);
      removeEventListener('adminLogout', handleAdminLogout);
    };
  }, []);

  return adminToken;
}
