import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Drawer,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import type { components } from '@student/common/api';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { Status } from '../components/FormParts';
import { AccountForm } from '../components/AccountForm';
import { DeactivateAccountDialog } from '../components/DeactivateAccountDialog';
export type Account = components['schemas']['AccountDto'];
export function Accounts() {
  const { auth } = useAuth();
  return auth?.user.role === 'ADMIN' && auth.user.isSuperAdmin ? (
    <AccountList />
  ) : (
    <Alert severity="error">Super administrator access required.</Alert>
  );
}
function AccountList() {
  const { auth, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const role = ['ADMIN', 'TEACHER'].includes(params.get('role') ?? '')
    ? (params.get('role') as 'ADMIN' | 'TEACHER')
    : undefined;
  const status = ['ACTIVE', 'DISABLED'].includes(params.get('status') ?? '')
    ? (params.get('status') as 'ACTIVE' | 'DISABLED')
    : undefined;
  const query = useQuery({
    queryKey: ['accounts', auth?.user.id, params.toString()],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/accounts', {
        params: { query: { q: params.get('q') || undefined, role, status, page, pageSize: 20 } },
      });
      if (response.status === 401) refresh(null);
      if (!data) throw apiError(error);
      return data;
    },
  });
  useEffect(() => {
    if (!query.data || query.isError) return;
    const lastPage = Math.max(1, Math.ceil(query.data.total / 20));
    if (page > lastPage) {
      const next = new URLSearchParams(params);
      next.set('page', String(lastPage));
      setParams(next, { replace: true });
    }
  }, [query.data, query.isError, page, params, setParams]);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key !== 'page' && key !== 'account') next.delete('page');
    setParams(next);
  };
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <PageHeader title="Accounts" />
        <Button variant="contained" onClick={() => setCreating(true)}>
          Add account
        </Button>
      </Stack>
      <Stack
        direction="row"
        gap={2}
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          change('q', search.trim());
        }}
      >
        <TextField
          label="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" variant="outlined">
          Search
        </Button>
        <TextField
          select
          label="Role"
          value={role ?? 'ALL'}
          onChange={(e) => change('role', e.target.value === 'ALL' ? '' : e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="ALL">All roles</MenuItem>
          <MenuItem value="ADMIN">Admin</MenuItem>
          <MenuItem value="TEACHER">Teacher</MenuItem>
        </TextField>
        <TextField
          select
          label="Status"
          value={status ?? 'ALL'}
          onChange={(e) => change('status', e.target.value === 'ALL' ? '' : e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="ALL">All statuses</MenuItem>
          <MenuItem value="ACTIVE">Active</MenuItem>
          <MenuItem value="DISABLED">Inactive</MenuItem>
        </TextField>
      </Stack>
      <Status query={query} />
      {!query.isError && query.data && (
        <Box
          sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1 }}
        >
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Name', 'Email', 'Role', 'Status'].map((x) => (
                    <TableCell key={x}>{x}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Button onClick={() => change('account', a.id)}>{a.name}</Button>
                      {a.isSuperAdmin && <Chip size="small" label="Super admin" />}
                    </TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>{a.role === 'ADMIN' ? 'Admin' : 'Teacher'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={a.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                        color={a.status === 'ACTIVE' ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!query.data.items.length && (
                  <TableRow>
                    <TableCell colSpan={4}>No accounts found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={query.data.total}
            page={page - 1}
            rowsPerPage={20}
            rowsPerPageOptions={[20]}
            onPageChange={(_, p) => change('page', String(p + 1))}
          />
        </Box>
      )}
      {creating && <AccountForm close={() => setCreating(false)} />}
      {params.get('account') && (
        <AccountDetail id={params.get('account')!} close={() => change('account', '')} />
      )}
    </Stack>
  );
}
function AccountDetail({ id, close }: { id: string; close: () => void }) {
  const { auth, refresh } = useAuth();
  const [mode, setMode] = useState<'edit' | 'password' | 'deactivate' | null>(null);
  const query = useQuery({
    queryKey: ['account', auth?.user.id, id],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/accounts/{id}', {
        params: { path: { id } },
      });
      if (response.status === 401) refresh(null);
      if (!data) throw apiError(error);
      return data;
    },
  });
  const a = query.isError ? undefined : query.data;
  return (
    <Drawer
      anchor="right"
      open
      onClose={close}
      slotProps={{ paper: { sx: { width: 440, maxWidth: '100vw', p: 3 } } }}
    >
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="h6">Account details</Typography>
          <Button onClick={close}>Close</Button>
        </Stack>
        <Status query={query} />
        {a && (
          <>
            <Typography fontWeight={600}>{a.name}</Typography>
            <Typography>{a.email}</Typography>
            <Typography>
              {a.role === 'ADMIN' ? 'Admin' : 'Teacher'} ·{' '}
              {a.status === 'ACTIVE' ? 'Active' : 'Inactive'}
            </Typography>
            {a.isSuperAdmin ? (
              <Typography color="text.secondary">Protected super administrator</Typography>
            ) : (
              a.status === 'ACTIVE' && (
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  <Button variant="outlined" onClick={() => setMode('edit')}>
                    Edit account
                  </Button>
                  <Button onClick={() => setMode('password')}>Reset password</Button>
                  {a.id !== auth?.user.id && (
                    <Button color="error" onClick={() => setMode('deactivate')}>
                      Deactivate account
                    </Button>
                  )}
                </Stack>
              )
            )}
            {mode && mode !== 'deactivate' && (
              <AccountForm account={a} mode={mode} close={() => setMode(null)} />
            )}
            {mode === 'deactivate' && (
              <DeactivateAccountDialog account={a} close={() => setMode(null)} />
            )}
          </>
        )}
      </Stack>
    </Drawer>
  );
}
