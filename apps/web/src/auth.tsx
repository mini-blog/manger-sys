import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';
import { api, apiError } from './api/client';
import type { components } from './api/schema';

type Auth = components['schemas']['AuthDto'];
const AuthContext = createContext<{ auth: Auth | null; refresh: (value: Auth | null) => void }>({
  auth: null,
  refresh: () => {},
});
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['auth'],
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/auth/me');
      if (response.status === 401) return null;
      if (error || !data) throw apiError(error, 'Cannot connect to the server.');
      return data;
    },
  });
  if (query.isPending)
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress aria-label="Checking session" />
      </Box>
    );
  if (query.isError)
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', p: 4 }}>
        <Alert severity="error">{query.error.message}</Alert>
        <Button onClick={() => void query.refetch()}>Retry connection</Button>
      </Box>
    );
  return (
    <AuthContext.Provider
      value={{
        auth: query.data ?? null,
        refresh: (value) => {
          // Keep the active auth observer; clearing it would leave the UI on stale auth data.
          void client.cancelQueries();
          client.setQueryData(['auth'], value);
          client.removeQueries({ predicate: (entry) => entry.queryKey[0] !== 'auth' });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function Protected({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const location = useLocation();
  return auth ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
