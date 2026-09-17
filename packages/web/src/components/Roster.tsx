import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { local, type Lesson } from '../lib/time';
import type { components } from '@student/common/api';
import { useWrite } from '../hooks/useWrite';
import { label, Status } from './FormParts';
import { SessionEditor } from './SessionEditor';
import { FeedbackForm } from '../pages/TaskDetail';
import { BookingCredits, useBookingCredits } from './BookingCredits';
import { bookingLocation } from '../lib/booking';
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
  const future =
    l?.status === 'SCHEDULED' && !l.feedbackSubmittedAt && new Date(l.startsAt) > new Date();
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
                <ParticipantCard key={p.participantId} p={p} lesson={l} future={Boolean(future)} />
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
                      key={p.participantId}
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
  const { auth } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const sourceId = params.get('sourceRebookingTaskId');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<components['schemas']['StudentDto'] | null>(null);
  const [kind, setKind] = useState<'TRIAL' | 'REGULAR'>(
    params.get('bucket') === 'REGULAR' ? 'REGULAR' : 'TRIAL',
  );
  const query = useQuery({
    queryKey: ['students', 'picker', auth?.user.id, search],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students', {
        params: { query: { q: search, mine: 'true', pageSize: 20 } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const hint = useQuery({
    queryKey: ['student', 'booking-hint', auth?.user.id, params.get('student')],
    enabled: Boolean(params.get('student')) && !sourceId,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students/{id}', {
        params: { path: { id: params.get('student')! } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const source = useQuery({
    queryKey: ['task', auth?.user.id, sourceId],
    enabled: Boolean(sourceId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/tasks/{id}', {
        params: { path: { id: sourceId! } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const [appliedHint, setAppliedHint] = useState<string | null>(null);
  useEffect(() => {
    if (hint.data?.canEdit && hint.data.id !== appliedHint) {
      setSelected(hint.data);
      setAppliedHint(hint.data.id);
    }
  }, [hint.data, appliedHint]);
  const picked = sourceId ? (source.data?.student ?? null) : selected;
  const context = useBookingCredits(picked?.id);
  const sourceValid =
    !sourceId ||
    (source.data?.status === 'OPEN' &&
      source.data.student?.canEdit &&
      source.data.lesson.courseId === l.courseId);
  const refresh = () => {
    void client.invalidateQueries({
      predicate: (q) =>
        ['roster', 'lessons', 'entitlements', 'student', 'task'].includes(String(q.queryKey[0])),
    });
  };
  const save = useWrite(
    'post',
    '/api/sessions/{id}/participants',
    { id: l.id },
    () => {
      setSelected(null);
      setSearch('');
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete('student');
          next.delete('sourceRebookingTaskId');
          next.delete('bucket');
          return next;
        },
        { replace: true },
      );
    },
    refresh,
  );
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography fontWeight={600}>Add student</Typography>
        {save.isError && <Alert severity="error">{save.error.message}</Alert>}
        <Status query={query} />
        {params.get('student') && !sourceId && <Status query={hint} />}
        {sourceId && (
          <>
            <Status query={source} />
            <Button component={Link} to={`/tasks/${sourceId}`} sx={{ alignSelf: 'flex-start' }}>
              Rebooking follow-up
            </Button>
            {source.data && !sourceValid && (
              <Typography color="error" variant="body2">
                Choose a lesson for the follow-up subject. The follow-up must still be open.
              </Typography>
            )}
          </>
        )}
        <Autocomplete
          options={query.data?.items ?? []}
          value={picked}
          getOptionLabel={(o) => `${o.name} · ${o.yearLevel}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          filterOptions={(o) => o}
          disabled={Boolean(sourceId) || save.isPending}
          onChange={(_, v) => {
            setSelected(v);
            save.reset();
          }}
          onInputChange={(_, v, reason) => {
            if (reason === 'input' || reason === 'clear') setSearch(v.slice(0, 80));
          }}
          loading={query.isFetching}
          renderInput={(p) => <TextField {...p} label="Search my students" />}
        />
        <Stack direction="row" gap={2}>
          <TextField
            label="Lesson credit card"
            select
            value={kind}
            disabled={save.isPending}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              save.reset();
            }}
            sx={{ flex: 1 }}
          >
            <MenuItem value="TRIAL">Trial card</MenuItem>
            <MenuItem value="REGULAR">Regular card</MenuItem>
          </TextField>
          <Button
            variant="contained"
            disabled={!picked || save.isPending || !sourceValid || !context.ready(kind)}
            onClick={() =>
              picked &&
              save.mutate({
                studentId: picked.id,
                kind,
                ...(sourceId ? { sourceRebookingTaskId: sourceId } : {}),
              })
            }
          >
            {save.isPending ? 'Adding…' : 'Add'}
          </Button>
        </Stack>
        {picked && (
          <BookingCredits
            studentId={picked.id}
            kind={kind}
            context={context}
            returnTo={bookingLocation(params, picked.id, kind)}
          />
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
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [action, setAction] = useState<'cancel' | 'restore' | 'move' | ''>(''),
    [reason, setReason] = useState(''),
    [target, setTarget] = useState(''),
    [week, setWeek] = useState(local(l.startsAt).startOf('week').toISODate()!);
  const context = useBookingCredits(
    p.canManage && (action === 'restore' || action === 'move') ? p.id : undefined,
  );
  const success = () => {
    setAction('');
    setReason('');
    setTarget('');
  };
  const refresh = () => {
    void client.invalidateQueries({
      predicate: (q) =>
        ['roster', 'lessons', 'entitlements', 'student'].includes(String(q.queryKey[0])),
    });
  };
  const cancel = useWrite(
    'post',
    '/api/participants/{id}/cancel',
    { id: p.participantId },
    success,
    refresh,
  );
  const restore = useWrite(
    'post',
    '/api/participants/{id}/restore',
    { id: p.participantId },
    success,
    refresh,
  );
  const move = useWrite(
    'post',
    '/api/participants/{id}/move',
    { id: p.participantId },
    success,
    refresh,
  );
  const targets = useQuery({
    queryKey: ['lessons', 'move', week, l.courseId, l.id],
    enabled: action === 'move',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/sessions', {
        params: { query: { week, courseId: l.courseId } },
      });
      if (!data) throw apiError(error);
      return data.filter(
        (s) =>
          s.id !== l.id &&
          s.status === 'SCHEDULED' &&
          !s.feedbackSubmittedAt &&
          new Date(s.startsAt) > new Date(),
      );
    },
  });
  const command = action === 'move' ? move : action === 'restore' ? restore : cancel;
  const card = p.kind === 'REGULAR' ? 'REGULAR' : 'TRIAL';
  const canSubmit =
    future &&
    p.canManage &&
    p.attendance === 'PENDING' &&
    reason.trim() &&
    !command.isPending &&
    (action === 'cancel' || context.ready(card, action === 'move')) &&
    (action !== 'move' || targets.data?.some((s) => s.id === target));
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
        {p.canManage && future && p.attendance === 'PENDING' && (
          <Stack direction="row" gap={1}>
            {(p.bookingStatus === 'BOOKED' ? ['move', 'cancel'] : ['restore']).map((a) => (
              <Button
                key={a}
                disabled={command.isPending}
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
              if (!canSubmit) return;
              const body = { expectedVersion: p.version, reason: reason.trim() };
              if (action === 'move') move.mutate({ ...body, targetSessionId: target });
              else if (action === 'restore') restore.mutate(body);
              else cancel.mutate(body);
            }}
          >
            {command.isError && <Alert severity="error">{command.error.message}</Alert>}
            {(action === 'move' || action === 'restore') && (
              <BookingCredits
                studentId={p.id}
                kind={card}
                context={context}
                moving={action === 'move'}
                returnTo={bookingLocation(params, p.id, card)}
              />
            )}
            {action === 'move' && (
              <>
                <TextField
                  label="Target week"
                  type="date"
                  value={week}
                  disabled={command.isPending}
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
                  disabled={command.isPending || targets.isFetching}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    move.reset();
                  }}
                >
                  <MenuItem value="" disabled>
                    Select a lesson
                  </MenuItem>
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
              disabled={command.isPending}
              required
              onChange={(e) => setReason(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            <Stack direction="row" gap={1}>
              <Button type="submit" variant="outlined" disabled={!canSubmit}>
                {label(action)} booking
              </Button>
              <Button disabled={command.isPending} onClick={() => setAction('')}>
                Close
              </Button>
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
