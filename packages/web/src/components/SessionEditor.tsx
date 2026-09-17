import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { DateTime } from 'luxon';
import { api, apiError, ApiError } from '../api/client';
import { useAuth } from '../auth';
import { useWrite } from '../hooks/useWrite';
import { useLessonEditable } from '../hooks/useLessonEditable';
import { ZONE, local, type Lesson } from '../lib/time';
import { Status, toInstant, wall } from './FormParts';

const lessonFields = (lesson?: Lesson) => {
  const tomorrow = DateTime.now().setZone(ZONE).plus({ days: 1 }).set({ hour: 16, minute: 0 });
  return {
    classGroupId: lesson?.classGroupId ?? '',
    courseId: lesson?.courseId ?? '',
    teacherId: lesson?.teacherId ?? '',
    startsAt: lesson ? wall(lesson.startsAt) : tomorrow.toFormat("yyyy-MM-dd'T'HH:mm"),
    endsAt: lesson
      ? wall(lesson.endsAt)
      : tomorrow.plus({ hours: 1 }).toFormat("yyyy-MM-dd'T'HH:mm"),
  };
};
type Fields = ReturnType<typeof lessonFields>;

export function SessionEditor({
  lesson: initialLesson,
  mode = 'edit',
  close,
}: {
  lesson?: Lesson;
  mode?: 'edit' | 'cancel';
  close: () => void;
}) {
  const { auth, refresh } = useAuth();
  const client = useQueryClient();
  const [lesson, setLesson] = useState(initialLesson);
  const [form, setForm] = useState(() => lessonFields(initialLesson));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [recordedResult, setRecordedResult] = useState(false);
  const editable = useLessonEditable(lesson) && !recordedResult;
  const cancelling = mode === 'cancel';
  const options = useQuery({
    queryKey: ['session-options', auth?.user.id],
    enabled: auth?.user.role === 'ADMIN' && !cancelling,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/sessions/options');
      if (response.status === 401) refresh(null);
      if (!data) throw apiError(error);
      return data;
    },
  });
  // Refresh the version after a conflict, preserving only the fields the user changed.
  // Unedited fields follow the latest server state and are never overwritten by stale inputs.
  const reloadLesson = async () => {
    if (!lesson) return;
    setRefreshing(true);
    setRefreshError('');
    try {
      const { data, error, response } = await api.GET('/api/sessions/{id}/participants', {
        params: { path: { id: lesson.id } },
      });
      if (response.status === 401) refresh(null);
      if (!data) throw apiError(error);
      const before = lessonFields(lesson);
      const latest = lessonFields(data.lesson);
      setForm(
        (draft) =>
          Object.fromEntries(
            Object.keys(latest).map((name) => {
              const key = name as keyof Fields;
              return [key, draft[key] !== before[key] ? draft[key] : latest[key]];
            }),
          ) as Fields,
      );
      if (data.lesson.version !== lesson.version)
        setError('Lesson updated elsewhere. Your changes are kept; review and save again.');
      setLesson(data.lesson);
      setRecordedResult(
        data.participants.some((p) => p.attendance !== 'PENDING' || p.feedbackSubmittedAt),
      );
      client.setQueryData(['roster', auth?.user.id, lesson.id], data);
    } catch (e) {
      setRefreshError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };
  const onError = async (e: Error) => {
    if (e instanceof ApiError && e.status === 409) await reloadLesson();
  };
  const create = useWrite('post', '/api/sessions', {}, close);
  const edit = useWrite('patch', '/api/sessions/{id}', { id: lesson?.id ?? '' }, close, onError);
  const cancel = useWrite(
    'post',
    '/api/sessions/{id}/cancel',
    { id: lesson?.id ?? '' },
    close,
    onError,
  );
  const command = cancelling ? cancel : lesson ? edit : create;
  const busy = command.isPending || refreshing;
  const noOptions =
    options.data &&
    (!options.data.classes.length || !options.data.courses.length || !options.data.teachers.length);
  const disabled =
    busy ||
    Boolean(lesson && !editable) ||
    Boolean(refreshError) ||
    (!cancelling &&
      (!options.data ||
        options.isError ||
        noOptions ||
        Object.values(form).some((value) => !value)));
  if (auth?.user.role !== 'ADMIN') return null;
  return (
    <Dialog
      open
      onClose={() => !busy && close()}
      fullWidth
      maxWidth="sm"
      aria-labelledby="session-editor-title"
    >
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled) return;
          setError('');
          if (lesson && new Date(lesson.startsAt).getTime() <= Date.now()) {
            setError('This lesson has started and can no longer be changed.');
            void reloadLesson();
            return;
          }
          if (cancelling && lesson) {
            cancel.mutate({ expectedVersion: lesson.version, reason: reason.trim() });
            return;
          }
          try {
            const data = {
              ...form,
              startsAt: toInstant(form.startsAt),
              endsAt: toInstant(form.endsAt),
            };
            if (
              new Date(data.startsAt) <= new Date() ||
              new Date(data.endsAt) <= new Date(data.startsAt)
            )
              throw new Error('Choose a future start time and an end time after it.');
            if (lesson) {
              const baseline = lessonFields(lesson);
              const changed = Object.fromEntries(
                Object.entries(data).filter(
                  ([key]) => form[key as keyof Fields] !== baseline[key as keyof Fields],
                ),
              );
              edit.mutate({ ...changed, expectedVersion: lesson.version, reason: reason.trim() });
            } else create.mutate(data);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <DialogTitle id="session-editor-title">
          {cancelling ? 'Cancel lesson' : lesson ? 'Edit lesson' : 'Schedule lesson'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {(error || command.error) && (
              <Alert severity="error">{error || command.error?.message}</Alert>
            )}
            {refreshError && (
              <Alert
                severity="error"
                action={
                  <Button onClick={() => void reloadLesson()} disabled={busy}>
                    Retry
                  </Button>
                }
              >
                Could not refresh the lesson: {refreshError}
              </Alert>
            )}
            {lesson && !editable && (
              <Typography role="status" color="text.secondary">
                This lesson is cancelled, has started or has recorded results. It is read-only.
              </Typography>
            )}
            {cancelling && lesson ? (
              <>
                <Typography fontWeight={600}>
                  {lesson.className} · {lesson.courseName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {lesson.teacherName} · {local(lesson.startsAt).toFormat('d LLL yyyy HH:mm')}–
                  {local(lesson.endsAt).toFormat('HH:mm')} · Melbourne
                </Typography>
                <Typography>
                  Cancel this lesson for all {lesson.participantCount} students?
                </Typography>
              </>
            ) : (
              <>
                <Status query={options} />
                {noOptions && (
                  <Typography color="text.secondary">
                    A class, subject and teacher are needed to schedule a lesson.
                  </Typography>
                )}
                {options.data &&
                  (['classGroupId', 'courseId', 'teacherId'] as const).map((key, i) => (
                    <TextField
                      key={key}
                      select
                      required
                      label={['Class', 'Subject', 'Teacher'][i]}
                      value={form[key]}
                      disabled={busy || Boolean(lesson && !editable)}
                      onChange={(e) =>
                        setForm((current) => ({ ...current, [key]: e.target.value }))
                      }
                    >
                      {[options.data.classes, options.data.courses, options.data.teachers][i].map(
                        (o) => (
                          <MenuItem key={o.id} value={o.id}>
                            {o.name}
                          </MenuItem>
                        ),
                      )}
                    </TextField>
                  ))}
                <Stack direction="row" gap={2}>
                  {(['startsAt', 'endsAt'] as const).map((key, i) => (
                    <TextField
                      key={key}
                      label={`${i ? 'End' : 'Start'} · Melbourne`}
                      type="datetime-local"
                      required
                      fullWidth
                      value={form[key]}
                      disabled={busy || Boolean(lesson && !editable)}
                      onChange={(e) =>
                        setForm((current) => ({ ...current, [key]: e.target.value }))
                      }
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  ))}
                </Stack>
                {lesson && (
                  <Typography variant="body2" color="text.secondary">
                    Changes apply to every student in this lesson.
                  </Typography>
                )}
              </>
            )}
            {lesson && (
              <TextField
                label={cancelling ? 'Cancellation reason' : 'Reason for change'}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy || !editable}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={close}>
            {cancelling ? 'Keep lesson' : 'Close'}
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={cancelling ? 'error' : 'primary'}
            disabled={disabled || Boolean(lesson && !reason.trim())}
          >
            {busy ? 'Saving…' : cancelling ? 'Cancel lesson' : 'Save lesson'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
