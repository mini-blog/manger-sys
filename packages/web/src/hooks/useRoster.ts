import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';

export const rosterKey = (userId: string | undefined, sessionId: string) => [
  'roster',
  userId,
  sessionId,
];
export function useRoster(sessionId: string) {
  const { auth, refresh } = useAuth();
  return useQuery({
    queryKey: rosterKey(auth?.user.id, sessionId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/sessions/{id}/participants', {
        params: { path: { id: sessionId } },
      });
      if (response.status === 401) refresh(null);
      if (!data) throw apiError(error, undefined, response.status);
      return data;
    },
  });
}
