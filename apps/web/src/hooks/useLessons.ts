import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth';
import { api, apiError } from '../api/client';

export function useLessons(week: string) {
  const { auth, refresh } = useAuth();
  return useQuery({
    queryKey: ['sessions', auth?.user.id, week],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/sessions', {
        params: { query: { week } },
      });
      if (response.status === 401) refresh(null);
      if (error || !data) throw apiError(error);
      return data;
    },
  });
}
