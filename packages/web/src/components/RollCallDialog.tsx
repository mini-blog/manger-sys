import { StudentBackground } from './StudentBackground';
import { useEffect, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircleOutline } from '@mui/icons-material';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { components } from '@student/common/api';
import { useAuth } from '../auth';
import { useWrite } from '../hooks/useWrite';
import { rosterKey, useRoster } from '../hooks/useRoster';
import { label, Status } from './FormParts';
import { local } from '../lib/time';

type Roster = components['schemas']['RosterDto'];
type Participant = components['schemas']['ParticipantDto'];

export function RollCallDialog({ sessionId, close }: { sessionId: string; close: () => void }) {
  const query = useRoster(sessionId);
  const [now, setNow] = useState(Date.now);
  const titleId = useId();
  const roster = query.data;
  const lesson = roster?.lesson;
  // Refresh eligibility at the lesson boundaries, including a dialog left open before class.
  useEffect(() => {
    if (!lesson) return;
    const current = Date.now();
    const boundary = [lesson.startsAt, lesson.endsAt].map(Date.parse).find((t) => t > current);
    if (!boundary) return;
    const timer = window.setTimeout(
      () => {
        setNow(Date.now());
        void query.refetch();
      },
      Math.min(boundary - current + 50, 2147483647),
    );
    return () => window.clearTimeout(timer);
  }, [lesson?.startsAt, lesson?.endsAt, now, query.refetch]);
  const checked =
    roster?.participants.filter((p) => p.checkedInAt && p.attendance === 'ATTENDED').length ?? 0;
  const ended = Boolean(lesson && Date.parse(lesson.endsAt) <= Math.max(now, Date.now()));
  return (
    <Dialog open onClose={close} fullWidth maxWidth="md" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>Roll call</DialogTitle>
      <DialogContent>
        <Status query={query} />
        {roster && lesson && !query.isError && (
          <>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="baseline"
              gap={2}
              sx={{ mb: 2 }}
            >
              <Stack>
                <Typography fontWeight={600}>
                  {lesson.className} · {lesson.courseName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {local(lesson.startsAt).toFormat('ccc d LLL, HH:mm')}–
                  {local(lesson.endsAt).toFormat('HH:mm')} · Melbourne
                </Typography>
              </Stack>
              <Typography role="status" aria-live="polite" variant="body2">
                {checked} / {roster.participants.length} checked in
              </Typography>
            </Stack>
            <TableContainer>
              <Table size="small" aria-label="Lesson roll call">
                <TableHead>
                  <TableRow>
                    <TableCell>Student</TableCell>
                    <TableCell>Membership</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {roster.participants.map((p) => (
                    <RollCallRow key={p.participantId} p={p} sessionId={sessionId} ended={ended} />
                  ))}
                  {!roster.participants.length && (
                    <TableRow>
                      <TableCell colSpan={4}>No students booked.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Close roll call</Button>
      </DialogActions>
    </Dialog>
  );
}

function RollCallRow({
  p,
  sessionId,
  ended,
}: {
  p: Participant;
  sessionId: string;
  ended: boolean;
}) {
  const client = useQueryClient();
  const { auth } = useAuth();
  const errorId = useId();
  const key = rosterKey(auth?.user.id, sessionId);
  const save = useWrite(
    'post',
    '/api/participants/{id}/check-in',
    { id: p.participantId },
    (result) => {
      // Only the confirmed server response changes the checkmark; no optimistic attendance.
      client.setQueryData<Roster>(
        key,
        (previous) =>
          previous && {
            ...previous,
            lesson: {
              ...previous.lesson,
              version: Math.max(previous.lesson.version, result.sessionVersion),
            },
            participants: previous.participants.map((row) =>
              row.participantId === result.id
                ? {
                    ...row,
                    attendance: result.attendance,
                    checkedInAt: result.checkedInAt,
                    checkedInBy: result.checkedInBy,
                    version: Math.max(row.version, result.version),
                    canCheckIn: false,
                  }
                : row,
            ),
          },
      );
    },
    async () => {
      // A stale version is refreshed without losing the row's error or closing the dialog.
      await client.invalidateQueries({ queryKey: key });
    },
  );
  const checked = Boolean(p.checkedInAt && p.attendance === 'ATTENDED');
  const action = ended ? 'Late check-in' : 'Check in';
  return (
    <TableRow sx={{ bgcolor: p.type === 'TRIAL' ? '#fffbf2' : undefined }}>
      <TableCell component="th" scope="row">
        <Typography variant="body2" fontWeight={600}>
          {p.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {p.yearLevel} · {p.gender ? label(p.gender) : 'Not provided'} ·{' '}
          {p.age == null ? 'Age not provided' : `Age ${p.age}`}
        </Typography>
        <StudentBackground key={p.participantId} name={p.name} html={p.backgroundHtml} />
      </TableCell>
      <TableCell>
        <Chip
          size="small"
          label={label(p.membershipCategory)}
          color={p.type === 'TRIAL' ? 'warning' : 'default'}
        />
      </TableCell>
      <TableCell>
        <Stack role="status" aria-live="polite" spacing={0.5}>
          {checked ? (
            <Stack direction="row" alignItems="center" gap={0.5}>
              <CheckCircleOutline color="success" fontSize="small" />
              <Typography variant="body2">Checked in</Typography>
            </Stack>
          ) : (
            <Typography variant="body2">
              {save.isPending ? 'Checking in…' : 'Not checked in'}
            </Typography>
          )}
          {checked && (
            <Typography variant="caption" color="text.secondary">
              {local(p.checkedInAt!).toFormat('d LLL, HH:mm')}
            </Typography>
          )}
          {save.isError && !checked && (
            <Alert id={errorId} severity="error" sx={{ maxWidth: 300, py: 0 }}>
              {save.error.message}
            </Alert>
          )}
        </Stack>
      </TableCell>
      <TableCell align="right">
        {!checked && (
          <Button
            size="small"
            variant="outlined"
            disabled={!p.canCheckIn || save.isPending}
            aria-label={`${action}: ${p.name}`}
            aria-describedby={save.isError ? errorId : undefined}
            startIcon={save.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
            onClick={() => save.mutate({ expectedVersion: p.version })}
          >
            {save.isPending ? 'Checking in…' : save.isError ? 'Retry' : action}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
