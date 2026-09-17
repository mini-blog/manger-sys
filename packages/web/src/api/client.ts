import createClient from 'openapi-fetch';
import type { paths } from '@student/common/api';

export const api = createClient<paths>({ baseUrl: '', credentials: 'include' });

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function apiError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
  status?: number,
): Error {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = error.message;
    if (typeof value === 'string') return new ApiError(value, status);
    if (Array.isArray(value)) return new ApiError(value.join('. '), status);
  }
  return new ApiError(fallback, status);
}
