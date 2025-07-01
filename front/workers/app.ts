import {createRequestHandler} from 'react-router';

const requestHandler = createRequestHandler(
	async () => import('virtual:react-router/server-build'),
	import.meta.env.MODE,
);

export default {
	async fetch(request, environment, context) {
		return requestHandler(request, {
			cloudflare: {env: environment, ctx: context},
		});
	},
} satisfies ExportedHandler<Env>;
