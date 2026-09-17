import { YEAR_LEVELS, MEMBERSHIP_CATEGORIES, type MembershipCategory } from '@student/common';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  Tab,
  Tabs,
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
import { StudentDemographicsFields } from '../components/StudentDemographicsFields';
import { label } from '../components/FormParts';
import { GuardianFields, guardianFormFrom, guardianPayload } from '../components/GuardianFields';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import { useMembershipRefresh } from '../hooks/useMembershipRefresh';
import { membershipTabs } from '../lib/membership';
import { createRequestKey } from '../lib/request-key';
import type { components } from '@student/common/api';

export function Students() {
  const { auth, refresh } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const admin = auth?.user.role === 'ADMIN';
  const [params, setParams] = useSearchParams();
  const category = MEMBERSHIP_CATEGORIES.includes(params.get('category') as MembershipCategory)
    ? (params.get('category') as MembershipCategory)
    : 'TRIAL_STUDENT';
  const q = (params.get('q') ?? '').slice(0, 80);
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 100000 ? rawPage - 1 : 0;
  const [search, setSearch] = useState(q);
  const updateList = (next: { category?: MembershipCategory; q?: string; page?: number }) =>
    setParams({
      category: next.category ?? category,
      q: next.q ?? q,
      page: String(next.page ?? 1),
    });
  useEffect(() => {
    setSearch(q);
  }, [q]);
  useEffect(() => {
    if (
      params.get('category') !== category ||
      params.get('page') !== String(page + 1) ||
      params.get('q') !== q
    )
      setParams({ category, q, page: String(page + 1) }, { replace: true });
  }, [category, page, q, params, setParams]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [guardian, setGuardian] = useState(guardianFormFrom);
  const [yearLevel, setYearLevel] = useState('Not assessed');
  const [giftTrialCredit, setGiftTrialCredit] = useState(true);
  const [saved, setSaved] = useState(false);
  const students = useQuery({
    queryKey: ['students', auth?.user.id, category, q, page],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/students', {
        params: { query: { category, q, page: page + 1, pageSize: 20 } },
      });
      if (response.status === 401) refresh(null);
      if (error || !data) throw apiError(error);
      return data;
    },
  });
  useMembershipRefresh(students.data?.nextCategoryChangeAt);
  useEffect(() => {
    if (students.data && page > 0 && page * 20 >= students.data.total)
      setParams(
        { category, q, page: String(Math.max(1, Math.ceil(students.data.total / 20))) },
        { replace: true },
      );
  }, [students.data, page, category, q, setParams]);
  const create = useMutation({
    mutationFn: async () => {
      const payload = JSON.stringify({
        name: name.trim(),
        yearLevel,
        giftTrialCredit,
        ...guardianPayload(guardian),
        age: age === '' ? undefined : Number(age),
        gender,
      });
      if (attempt.current?.body !== payload)
        attempt.current = { body: payload, key: createRequestKey() };
      const { data, error, response } = await api.POST('/api/students', {
        body: {
          ...guardianPayload(guardian),
          age: age === '' ? undefined : Number(age),
          gender: gender as components['schemas']['CreateStudentDto']['gender'],
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
      setAge('');
      setGender('');
      setGuardian(guardianFormFrom());
      setYearLevel('Not assessed');
      setGiftTrialCredit(true);
      setSaved(true);
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
      <Tabs
        value={category}
        onChange={(_, value: MembershipCategory) => updateList({ category: value })}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="Student membership categories"
      >
        {MEMBERSHIP_CATEGORIES.map((value) => (
          <Tab
            key={value}
            value={value}
            label={`${membershipTabs[value]}${students.data ? ` (${students.data.categoryCounts[value]})` : ''}`}
          />
        ))}
      </Tabs>
      <Box
        component="form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          updateList({ q: search.trim() });
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
                  <TableCell>Gender</TableCell>
                  <TableCell>Age</TableCell>
                  {admin && <TableCell>Responsible admin</TableCell>}
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
                    <TableCell>{student.gender ? label(student.gender) : '—'}</TableCell>
                    <TableCell>{student.age ?? '—'}</TableCell>
                    {admin && <TableCell>{student.responsibleAdmin?.name ?? '—'}</TableCell>}
                  </TableRow>
                ))}
                {students.data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={admin ? 5 : 4}>No students found.</TableCell>
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
            onPageChange={(_, value) => updateList({ page: value + 1 })}
          />
        </Paper>
      )}
      <Dialog
        open={open}
        onClose={() => {
          if (!create.isPending) setOpen(false);
        }}
        fullWidth
        maxWidth="md"
      >
        <Box
          component="form"
          sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (name.trim() && !create.isPending) create.mutate();
          }}
        >
          <DialogTitle>Add student</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Recorded by: {auth?.user.name} · Responsible admin: {auth?.user.name}
              </Typography>
              {create.isError && <Alert severity="error">{create.error.message}</Alert>}
              <Box
                sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}
              >
                <TextField
                  autoFocus
                  disabled={create.isPending}
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
                  disabled={create.isPending}
                  onChange={(e) => setYearLevel(e.target.value)}
                >
                  {YEAR_LEVELS.map((year) => (
                    <MenuItem key={year} value={year}>
                      {year}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <StudentDemographicsFields
                age={age}
                gender={gender}
                onAge={setAge}
                onGender={setGender}
                disabled={create.isPending}
              />
              <GuardianFields value={guardian} onChange={setGuardian} disabled={create.isPending} />
              <FormControlLabel
                control={
                  <Checkbox
                    disabled={create.isPending}
                    checked={giftTrialCredit}
                    onChange={(_, checked) => setGiftTrialCredit(checked)}
                  />
                }
                label="Give a trial card (1 lesson)"
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
