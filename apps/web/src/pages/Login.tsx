import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { Navigate } from 'react-router-dom';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';

export function Login() {
  const { auth, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/auth/login', { body: { email, password } });
      if (error || !data) throw apiError(error);
      return data;
    },
    onSuccess: refresh,
  });
  if (auth) return <Navigate to="/" replace />;
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Paper
        component="form"
        variant="outlined"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!login.isPending) login.mutate();
        }}
        sx={{ width: '100%', maxWidth: 400, p: 4 }}
      >
        <Typography component="h1" variant="h5" sx={{ mb: 3 }}>
          StudentSys
        </Typography>
        <Stack spacing={2.5}>
          {login.isError && <Alert severity="error">{login.error.message}</Alert>}
          <TextField
            label="Account"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="contained" size="large" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
