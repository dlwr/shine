import {createEnvironmentContext, type FrontEnvironment} from '@/lib/api';
import {handleOgRequest} from '@/og/router';

export default {
  async fetch(request, environment) {
    return handleOgRequest(
      request,
      createEnvironmentContext(environment, request),
    );
  },
} satisfies ExportedHandler<FrontEnvironment>;
