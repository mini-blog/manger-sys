import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import {
  SchoolOutlined,
  AccountBalanceWalletOutlined,
  DashboardOutlined,
  CalendarMonthOutlined,
  PeopleOutline,
  Logout,
  NotificationsOutlined,
} from '@mui/icons-material';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import { local } from '../lib/time';

function TaskNotifications() {
  const { auth, refresh } = useAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const query = useQuery({
    queryKey: ['tasks', auth?.user.id, 'header'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/tasks', {
        params: { query: { status: 'OPEN', page: 1, pageSize: 5 } },
      });
      if (response.status === 401) refresh(null);
      if (!data) throw apiError(error);
      return data;
    },
  });
  return (
    <>
      <Button
        color="inherit"
        aria-label={
          query.isError
            ? 'My tasks, unavailable'
            : query.data
              ? `My tasks, ${query.data.total} open`
              : 'My tasks, loading'
        }
        aria-haspopup="menu"
        aria-controls={anchor ? 'header-tasks' : undefined}
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)}
        startIcon={
          <Badge
            badgeContent={query.isError ? undefined : query.data?.total}
            color="primary"
            max={99}
          >
            <NotificationsOutlined fontSize="small" />
          </Badge>
        }
        sx={{ gap: 1, mr: 1 }}
      >
        My tasks
      </Button>
      <Menu
        id="header-tasks"
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 24px)' } } }}
      >
        {query.isPending && <MenuItem disabled>Loading tasks…</MenuItem>}
        {query.isError && (
          <MenuItem onClick={() => void query.refetch()}>Could not load tasks · Retry</MenuItem>
        )}
        {!query.isError && query.data?.total === 0 && <MenuItem disabled>No open tasks</MenuItem>}
        {!query.isError &&
          query.data?.items.map((task) => (
            <MenuItem
              key={task.id}
              component={Link}
              to={`/tasks/${task.id}`}
              onClick={() => setAnchor(null)}
              sx={{ whiteSpace: 'normal', py: 1.5 }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600}>
                  {task.studentName ?? task.className}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {task.courseName} ·{' '}
                  {task.type === 'LESSON_FEEDBACK' ? 'Lesson feedback' : 'Follow-up'}
                </Typography>
                <Typography variant="caption" component="div" color="text.secondary">
                  Due {local(task.dueAt).toFormat('d LLL, HH:mm')} · Melbourne
                </Typography>
              </Box>
            </MenuItem>
          ))}
        <Divider />
        <MenuItem component={Link} to="/" onClick={() => setAnchor(null)}>
          View all tasks
        </MenuItem>
      </Menu>
    </>
  );
}

export function Layout() {
  const { auth, refresh } = useAuth();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [location.pathname]);
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
      label: 'Resources',
      items: [
        { path: '/students', label: admin ? 'Students' : 'My students', icon: <PeopleOutline /> },
        ...(admin
          ? [
              {
                path: '/entitlements',
                label: 'Lesson credits',
                icon: <AccountBalanceWalletOutlined />,
              },
            ]
          : []),
      ],
    },
  ];
  const isActive = (path: string) =>
    path === '/'
      ? location.pathname === '/' || location.pathname.startsWith('/tasks/')
      : location.pathname.startsWith(path);
  const active = groups.flatMap((g) => g.items).find((item) => isActive(item.path));
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
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '208px minmax(540px, 1fr)',
        minWidth: 748,
        height: '100dvh',
      }}
    >
      <Box
        component="aside"
        sx={{
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
          overflowY: 'auto',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ height: 52, px: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <SchoolOutlined color="primary" sx={{ fontSize: 25 }} />
          <Typography fontWeight={700} sx={{ fontSize: 16 }}>
            StudentSys
          </Typography>
        </Stack>
        <Box component="nav" aria-label="Main navigation" sx={{ p: 1.5 }}>
          {groups.map((group) => (
            <Box key={group.label} sx={{ mb: 2 }}>
              <Typography variant="overline" color="text.secondary" sx={{ px: 1.5 }}>
                {group.label}
              </Typography>
              {group.items.map((item) => (
                <Button
                  key={item.path}
                  component={Link}
                  to={item.path}
                  startIcon={item.icon}
                  aria-current={isActive(item.path) ? 'page' : undefined}
                  fullWidth
                  sx={{
                    justifyContent: 'flex-start',
                    minHeight: 36,
                    px: 1.5,
                    mb: 0.5,
                    bgcolor: isActive(item.path) ? '#eaf1e9' : 'transparent',
                    color: isActive(item.path) ? 'primary.main' : 'text.secondary',
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
      <Box
        sx={{ display: 'grid', gridTemplateRows: '52px minmax(0, 1fr)', minWidth: 0, minHeight: 0 }}
      >
        <Box
          component="header"
          sx={{
            px: 3,
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {active?.label}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={2}>
            <TaskNotifications />
            <Divider orientation="vertical" flexItem />
            <Avatar sx={{ width: 28, height: 28, fontSize: 13, bgcolor: 'primary.main' }}>
              {auth?.user.name.slice(0, 1)}
            </Avatar>
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ maxWidth: 160 }} noWrap>
                {auth?.user.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {admin ? 'Admin' : 'Teacher'}
              </Typography>
            </Box>
            <Button
              color="inherit"
              startIcon={<Logout fontSize="small" />}
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              Sign out
            </Button>
          </Stack>
        </Box>
        <Box component="main" ref={main} sx={{ p: 3, overflow: 'auto', minHeight: 0 }}>
          {logout.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {logout.error.message}
            </Alert>
          )}
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
