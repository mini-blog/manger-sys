import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useMembershipRefresh(nextCategoryChangeAt?: string) {
  const client = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({
        predicate: (q) => ['students', 'student', 'entitlements'].includes(String(q.queryKey[0])),
      });
    };
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const at = nextCategoryChangeAt ? Date.parse(nextCategoryChangeAt) : NaN;
    const timer = Number.isFinite(at)
      ? window.setTimeout(refresh, Math.max(100, at - Date.now() + 100))
      : undefined;
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', refresh);
    };
  }, [client, nextCategoryChangeAt]);
}
