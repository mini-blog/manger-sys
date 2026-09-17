import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { api, apiError, ApiError } from '../api/client';
import { useAuth } from '../auth';
import { useWrite } from '../hooks/useWrite';
import { local } from '../lib/time';
import { Status } from './FormParts';
import type { Account } from '../pages/Accounts';
export function DeactivateAccountDialog({
  account,
  close,
}: {
  account: Account;
  close: () => void;
}) {
  const { auth, refresh } = useAuth();
  const [reason, setReason] = useState('');
  const [successor, setSuccessor] = useState('');
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: ['account-impact', auth?.user.id, account.id],
    staleTime: 0,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/accounts/{id}/deactivation-impact', {
        params: { path: { id: account.id } },
      });
      if (response.status === 401) refresh(null);
      if (!data) throw apiError(error);
      return data;
    },
  });
  const command = useWrite(
    'post',
    '/api/accounts/{id}/deactivate',
    { id: account.id },
    close,
    async (e) => {
      if (e instanceof ApiError && e.status === 409) {
        await query.refetch();
        setNotice('Impact refreshed. Review the handover before confirming again.');
      }
    },
  );
  const data = query.isError ? undefined : query.data;
  const busy = command.isPending || query.isFetching;
  const needsSuccessor = account.role === 'ADMIN' && Boolean(data?.ownedStudentCount);
  const disabled =
    busy ||
    !data?.canDeactivate ||
    !reason.trim() ||
    (needsSuccessor && !data?.eligibleSuccessors.some((a) => a.id === successor));
  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={() => !busy && close()}
      aria-labelledby="deactivate-title"
    >
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && data)
            command.mutate({
              expectedVersion: data.expectedVersion,
              reason: reason.trim(),
              ...(needsSuccessor ? { successorAdminId: successor } : {}),
            });
        }}
      >
        <DialogTitle id="deactivate-title">Deactivate {account.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Status query={query} />
            {command.error && <Alert severity="error">{command.error.message}</Alert>}
            {notice && (
              <Typography role="status" color="text.secondary">
                {notice}
              </Typography>
            )}
            {data && (
              <>
                <Typography>Sign-in will be disabled. Existing records are kept.</Typography>
                {data.blockedReason && <Alert severity="warning">{data.blockedReason}</Alert>}
                {account.role === 'ADMIN' && (
                  <Typography>
                    {data.ownedStudentCount} students · {data.openFollowupCount} open follow-ups
                  </Typography>
                )}
                {needsSuccessor && (
                  <TextField
                    required
                    select
                    label="Transfer to admin"
                    value={successor}
                    disabled={busy}
                    onChange={(e) => setSuccessor(e.target.value)}
                  >
                    <MenuItem value="">Select admin</MenuItem>
                    {data.eligibleSuccessors.map((a) => (
                      <MenuItem key={a.id} value={a.id}>
                        {a.name} · {a.email}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                {data.blockingSessions.map((l) => (
                  <Link
                    key={l.id}
                    component={RouterLink}
                    to={`/timetable?week=${local(l.startsAt).toISODate()}&lesson=${l.id}`}
                    onClick={close}
                  >
                    {l.className} · {l.courseName} · {local(l.startsAt).toFormat('d LLL, HH:mm')}
                  </Link>
                ))}
                <TextField
                  required
                  label="Reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy || !data.canDeactivate}
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={close}>
            Keep account
          </Button>
          <Button type="submit" variant="contained" color="error" disabled={disabled}>
            {busy ? 'Saving…' : 'Deactivate account'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
