import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { api, apiError, ApiError } from '../api/client';
import { useWrite } from '../hooks/useWrite';
import { useAuth } from '../auth';
import type { Account } from '../pages/Accounts';
export function AccountForm({
  account,
  mode = 'edit',
  close,
}: {
  account?: Account;
  mode?: 'edit' | 'password';
  close: () => void;
}) {
  const { refresh } = useAuth();
  const [name, setName] = useState(account?.name ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [role, setRole] = useState<'ADMIN' | 'TEACHER'>('TEACHER');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [current, setCurrent] = useState(account);
  const [notice, setNotice] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const reload = async () => {
    if (!account) return;
    setRefreshing(true);
    setRefreshError('');
    try {
      const { data, error, response } = await api.GET('/api/accounts/{id}', {
        params: { path: { id: account.id } },
      });
      if (response.status === 401) refresh(null);
      if (!data) throw apiError(error);
      setName((draft) => (draft === current?.name ? data.name : draft));
      setEmail((draft) => (draft === current?.email ? data.email : draft));
      setCurrent(data);
      setNotice('Account refreshed. Review your changes before saving again.');
    } catch (e) {
      setRefreshError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };
  const onError = async (e: Error) => {
    if (e instanceof ApiError && e.status === 409) await reload();
  };
  const create = useWrite('post', '/api/accounts', {}, close);
  const edit = useWrite('patch', '/api/accounts/{id}', { id: account?.id ?? '' }, close, onError);
  const reset = useWrite(
    'post',
    '/api/accounts/{id}/reset-password',
    { id: account?.id ?? '' },
    close,
    onError,
  );
  const needsPassword = !account || mode === 'password';
  const command = !account ? create : mode === 'password' ? reset : edit;
  const busy = command.isPending || refreshing;
  const readonly = Boolean(current && (current.isSuperAdmin || current.status !== 'ACTIVE'));
  const disabled =
    busy ||
    readonly ||
    Boolean(refreshError) ||
    (needsPassword && (password.length < 10 || password !== confirmation)) ||
    (mode !== 'password' && (!name.trim() || !email.trim()));
  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={() => !busy && close()}
      aria-labelledby="account-form-title"
    >
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled) return;
          setNotice('');
          if (!account) create.mutate({ name: name.trim(), email: email.trim(), role, password });
          else if (mode === 'password')
            reset.mutate({ password, expectedVersion: current!.version });
          else
            edit.mutate({
              name: name.trim(),
              email: email.trim(),
              expectedVersion: current!.version,
            });
        }}
      >
        <DialogTitle id="account-form-title">
          {!account ? 'Add account' : mode === 'password' ? 'Reset password' : 'Edit account'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {command.error && <Alert severity="error">{command.error.message}</Alert>}
            {refreshError && (
              <Alert
                severity="error"
                action={
                  <Button onClick={() => void reload()} disabled={busy}>
                    Retry
                  </Button>
                }
              >
                {refreshError}
              </Alert>
            )}
            {notice && (
              <Typography role="status" color="text.secondary">
                {notice}
              </Typography>
            )}
            {readonly && <Typography>This account is read-only.</Typography>}
            {mode !== 'password' && (
              <>
                <TextField
                  required
                  label="Name"
                  value={name}
                  disabled={busy || readonly}
                  onChange={(e) => setName(e.target.value)}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                />
                <TextField
                  required
                  type="email"
                  label="Email"
                  value={email}
                  disabled={busy || readonly}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {!account ? (
                  <TextField
                    select
                    label="Role"
                    value={role}
                    disabled={busy}
                    onChange={(e) => setRole(e.target.value as typeof role)}
                  >
                    <MenuItem value="ADMIN">Admin</MenuItem>
                    <MenuItem value="TEACHER">Teacher</MenuItem>
                  </TextField>
                ) : (
                  <Typography color="text.secondary">
                    {account.role === 'ADMIN' ? 'Admin' : 'Teacher'}
                  </Typography>
                )}
              </>
            )}
            {mode === 'password' && (
              <Typography color="text.secondary">Existing sessions will be signed out.</Typography>
            )}
            {needsPassword && (
              <>
                <TextField
                  required
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  disabled={busy || readonly}
                  onChange={(e) => setPassword(e.target.value)}
                  helperText="10–128 characters"
                  slotProps={{ htmlInput: { minLength: 10, maxLength: 128 } }}
                />
                <TextField
                  required
                  label="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  disabled={busy || readonly}
                  onChange={(e) => setConfirmation(e.target.value)}
                  error={Boolean(confirmation && confirmation !== password)}
                  helperText={
                    confirmation && confirmation !== password
                      ? 'Passwords do not match.'
                      : undefined
                  }
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={disabled}>
            {busy ? 'Saving…' : 'Save account'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
