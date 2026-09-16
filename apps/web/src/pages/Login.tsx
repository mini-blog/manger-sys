import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { SchoolOutlined } from '@mui/icons-material';
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
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
      }}
    >
      <Box
        sx={{
          bgcolor: '#143e35',
          color: '#f4f5e9',
          p: { xs: 4, md: 8 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <SchoolOutlined />
          <Typography fontWeight={700}>StudentSys</Typography>
        </Stack>
        <Box sx={{ my: 8, maxWidth: 500 }}>
          <Chip
            label="A little more clarity. Every lesson."
            sx={{ color: '#dcdfc5', border: '1px solid #618074', mb: 3 }}
          />
          <Typography variant="h3" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            More time for
            <br />
            their next step.
          </Typography>
          <Typography sx={{ mt: 3, color: '#b4c8bc', fontSize: 18 }}>
            One shared view of your classes, teachers and the students joining them.
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ color: '#b4c8bc' }}>
          Built around your teaching week · Melbourne
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', placeItems: 'center', p: 4 }}>
        <Box
          component="form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            login.mutate();
          }}
          sx={{ width: '100%', maxWidth: 370 }}
        >
          <Typography variant="overline" color="text.secondary">
            STAFF WORKSPACE
          </Typography>
          <Typography variant="h4" sx={{ mt: 1 }}>
            Welcome back
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>
            Sign in with your admin or teacher account.
          </Typography>
          <Stack spacing={2.5}>
            {login.isError && <Alert severity="error">{login.error.message}</Alert>}
            <TextField
              label="Work email"
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            Staff access only. Parents and students do not need an account.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
