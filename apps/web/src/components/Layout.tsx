import { useMutation } from '@tanstack/react-query';
import { Alert, Avatar, Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import {
  SchoolOutlined,
  DashboardOutlined,
  CalendarMonthOutlined,
  Logout,
  WbSunnyOutlined,
} from '@mui/icons-material';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';

export function Layout() {
  const { auth, refresh } = useAuth();
  const location = useLocation();
  const logout = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST('/api/auth/logout', {
        headers: { 'x-csrf-token': auth?.csrfToken ?? '' },
      });
      if (response.status !== 401 && error) throw apiError(error);
    },
    onSuccess: () => refresh(null),
  });
  return (
    <Box sx={{ display: { xs: 'block', md: 'flex' }, minHeight: '100vh' }}>
      <Box
        component="aside"
        sx={{
          width: { md: 232 },
          flexShrink: 0,
          bgcolor: '#fff',
          borderRight: '1px solid #e3e8e1',
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          position: { md: 'sticky' },
          top: 0,
          height: { md: '100vh' },
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 5 }}>
          <Avatar variant="rounded" sx={{ bgcolor: 'primary.main' }}>
            <SchoolOutlined />
          </Avatar>
          <Typography variant="h6" fontWeight={700}>
            StudentSys
          </Typography>
        </Stack>
        <Typography variant="overline" color="text.secondary" sx={{ mb: 1 }}>
          WORKSPACE
        </Typography>
        {[
          ['/', 'Overview', <DashboardOutlined key="overview" />],
          ['/timetable', 'Timetable', <CalendarMonthOutlined key="calendar" />],
        ].map(([path, label, icon]) => (
          <Button
            key={String(path)}
            component={Link}
            to={String(path)}
            startIcon={icon}
            sx={{
              justifyContent: 'flex-start',
              px: 2,
              py: 1.3,
              mb: 0.5,
              bgcolor: location.pathname === path ? '#eaf1e9' : 'transparent',
              color: location.pathname === path ? 'primary.main' : 'text.secondary',
            }}
          >
            {label}
          </Button>
        ))}
        <Box sx={{ mt: 'auto', pt: 4 }}>
          <Divider sx={{ mb: 2 }} />
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Avatar
              sx={{
                width: 34,
                height: 34,
                bgcolor: '#e9eee5',
                color: 'primary.main',
                fontSize: 14,
              }}
            >
              {auth?.user.name
                .split(' ')
                .map((s) => s[0])
                .join('')}
            </Avatar>
            <Box>
              <Typography variant="body2" fontWeight={600}>
                {auth?.user.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {auth?.user.role === 'ADMIN' ? 'Admin · Student services' : 'Teacher'}
              </Typography>
            </Box>
          </Stack>
          <Button
            startIcon={<Logout />}
            size="small"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            sx={{ mt: 2 }}
          >
            Sign out
          </Button>
          {logout.isError && <Alert severity="error">{logout.error.message}</Alert>}
        </Box>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            px: { xs: 2, md: 4 },
            py: 2,
            bgcolor: '#fff',
            borderBottom: '1px solid #e3e8e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Teaching & learning / {location.pathname === '/' ? 'Overview' : 'Timetable'}
          </Typography>
          <Chip size="small" icon={<WbSunnyOutlined />} label="Melbourne time" variant="outlined" />
        </Box>
        <Box component="main" sx={{ p: { xs: 2, md: 4 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
