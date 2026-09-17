import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import {
  SchoolOutlined,
  DashboardOutlined,
  CalendarMonthOutlined,
  PeopleOutline,
  Logout,
  Menu,
} from '@mui/icons-material';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';

export function Layout() {
  const { auth, refresh } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const admin = auth?.user.role === 'ADMIN';
  const groups = [
    { label: 'Workspace', items: [{ path: '/', label: 'My tasks', icon: <DashboardOutlined /> }] },
    {
      label: 'Teaching',
      items: [
        {
          path: '/timetable',
          label: admin ? 'Class timetable' : 'My lessons',
          icon: <CalendarMonthOutlined />,
        },
      ],
    },
    {
      label: admin ? 'Resources' : 'Students',
      items: [
        { path: '/students', label: admin ? 'Students' : 'My students', icon: <PeopleOutline /> },
      ],
    },
  ];
  const active = groups
    .flatMap((g) => g.items)
    .find((item) =>
      item.path === '/'
        ? location.pathname === '/' || location.pathname.startsWith('/tasks/')
        : location.pathname.startsWith(item.path),
    );
  const logout = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST('/api/auth/logout', {
        headers: { 'x-csrf-token': auth?.csrfToken ?? '' },
      });
      if (response.status !== 401 && error) throw apiError(error);
    },
    onSuccess: () => refresh(null),
  });
  const navigation = (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4 }}>
        <Avatar variant="rounded" sx={{ bgcolor: 'primary.main' }}>
          <SchoolOutlined />
        </Avatar>
        <Typography variant="h6" fontWeight={700}>
          StudentSys
        </Typography>
      </Stack>
      <Box component="nav" aria-label="Main navigation">
        {groups.map((group) => (
          <Box key={group.label} sx={{ mb: 2 }}>
            <Typography variant="overline" color="text.secondary">
              {group.label}
            </Typography>
            {group.items.map((item) => (
              <Button
                key={item.path}
                component={Link}
                to={item.path}
                startIcon={item.icon}
                aria-current={
                  (
                    item.path === '/'
                      ? location.pathname === '/' || location.pathname.startsWith('/tasks/')
                      : location.pathname.startsWith(item.path)
                  )
                    ? 'page'
                    : undefined
                }
                onClick={() => setMobileOpen(false)}
                fullWidth
                sx={{
                  justifyContent: 'flex-start',
                  px: 2,
                  py: 1.3,
                  mb: 0.5,
                  bgcolor: (
                    item.path === '/'
                      ? location.pathname === '/' || location.pathname.startsWith('/tasks/')
                      : location.pathname.startsWith(item.path)
                  )
                    ? '#eaf1e9'
                    : 'transparent',
                  color: (
                    item.path === '/'
                      ? location.pathname === '/' || location.pathname.startsWith('/tasks/')
                      : location.pathname.startsWith(item.path)
                  )
                    ? 'primary.main'
                    : 'text.secondary',
                }}
              >
                {item.label}
              </Button>
            ))}
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 'auto', pt: 4 }}>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body2" fontWeight={600}>
          {auth?.user.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {admin ? 'Admin' : 'Teacher'}
        </Typography>
        <Box>
          <Button
            startIcon={<Logout />}
            size="small"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            sx={{ mt: 2 }}
          >
            Sign out
          </Button>
        </Box>
        {logout.isError && <Alert severity="error">{logout.error.message}</Alert>}
      </Box>
    </Box>
  );
  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <Box
        component="aside"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: 232,
          flexShrink: 0,
          bgcolor: '#fff',
          borderRight: '1px solid #e3e8e1',
          position: 'sticky',
          top: 0,
          height: '100dvh',
          overflowY: 'auto',
        }}
      >
        {navigation}
      </Box>
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: 260 } }}
      >
        {navigation}
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            px: { xs: 2, md: 4 },
            py: 2,
            bgcolor: '#fff',
            borderBottom: '1px solid #e3e8e1',
            display: { xs: 'flex', md: 'none' },
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { md: 'none' } }}
            >
              <Menu />
            </IconButton>
            <Typography variant="body2">{active?.label}</Typography>
          </Stack>
        </Box>
        <Box component="main" sx={{ p: { xs: 2, md: 4 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
