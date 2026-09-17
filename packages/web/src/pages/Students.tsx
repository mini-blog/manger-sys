import { YEAR_LEVELS } from '@student/common';
import { Link, useNavigate } from 'react-router-dom';
import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Snackbar,
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
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import type { components } from '@student/common/api';

export function Students() {
  const { auth, refresh } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const attempt = useRef({ body: '', key: crypto.randomUUID() });
  const admin = auth?.user.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [yearLevel, setYearLevel] = useState('Not assessed');
  const [giftTrialCredit, setGiftTrialCredit] = useState(true);
  const [saved, setSaved] = useState(false);
  const students = useQuery({
    queryKey: ['students', auth?.user.id, q, page],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/students', {
        params: { query: { q, page: page + 1, pageSize: 20 } },
      });
      if (response.status === 401) refresh(null);
      if (error || !data) throw apiError(error);
      return data;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const payload = JSON.stringify({ name: name.trim(), yearLevel, giftTrialCredit });
      if (attempt.current.body !== payload)
        attempt.current = { body: payload, key: crypto.randomUUID() };
      const { data, error, response } = await api.POST('/api/students', {
        body: {
          name: name.trim(),
          giftTrialCredit,
          yearLevel: yearLevel as components['schemas']['CreateStudentDto']['yearLevel'],
        },
        params: { header: { 'idempotency-key': attempt.current.key } },
        headers: { 'x-csrf-token': auth?.csrfToken ?? '' },
      });
      if (response.status === 401) refresh(null);
      if (error || !data) throw apiError(error);
      return data;
    },
    onSuccess: (student) => {
      navigate(`/students/${student.id}`);
      setOpen(false);
      setName('');
      setYearLevel('Not assessed');
      setGiftTrialCredit(true);
      setSaved(true);
      setPage(0);
      setQ('');
      setSearch('');
      void client.invalidateQueries({ queryKey: ['students'] });
    },
  });
  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h4" component="h1">
          {admin ? 'Students' : 'My students'}
        </Typography>
        {admin && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => {
              create.reset();
              setSaved(false);
              setOpen(true);
            }}
          >
            Add student
          </Button>
        )}
      </Stack>
      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message="Student added."
      />
      <Box
        component="form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setPage(0);
          setQ(search.trim());
        }}
        sx={{ display: 'flex', gap: 1 }}
      >
        <TextField
          label="Search students"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
        <Button type="submit" variant="outlined">
          Search
        </Button>
      </Box>
      {students.isPending ? (
        <CircularProgress aria-label="Loading students" />
      ) : students.isError ? (
        <Alert
          severity="error"
          action={<Button onClick={() => void students.refetch()}>Retry</Button>}
        >
          {students.error.message}
        </Alert>
      ) : (
        <Paper variant="outlined">
          <TableContainer>
            <Table aria-label="Students">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Year level</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {students.data.items.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <Button component={Link} to={`/students/${student.id}`}>
                        {student.name}
                      </Button>
                    </TableCell>
                    <TableCell>{student.yearLevel}</TableCell>
                  </TableRow>
                ))}
                {students.data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2}>No students found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={students.data.total}
            rowsPerPage={20}
            rowsPerPageOptions={[20]}
            page={page}
            onPageChange={(_, value) => setPage(value)}
          />
        </Paper>
      )}
      <Dialog
        open={open}
        onClose={() => {
          if (!create.isPending) setOpen(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <Box
          component="form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (name.trim() && !create.isPending) create.mutate();
          }}
        >
          <DialogTitle>Add student</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {create.isError && <Alert severity="error">{create.error.message}</Alert>}
              <TextField
                autoFocus
                label="Student name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
              <TextField
                select
                label="Year level"
                value={yearLevel}
                onChange={(e) => setYearLevel(e.target.value)}
              >
                {YEAR_LEVELS.map((year) => (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={giftTrialCredit}
                    onChange={(_, checked) => setGiftTrialCredit(checked)}
                  />
                }
                label="Include 1 trial lesson"
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={create.isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={create.isPending || !name.trim()}>
              {create.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
