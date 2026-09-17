import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@student/common/api';
import { apiError } from '../api/client';
import { useAuth } from '../auth';
type Method = 'post' | 'patch';
type WritePath<M extends Method> = {
  [P in keyof paths]: paths[P][M] extends { requestBody: unknown } ? P : never;
}[keyof paths];
type Body<P extends keyof paths, M extends Method> = paths[P][M] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;
export function useWrite<M extends Method, P extends WritePath<M>>(
  method: M,
  path: P,
  ids: Record<string, string> = {},
  onSuccess?: (result: { id: string }) => void,
  onError?: () => void,
) {
  const { auth, refresh } = useAuth();
  const client = useQueryClient();
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (body: Body<P, M>) => {
      const url = Object.entries(ids).reduce(
        (url, [key, value]) => url.replace(`{${key}}`, encodeURIComponent(value)),
        String(path),
      );
      const payload = JSON.stringify({ url, body });
      if (attempt.current?.payload !== payload)
        attempt.current = { payload, key: crypto.randomUUID() };
      const response = await fetch(url, {
        method: method.toUpperCase(),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': auth?.csrfToken ?? '',
          'Idempotency-Key': attempt.current.key,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (response.status === 401) refresh(null);
      if (!response.ok) throw apiError(data);
      return data as { id: string };
    },
    onError,
    onSuccess: (data) => {
      attempt.current = null;
      void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      onSuccess?.(data);
    },
  });
}
