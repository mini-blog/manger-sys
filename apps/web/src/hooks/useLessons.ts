import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth';
import { api, apiError } from '../api/client';

export function useLessons(week: string, q = '') {
  const { auth, refresh } = useAuth();
  return useQuery({
    queryKey: ['sessions', auth?.user.id, week, q],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/sessions', {
        params: { query: { week, q } },
      });
      if (response.status === 401) refresh(null);
      if (error || !data) throw apiError(error);
      return data;
    },
  });
}
