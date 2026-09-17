import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Chip,
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
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import { local } from '../lib/time';
import { label, Status } from '../components/FormParts';
export function MyTasks() {
  const { auth } = useAuth();
  const admin = auth?.user.role === 'ADMIN';
  const [status, setStatus] = useState<'OPEN' | 'DONE' | 'CANCELLED'>('OPEN'),
    [page, setPage] = useState(0),
    [q, setQ] = useState(''),
    [overdue, setOverdue] = useState(false);
  const query = useQuery({
    queryKey: ['tasks', auth?.user.id, status, page, q, overdue],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/tasks', {
        params: { query: { status, page: page + 1, pageSize: 20, q, overdue: String(overdue) } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        My tasks
      </Typography>
      <Stack direction="row" gap={2} flexWrap="wrap">
        <TextField
          select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(0);
            setOverdue(false);
          }}
          sx={{ minWidth: 160 }}
        >
          {['OPEN', 'DONE', 'CANCELLED'].map((s) => (
            <MenuItem value={s} key={s}>
              {label(s)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={admin ? 'Student or class' : 'Class'}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
        {status === 'OPEN' && (
          <Button
            variant={overdue ? 'contained' : 'outlined'}
            onClick={() => {
              setOverdue(!overdue);
              setPage(0);
            }}
          >
            Overdue only
          </Button>
        )}
      </Stack>
      <Status query={query} />
      {query.data && (
        <Paper>
          <TableContainer>
            <Table aria-label="My tasks">
              <TableHead>
                <TableRow>
                  {[
                    admin ? 'Student' : 'Class',
                    'Subject / lesson',
                    'Task',
                    'Due · Melbourne',
                    '',
                  ].map((x) => (
                    <TableCell key={x}>{x}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Typography fontWeight={600}>
                        {admin ? t.studentName : t.className}
                      </Typography>
                      {admin && (
                        <Typography variant="body2" color="text.secondary">
                          {t.className}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.courseName}
                      <Typography variant="body2" color="text.secondary">
                        {local(t.startsAt).toFormat('d LLL, HH:mm')} · {t.teacherName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {admin ? label(t.reason ?? 'Follow up') : 'Lesson feedback'}
                    </TableCell>
                    <TableCell>
                      {local(t.dueAt).toFormat('d LLL, HH:mm')}
                      {t.status === 'OPEN' && new Date(t.dueAt) < new Date() && (
                        <Chip label="Overdue" size="small" color="warning" sx={{ ml: 1 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Button component={Link} to={`/tasks/${t.id}`}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {query.data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ py: 6, textAlign: 'center' }}>
                      No {label(status).toLowerCase()} tasks.
                    </TableCell>
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
            page={page}
            onPageChange={(_, p) => setPage(p)}
          />
        </Paper>
      )}
    </Stack>
  );
}
