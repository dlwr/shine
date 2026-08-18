import {createEnvironmentContext, type FrontEnvironment} from '@/lib/api';

export function createMockContext(
  apiUrl = 'http://localhost:8787',
  environment: FrontEnvironment = {},
) {
  return createEnvironmentContext({PUBLIC_API_URL: apiUrl, ...environment});
}
