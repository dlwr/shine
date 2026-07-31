import {getAdminToken} from '@/lib/admin-fetch';

export const ensureToken = () => {
  if (typeof globalThis === 'undefined') {
    return;
  }

  const token = getAdminToken();
  if (!token) {
    globalThis.location.href = '/admin/login';
    return;
  }

  return token;
};
