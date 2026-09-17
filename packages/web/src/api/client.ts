import createClient from 'openapi-fetch';
import type { paths } from '@student/common/api';

export const api = createClient<paths>({ baseUrl: '', credentials: 'include' });

export function apiError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): Error {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = error.message;
    if (typeof value === 'string') return new Error(value);
    if (Array.isArray(value)) return new Error(value.join('. '));
  }
  return new Error(fallback);
}
