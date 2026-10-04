import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			// Refetch when the tab regains focus so changes made elsewhere (for example by Muse through
			// the API) show up when mom switches back to the schedule.
			refetchOnWindowFocus: true,
			retry: 1,
		},
	},
});