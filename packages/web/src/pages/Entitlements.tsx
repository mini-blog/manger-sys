import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
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
import { Add } from '@mui/icons-material';
import type { components } from '@student/common/api';
import type { EntitlementBucket } from '@student/common';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import { Status } from '../components/FormParts';
import { CreditBalance } from '../components/CreditBalances';
import { GrantCreditsDialog } from '../components/GrantCreditsDialog';
import { membershipLabels } from '../lib/membership';
import { useMembershipRefresh } from '../hooks/useMembershipRefresh';
import { local } from '../lib/time';
import { bookingReturn } from '../lib/booking';

type Summary = components['schemas']['EntitlementSummaryDto'];
export function Entitlements() {
  const { auth } = useAuth();
  return auth?.user.role === 'ADMIN' ? (
    <EntitlementList />
  ) : (
    <Alert severity="error">You do not have access to lesson credits.</Alert>
  );
}
function EntitlementList() {
  const { auth, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').slice(0, 80),
    studentId = params.get('studentId') || undefined;
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1;
  const [search, setSearch] = useState(q);
  const [grant, setGrant] = useState<{ student?: { id: string; name: string } } | null>(null);
  const [ledger, setLedger] = useState<Summary | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSearch(q);
  }, [q]);
  const query = useQuery({
    queryKey: ['entitlements', auth?.user.id, studentId, q, page],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/entitlements', {
        params: { query: { q, studentId, page, pageSize: 20 } },
      });
      if (response.status === 401) refresh(null);
      if (!data) throw apiError(error);
      return data;
    },
  });
  useMembershipRefresh(query.data?.items[0]?.nextCategoryChangeAt);
  const selected = query.data?.items.find((s) => s.studentId === studentId);
  useEffect(() => {
    if (params.get('action') === 'grant' && selected) {
      setGrant({ student: { id: selected.studentId, name: selected.name } });
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete('action');
          return next;
        },
        { replace: true },
      );
    }
  }, [params, selected, setParams]);
  const returnTo = params.get('returnTo');
  const safeReturn =
    returnTo && /^\/(students|tasks)\/[A-Za-z0-9_-]+$/.test(returnTo)
      ? returnTo
      : bookingReturn(returnTo);
  const update = (changes: Record<string, string | undefined>) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes))
        if (value) next.set(key, value);
        else next.delete(key);
      return next;
    });
  return (
    <Stack spacing={3}>
      {safeReturn && (
        <Button component={Link} to={safeReturn} sx={{ alignSelf: 'flex-start' }}>
          ← Back to{' '}
          {safeReturn.startsWith('/timetable?')
            ? 'lesson'
            : safeReturn.startsWith('/students/')
              ? 'student'
              : 'follow-up'}
        </Button>
      )}
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
        <Typography variant="h4" component="h1">
          Lesson credits
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          disabled={Boolean(studentId && !selected)}
          onClick={() => {
            setSaved(false);
            setGrant(selected ? { student: { id: selected.studentId, name: selected.name } } : {});
          }}
        >
          Add credits
        </Button>
      </Stack>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        gap={1}
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: search.trim(), page: '1' });
        }}
      >
        <TextField
          size="small"
          label="Search students"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
        <Button type="submit" variant="outlined">
          Search
        </Button>
        {studentId && (
          <Button onClick={() => update({ studentId: undefined, page: '1', q: undefined })}>
            All my students
          </Button>
        )}
      </Stack>
      {saved && (
        <Typography role="status" color="success.main">
          Lesson credits added.
        </Typography>
      )}
      <Status query={query} />
      {query.data && (
        <Paper variant="outlined">
          <TableContainer>
            <Table aria-label="Student lesson credits">
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Membership</TableCell>
                  <TableCell>Trial card</TableCell>
                  <TableCell>Regular card</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((s) => (
                  <TableRow key={s.studentId}>
                    <TableCell>
                      <Button component={Link} to={`/students/${s.studentId}`}>
                        {s.name}
                      </Button>
                      <Typography variant="caption" component="div" color="text.secondary">
                        {s.yearLevel}
                      </Typography>
                    </TableCell>
                    <TableCell>{membershipLabels[s.membershipCategory]}</TableCell>
                    <TableCell>
                      <CreditBalance balance={s.balances.TRIAL} />
                    </TableCell>
                    <TableCell>
                      <CreditBalance balance={s.balances.REGULAR} />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button onClick={() => setLedger(s)}>View history</Button>
                        <Button
                          onClick={() => {
                            setSaved(false);
                            setGrant({ student: { id: s.studentId, name: s.name } });
                          }}
                        >
                          Add credits
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {!query.data.items.length && (
                  <TableRow>
                    <TableCell colSpan={5}>No students found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={query.data.total}
            rowsPerPage={20}
            rowsPerPageOptions={[20]}
            page={page - 1}
            onPageChange={(_, p) => update({ page: String(p + 1) })}
          />
        </Paper>
      )}
      {grant && (
        <GrantCreditsDialog
          student={grant.student}
          initialBucket={params.get('bucket') === 'REGULAR' ? 'REGULAR' : 'TRIAL'}
          initialMode={params.get('mode') === 'PACKAGE' ? 'PACKAGE' : 'CUSTOM'}
          onClose={() => setGrant(null)}
          onSaved={() => {
            setGrant(null);
            setSaved(true);
          }}
        />
      )}
      {ledger && <LedgerDialog student={ledger} onClose={() => setLedger(null)} />}
    </Stack>
  );
}
function LedgerDialog({ student, onClose }: { student: Summary; onClose: () => void }) {
  const [bucket, setBucket] = useState<EntitlementBucket | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['entitlement-entries', student.studentId, bucket, page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students/{id}/entitlement-entries', {
        params: {
          path: { id: student.studentId },
          query: { bucket: bucket === 'ALL' ? undefined : bucket, page, pageSize: 10 },
        },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const names = {
    INITIAL_TRIAL: 'Initial trial gift',
    TRIAL_GRANT: 'Trial credits added',
    PURCHASE: 'Custom purchase',
    CONSUMPTION: 'Lesson attended',
    MIGRATION: 'Opening balance',
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Credit history · {student.name}</DialogTitle>
      <DialogContent>
        <TextField
          select
          size="small"
          label="Credit type"
          value={bucket}
          onChange={(e) => {
            setBucket(e.target.value as EntitlementBucket | 'ALL');
            setPage(1);
          }}
          sx={{ my: 1, minWidth: 160 }}
        >
          <MenuItem value="ALL">All credits</MenuItem>
          <MenuItem value="TRIAL">Trial card</MenuItem>
          <MenuItem value="REGULAR">Regular card</MenuItem>
        </TextField>
        <Status query={query} />
        {query.data && (
          <>
            <TableContainer>
              <Table aria-label="Credit history">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Entry</TableCell>
                    <TableCell align="right">Lessons</TableCell>
                    <TableCell>Recorded by</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {query.data.items.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {local(e.createdAt).toFormat('d LLL yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <Typography>
                          {e.packageSnapshot ? 'Package purchase' : names[e.kind]} ·{' '}
                          {e.bucket === 'TRIAL' ? 'Trial' : 'Regular'}
                        </Typography>
                        {e.packageSnapshot && (
                          <Typography variant="body2" color="text.secondary">
                            {e.packageSnapshot.name} · {e.packageSnapshot.quantity} lessons ·{' '}
                            {new Intl.NumberFormat('en-AU', {
                              style: 'currency',
                              currency: 'AUD',
                            }).format(e.packageSnapshot.priceAudCents / 100)}{' '}
                            reference price
                          </Typography>
                        )}
                        {e.note && (
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {e.note}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {e.quantity > 0 ? '+' : ''}
                        {e.quantity}
                      </TableCell>
                      <TableCell>{e.actor?.name ?? 'Migration'}</TableCell>
                    </TableRow>
                  ))}
                  {!query.data.items.length && (
                    <TableRow>
                      <TableCell colSpan={4}>No credit entries.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={query.data.total}
              rowsPerPage={10}
              rowsPerPageOptions={[10]}
              page={page - 1}
              onPageChange={(_, p) => setPage(p + 1)}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
