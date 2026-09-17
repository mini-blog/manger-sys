import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { DateTime } from 'luxon';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import { currentWeek, local, type Lesson } from '../lib/time';
import type { components } from '../api/schema';
import { useWrite } from '../hooks/useWrite';
import { label, Status } from './FormParts';
import { SessionEditor } from './SessionEditor';
import { FeedbackForm } from '../pages/TaskDetail';
type Participant = components['schemas']['ParticipantDto'];
export function Roster({ lesson, close }: { lesson: Lesson | null; close: () => void }) {
  return (
    <Drawer
      anchor="right"
      open={Boolean(lesson)}
      onClose={close}
      PaperProps={{ sx: { width: { xs: '100%', sm: 620 }, p: 3 } }}
    >
      {lesson && <RosterContent key={lesson.id} id={lesson.id} close={close} />}
    </Drawer>
  );
}
function RosterContent({ id, close }: { id: string; close: () => void }) {
  const { auth } = useAuth();
  const admin = auth?.user.role === 'ADMIN';
  const [edit, setEdit] = useState(false),
    [history, setHistory] = useState(false),
    [feedback, setFeedback] = useState(false);
  const query = useQuery({
    queryKey: ['roster', auth?.user.id, id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/sessions/{id}/participants', {
        params: { path: { id } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const r = query.data,
    l = r?.lesson;
  const future = l?.status === 'SCHEDULED' && new Date(l.startsAt) > new Date();
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="overline" color="text.secondary">
          Lesson details
        </Typography>
        <IconButton aria-label="Close lesson" onClick={close}>
          <Close />
        </IconButton>
      </Stack>
      <Status query={query} />
      {r && l && (
        <>
          <Typography variant="h5">{l.className}</Typography>
          <Typography>
            {l.courseName} · {l.teacherName}
          </Typography>
          <Typography color="text.secondary">
            {local(l.startsAt).toFormat('ccc d LLL yyyy, HH:mm')}–
            {local(l.endsAt).toFormat('HH:mm')} · Melbourne
          </Typography>
          <Typography variant="body2">
            {l.status === 'CANCELLED'
              ? 'Cancelled'
              : l.feedbackSubmittedAt
                ? 'Feedback submitted'
                : new Date(l.endsAt) <= new Date()
                  ? 'Awaiting feedback'
                  : 'Scheduled'}{' '}
            · {l.participantCount}/{l.capacity} students
          </Typography>
          <Stack direction="row" gap={1}>
            {admin && future && (
              <Button variant="outlined" onClick={() => setEdit(true)}>
                Edit lesson
              </Button>
            )}
            {admin && <Button onClick={() => setHistory(!history)}>Change history</Button>}
            {!admin && l.status === 'SCHEDULED' && new Date(l.endsAt) <= new Date() && (
              <Button variant="contained" onClick={() => setFeedback(!feedback)}>
                {l.feedbackSubmittedAt ? 'View feedback' : 'Record feedback'}
              </Button>
            )}
          </Stack>
          {history && <ChangeHistory id={id} />}
          <Divider />
          {feedback ? (
            <FeedbackForm key={l.version} roster={r} />
          ) : (
            <>
              {admin && future && <AddStudent lesson={l} />}
              <Typography fontWeight={600}>Students ({r.participants.length})</Typography>
              {r.participants.map((p) => (
                <ParticipantCard
                  key={`${p.participantId}:${p.version}`}
                  p={p}
                  lesson={l}
                  future={Boolean(future)}
                />
              ))}
              {!r.participants.length && (
                <Typography color="text.secondary">No students booked yet.</Typography>
              )}
              {admin && r.cancelled.length > 0 && (
                <>
                  <Divider />
                  <Typography color="text.secondary">Cancelled bookings</Typography>
                  {r.cancelled.map((p) => (
                    <ParticipantCard
                      key={`${p.participantId}:${p.version}`}
                      p={p}
                      lesson={l}
                      future={Boolean(future)}
                    />
                  ))}
                </>
              )}
              {l.summary && <Typography>Class summary: {l.summary}</Typography>}
            </>
          )}
          {edit && (
            <SessionEditor
              lesson={l}
              participantIds={r.participants.map((p) => p.participantId)}
              participantNames={r.participants.map((p) => p.name)}
              close={() => setEdit(false)}
            />
          )}
        </>
      )}
    </Stack>
  );
}
function AddStudent({ lesson: l }: { lesson: Lesson }) {
  const [params] = useSearchParams();
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState<components['schemas']['StudentDto'] | null>(null),
    [kind, setKind] = useState<'TRIAL' | 'REGULAR'>('TRIAL');
  const query = useQuery({
    queryKey: ['students', 'picker', search],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students', {
        params: { query: { q: search, mine: 'true', pageSize: 20 } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const hint = useQuery({
    queryKey: ['student', 'booking-hint', params.get('student')],
    enabled: Boolean(params.get('student')),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students/{id}', {
        params: { path: { id: params.get('student')! } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const [hintApplied, setHintApplied] = useState(false);
  useEffect(() => {
    if (!hintApplied && hint.data) {
      if (hint.data.canEdit) setSelected(hint.data);
      setHintApplied(true);
    }
  }, [hint.data, hintApplied]);
  const picked = selected;
  const eligibility = useQuery({
    queryKey: ['eligibility', picked?.id, l.courseId],
    enabled: Boolean(picked && kind === 'TRIAL'),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students/{id}/trial-eligibility', {
        params: { path: { id: picked!.id }, query: { courseId: l.courseId } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const save = useWrite('post', '/api/sessions/{id}/participants', { id: l.id }, () => {
    setSelected(null);
    setSearch('');
  });
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography fontWeight={600}>Add student</Typography>
        {save.isError && <Alert severity="error">{save.error.message}</Alert>}
        {query.isError && <Alert severity="error">{query.error.message}</Alert>}
        <Autocomplete
          options={query.data?.items ?? []}
          value={picked}
          getOptionLabel={(o) => `${o.name} · ${o.yearLevel}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          filterOptions={(o) => o}
          onChange={(_, v) => setSelected(v)}
          onInputChange={(_, v, reason) => {
            if (reason === 'input') setSearch(v);
          }}
          loading={query.isFetching}
          renderInput={(p) => <TextField {...p} label="Search my students" />}
        />
        <Stack direction="row" gap={2}>
          <TextField
            label="Booking type"
            select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            sx={{ flex: 1 }}
          >
            <MenuItem value="TRIAL">Trial</MenuItem>
            <MenuItem value="REGULAR">Regular</MenuItem>
          </TextField>
          <Button
            variant="contained"
            disabled={
              !picked ||
              save.isPending ||
              (kind === 'TRIAL' && (!eligibility.data?.available || eligibility.isFetching))
            }
            onClick={() => picked && save.mutate({ studentId: picked.id, kind })}
          >
            Add
          </Button>
        </Stack>
        {picked && (
          <Button component={Link} to={`/students/${picked.id}`} sx={{ alignSelf: 'flex-start' }}>
            Edit student details
          </Button>
        )}
        {kind === 'TRIAL' && picked && (
          <Typography
            variant="caption"
            color={eligibility.data?.available ? 'text.secondary' : 'warning.main'}
          >
            {eligibility.isError
              ? eligibility.error.message
              : eligibility.data?.available
                ? '1 trial available'
                : eligibility.data?.reason === 'TRIAL_EXHAUSTED'
                  ? 'Trial already attended.'
                  : eligibility.data?.reason === 'TRIAL_ALREADY_RESERVED'
                    ? 'A trial is already booked or awaiting attendance.'
                    : 'Checking trial eligibility…'}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
function ParticipantCard({
  p,
  lesson: l,
  future,
}: {
  p: Participant;
  lesson: Lesson;
  future: boolean;
}) {
  const [action, setAction] = useState<'cancel' | 'restore' | 'move' | ''>(''),
    [reason, setReason] = useState(''),
    [target, setTarget] = useState(''),
    [week, setWeek] = useState(currentWeek().toISODate()!);
  const cancel = useWrite('post', '/api/participants/{id}/cancel', { id: p.participantId });
  const restore = useWrite('post', '/api/participants/{id}/restore', { id: p.participantId });
  const move = useWrite('post', '/api/participants/{id}/move', { id: p.participantId });
  const targets = useQuery({
    queryKey: ['lessons', 'move', week, l.courseId],
    enabled: action === 'move',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/sessions', {
        params: { query: { week, courseId: l.courseId } },
      });
      if (!data) throw apiError(error);
      return data.filter(
        (s) => s.id !== l.id && s.status === 'SCHEDULED' && new Date(s.startsAt) > new Date(),
      );
    },
  });
  const command = action === 'move' ? move : action === 'restore' ? restore : cancel;
  return (
    <Paper
      sx={{
        p: 2,
        bgcolor: p.category === 'TRIAL' && p.bookingStatus === 'BOOKED' ? '#fffbf2' : 'white',
        borderColor: p.category === 'TRIAL' ? '#ebd6a8' : undefined,
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Button component={Link} to={`/students/${p.id}`} sx={{ p: 0, textAlign: 'left' }}>
            {p.name}
          </Button>
          <Chip
            label={label(p.category)}
            size="small"
            color={p.category === 'TRIAL' ? 'warning' : 'default'}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {p.yearLevel}
          {p.attendance !== 'PENDING' ? ` · ${label(p.attendance)}` : ''}
        </Typography>
        {p.feedback && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{p.feedback}</Typography>}
        {p.canManage && future && (
          <Stack direction="row" gap={1}>
            {(p.bookingStatus === 'BOOKED' ? ['move', 'cancel'] : ['restore']).map((a) => (
              <Button
                key={a}
                size="small"
                onClick={() => {
                  setAction(a as typeof action);
                  cancel.reset();
                  restore.reset();
                  move.reset();
                }}
              >
                {label(a)}
              </Button>
            ))}
          </Stack>
        )}
        {action && (
          <Stack
            component="form"
            spacing={2}
            onSubmit={(e) => {
              e.preventDefault();
              const body = { expectedVersion: p.version, reason };
              if (action === 'move') move.mutate({ ...body, targetSessionId: target });
              else command.mutate(body as never);
            }}
          >
            {command.isError && <Alert severity="error">{command.error.message}</Alert>}
            {action === 'move' && (
              <>
                <TextField
                  label="Target week"
                  type="date"
                  value={week}
                  onChange={(e) => {
                    const d = DateTime.fromISO(e.target.value);
                    if (d.isValid) {
                      setWeek(d.startOf('week').toISODate()!);
                      setTarget('');
                    }
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Status query={targets} />
                <TextField
                  label="Target lesson · same subject"
                  select
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {targets.data?.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {local(s.startsAt).toFormat('ccc d LLL HH:mm')} · {s.className} ·{' '}
                      {s.teacherName} ({s.participantCount}/{s.capacity})
                    </MenuItem>
                  ))}
                </TextField>
                {targets.data?.length === 0 && (
                  <Typography variant="body2">
                    No future lessons for this subject in this week.
                  </Typography>
                )}
              </>
            )}
            <TextField
              label="Reason"
              value={reason}
              required
              onChange={(e) => setReason(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            <Stack direction="row" gap={1}>
              <Button type="submit" variant="outlined" disabled={command.isPending}>
                {label(action)} booking
              </Button>
              <Button onClick={() => setAction('')}>Close</Button>
            </Stack>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
function ChangeHistory({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['changes', id, page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/sessions/{id}/changes', {
        params: { path: { id }, query: { page, pageSize: 10 } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const describe = (text: string) => {
    const v = JSON.parse(text) as Record<string, unknown>;
    return Object.entries(v)
      .filter(([k]) =>
        [
          'className',
          'courseName',
          'teacherName',
          'startsAt',
          'endsAt',
          'capacity',
          'studentName',
          'bookingStatus',
        ].includes(k),
      )
      .map(
        ([k, v]) =>
          `${({ className: 'Class', courseName: 'Subject', teacherName: 'Teacher', startsAt: 'Start', endsAt: 'End', capacity: 'Capacity', studentName: 'Student', bookingStatus: 'Booking' } as Record<string, string>)[k]}: ${k.endsWith('At') ? local(String(v)).toFormat('d LLL HH:mm') : String(v)}`,
      )
      .join(' · ');
  };
  return (
    <Stack spacing={2}>
      <Status query={query} />
      {query.data?.items.map((c) => (
        <Paper key={c.id} sx={{ p: 2 }}>
          <Typography fontWeight={600}>{label(c.action)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {local(c.createdAt).toFormat('d LLL HH:mm')} · {c.actorName}
          </Typography>
          <Typography>{c.reason}</Typography>
          {describe(c.before) && (
            <Typography variant="body2" color="text.secondary">
              Before: {describe(c.before)}
            </Typography>
          )}
          {describe(c.after) && <Typography variant="body2">After: {describe(c.after)}</Typography>}
        </Paper>
      ))}
      {query.data?.total === 0 && (
        <Typography color="text.secondary">No changes recorded.</Typography>
      )}
      {(query.data?.total ?? 0) > 10 && (
        <Pagination
          page={page}
          count={Math.ceil(query.data!.total / 10)}
          onChange={(_, p) => setPage(p)}
        />
      )}
    </Stack>
  );
}
