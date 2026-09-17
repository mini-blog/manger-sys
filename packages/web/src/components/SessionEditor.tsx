import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DateTime } from 'luxon';
import { api, apiError } from '../api/client';
import { useWrite } from '../hooks/useWrite';
import { ZONE, type Lesson } from '../lib/time';
import { Status, toInstant, wall } from './FormParts';
export function SessionEditor({
  lesson: initialLesson,
  participantIds: initialIds = [],
  participantNames: initialNames = [],
  close,
}: {
  lesson?: Lesson;
  participantIds?: string[];
  participantNames?: string[];
  close: () => void;
}) {
  const [lesson, setLesson] = useState(initialLesson);
  const [participantIds, setIds] = useState(initialIds);
  const [participantNames, setNames] = useState(initialNames);
  const [form, setForm] = useState({
    classGroupId: lesson?.classGroupId ?? '',
    courseId: lesson?.courseId ?? '',
    teacherId: lesson?.teacherId ?? '',
    startsAt: lesson
      ? wall(lesson.startsAt)
      : DateTime.now()
          .setZone(ZONE)
          .plus({ days: 1 })
          .set({ hour: 16, minute: 0 })
          .toFormat("yyyy-MM-dd'T'HH:mm"),
    endsAt: lesson
      ? wall(lesson.endsAt)
      : DateTime.now()
          .setZone(ZONE)
          .plus({ days: 1 })
          .set({ hour: 17, minute: 0 })
          .toFormat("yyyy-MM-dd'T'HH:mm"),
    capacity: lesson?.capacity ?? 8,
    reason: '',
  });
  const [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['session-options'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/sessions/options');
      if (!data) throw apiError(error);
      return data;
    },
  });
  const create = useWrite('post', '/api/sessions', {}, close);
  const edit = useWrite('patch', '/api/sessions/{id}', { id: lesson?.id ?? '' }, close);
  const cancel = useWrite('post', '/api/sessions/{id}/cancel', { id: lesson?.id ?? '' }, close);
  const pending = create.isPending || edit.isPending || cancel.isPending;
  return (
    <Dialog open onClose={() => !pending && close()} fullWidth maxWidth="sm">
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setError('');
            const { reason, ...f } = form;
            const data = {
              ...f,
              startsAt: toInstant(form.startsAt),
              endsAt: toInstant(form.endsAt),
            };
            if (lesson)
              edit.mutate({
                ...data,
                reason,
                expectedVersion: lesson.version,
                confirmedAffectedParticipantIds: participantIds,
              });
            else create.mutate(data);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <DialogTitle>{lesson ? 'Edit lesson' : 'Schedule lesson'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Status query={query} />
            {(error || create.error || edit.error || cancel.error) && (
              <Alert severity="error">
                {error || create.error?.message || edit.error?.message || cancel.error?.message}
              </Alert>
            )}
            {lesson && (edit.isError || cancel.isError) && (
              <Button
                onClick={async () => {
                  const { data, error } = await api.GET('/api/sessions/{id}/participants', {
                    params: { path: { id: lesson.id } },
                  });
                  if (!data) {
                    setError(apiError(error).message);
                    return;
                  }
                  setLesson(data.lesson);
                  setIds(data.participants.map((p) => p.participantId));
                  setNames(data.participants.map((p) => p.name));
                  setConfirmed(false);
                  edit.reset();
                  cancel.reset();
                }}
              >
                Reload affected students
              </Button>
            )}
            {query.data &&
              (['classGroupId', 'courseId', 'teacherId'] as const).map((key, i) => (
                <TextField
                  key={key}
                  select
                  required
                  label={['Class', 'Subject', 'Teacher'][i]}
                  value={form[key]}
                  disabled={Boolean(lesson && participantIds.length && key !== 'teacherId')}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                >
                  {[query.data!.classes, query.data!.courses, query.data!.teachers][i].map((o) => (
                    <MenuItem key={o.id} value={o.id}>
                      {o.name}
                    </MenuItem>
                  ))}
                </TextField>
              ))}
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              {(['startsAt', 'endsAt'] as const).map((key, i) => (
                <TextField
                  key={key}
                  label={`${i ? 'End' : 'Start'} · Melbourne`}
                  type="datetime-local"
                  required
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                />
              ))}
            </Stack>
            <TextField
              label="Capacity"
              type="number"
              required
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              slotProps={{ htmlInput: { min: 1, max: 100 } }}
            />
            {lesson && (
              <>
                <TextField
                  label="Reason for change"
                  required
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
                <Typography variant="body2" color="text.secondary">
                  Current: {lesson.teacherName} · {wall(lesson.startsAt).replace('T', ' ')} –{' '}
                  {wall(lesson.endsAt).slice(-5)}
                </Typography>
                <Typography variant="body2">
                  Affected students: {participantNames.join(', ') || 'None'}
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                  }
                  label={`I have reviewed the impact on all ${participantIds.length} booked students.`}
                />
                {cancel.isError && (
                  <Typography color="error">Cancellation was not saved.</Typography>
                )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          {lesson && (
            <Button
              color="error"
              disabled={pending || !confirmed || !form.reason.trim()}
              onClick={() =>
                cancel.mutate({
                  expectedVersion: lesson.version,
                  reason: form.reason,
                  confirmedAffectedParticipantIds: participantIds,
                })
              }
            >
              Cancel lesson
            </Button>
          )}
          <Stack direction="row" gap={1} sx={{ ml: 'auto' }}>
            <Button disabled={pending} onClick={close}>
              Close
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={pending || Boolean(lesson && !confirmed)}
            >
              Save lesson
            </Button>
          </Stack>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
