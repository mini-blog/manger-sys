import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  Pagination,
} from '@mui/material';
import { api, apiError } from '../api/client';
import type { components } from '../api/schema';
import { useWrite } from '../hooks/useWrite';
import {
  CommunicationFieldsForm,
  channels,
  label,
  Status,
  toInstant,
  wall,
  type CommunicationFields,
} from '../components/FormParts';
import { local } from '../lib/time';
type Student = components['schemas']['StudentDetailDto'];
export function StudentDetail() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['student', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students/{id}', { params: { path: { id } } });
      if (!data) throw apiError(error);
      return data;
    },
  });
  return (
    <Stack spacing={3}>
      <Button component={Link} to="/students" sx={{ alignSelf: 'flex-start' }}>
        ← Students
      </Button>
      <Status query={query} />
      {query.data && <StudentProfile key={`${id}:${query.data.version}`} student={query.data} />}
    </Stack>
  );
}
function StudentProfile({ student: s }: { student: Student }) {
  const [edit, setEdit] = useState(false);
  const [fields, setFields] = useState({
    name: s.name,
    yearLevel: s.yearLevel,
    guardianName: s.guardianName ?? '',
    guardianRelationship: s.guardianRelationship ?? '',
    guardianPhone: s.guardianPhone ?? '',
    guardianEmail: s.guardianEmail ?? '',
    guardianWechat: s.guardianWechat ?? '',
    preferredChannel: s.preferredChannel ?? '',
    preferredLanguage: s.preferredLanguage ?? 'en-AU',
    learningGoals: s.learningGoals ?? '',
    preferredTimes: s.preferredTimes ?? '',
    interestedSubjects: s.interestedSubjects ?? '',
    firstEnrolledOn: s.firstEnrolledOn ?? '',
  });
  const save = useWrite('patch', '/api/students/{id}', { id: s.id }, () => setEdit(false));
  const text = (key: keyof typeof fields, title: string, multiline = false) => (
    <TextField
      key={key}
      label={title}
      value={fields[key]}
      onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      slotProps={{ htmlInput: { maxLength: multiline ? 1000 : 254 } }}
      fullWidth
    />
  );
  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <div>
          <Typography variant="h4" component="h1">
            {s.name}
          </Typography>
          <Typography color="text.secondary">
            {s.yearLevel}
            {s.firstEnrolledOn ? ` · Enrolled ${s.firstEnrolledOn}` : ''}
          </Typography>
        </div>
        {s.canEdit && (
          <Button variant="outlined" onClick={() => setEdit(!edit)}>
            {edit ? 'Close editor' : 'Edit student'}
          </Button>
        )}
      </Stack>
      {edit && (
        <Paper
          component="form"
          sx={{ p: 3, maxWidth: 850 }}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              ...fields,
              firstEnrolledOn: fields.firstEnrolledOn || undefined,
              yearLevel: fields.yearLevel as components['schemas']['UpdateStudentDto']['yearLevel'],
              preferredChannel:
                fields.preferredChannel as components['schemas']['UpdateStudentDto']['preferredChannel'],
              preferredLanguage: fields.preferredLanguage as 'en-AU' | 'zh-CN',
              expectedVersion: s.version,
            });
          }}
        >
          <Stack spacing={2}>
            {save.isError && <Alert severity="error">{save.error.message}</Alert>}
            {text('name', 'Student name')}
            <TextField
              label="Year level"
              select
              value={fields.yearLevel}
              onChange={(e) => setFields({ ...fields, yearLevel: e.target.value })}
            >
              {[
                'Not assessed',
                'Foundation',
                ...Array.from({ length: 12 }, (_, i) => `Year ${i + 1}`),
              ].map((y) => (
                <MenuItem key={y} value={y}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="First enrolment date"
              type="date"
              value={fields.firstEnrolledOn}
              disabled={Boolean(s.firstEnrolledOn)}
              onChange={(e) => setFields({ ...fields, firstEnrolledOn: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Divider />
            {text('guardianName', 'Guardian name')}
            {text('guardianRelationship', 'Relationship')}
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              {text('guardianPhone', 'Phone')}
              {text('guardianEmail', 'Email')}
            </Stack>
            {text('guardianWechat', 'WeChat')}
            <Stack direction="row" gap={2}>
              <TextField
                label="Preferred channel"
                select
                fullWidth
                value={fields.preferredChannel}
                onChange={(e) => setFields({ ...fields, preferredChannel: e.target.value })}
              >
                <MenuItem value="">Not set</MenuItem>
                {channels
                  .filter((c) => c !== 'IN_PERSON')
                  .map((c) => (
                    <MenuItem key={c} value={c}>
                      {label(c)}
                    </MenuItem>
                  ))}
              </TextField>
              <TextField
                label="Language"
                select
                fullWidth
                value={fields.preferredLanguage}
                onChange={(e) => setFields({ ...fields, preferredLanguage: e.target.value })}
              >
                <MenuItem value="en-AU">English</MenuItem>
                <MenuItem value="zh-CN">中文</MenuItem>
              </TextField>
            </Stack>
            {text('learningGoals', 'Learning goals', true)}
            {text('preferredTimes', 'Preferred lesson times', true)}
            {text('interestedSubjects', 'Subjects of interest', true)}
            <Button
              type="submit"
              variant="contained"
              disabled={save.isPending}
              sx={{ alignSelf: 'flex-start' }}
            >
              Save student
            </Button>
          </Stack>
        </Paper>
      )}
      {s.canEdit && !edit && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">Guardian & preferences</Typography>
          <Typography sx={{ mt: 1 }}>
            {s.guardianName || 'No guardian details'}
            {s.guardianRelationship ? ` · ${s.guardianRelationship}` : ''}
          </Typography>
          <Typography color="text.secondary">
            {[s.guardianPhone, s.guardianEmail, s.guardianWechat].filter(Boolean).join(' · ')}
          </Typography>
          {s.learningGoals && <Typography sx={{ mt: 2 }}>Goals: {s.learningGoals}</Typography>}
          {s.preferredTimes && <Typography>Preferred times: {s.preferredTimes}</Typography>}
          {s.interestedSubjects && <Typography>Subjects: {s.interestedSubjects}</Typography>}
          <Button component={Link} to={`/timetable?student=${s.id}`} sx={{ mt: 2 }}>
            Find a lesson
          </Button>
        </Paper>
      )}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Lessons & feedback
        </Typography>
        <Stack spacing={2}>
          {s.teachingRecords.length === 0 && (
            <Typography color="text.secondary">No lessons to display.</Typography>
          )}
          {s.teachingRecords.map((r) => (
            <div key={r.participantId}>
              <Typography fontWeight={600}>
                {r.lesson.courseName} · {local(r.lesson.startsAt).toFormat('d LLL yyyy HH:mm')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {r.lesson.teacherName} · {label(r.attendance)}
              </Typography>
              {r.feedback && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{r.feedback}</Typography>}
            </div>
          ))}
        </Stack>
      </Paper>
      {s.canEdit && <Communications student={s} />}
    </>
  );
}
export function Communications({ student: s }: { student: Student }) {
  const [page, setPage] = useState(1),
    [open, setOpen] = useState(false),
    [localError, setError] = useState('');
  const [form, setForm] = useState<CommunicationFields>({
    guardianNameSnapshot: s.guardianName ?? '',
    channel:
      s.preferredChannel ||
      (s.guardianEmail
        ? 'EMAIL'
        : s.guardianPhone
          ? 'PHONE'
          : s.guardianWechat
            ? 'WECHAT'
            : 'IN_PERSON'),
    content: '',
    occurredAt: wall(new Date().toISOString()),
  });
  const query = useQuery({
    queryKey: ['communications', s.id, page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students/{id}/communications', {
        params: { path: { id: s.id }, query: { page, pageSize: 10 } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const save = useWrite('post', '/api/students/{id}/communications', { id: s.id }, () => {
    setOpen(false);
    setForm({ ...form, content: '' });
    setPage(1);
  });
  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Communication history</Typography>
        <Button
          onClick={() => {
            setOpen(!open);
            save.reset();
            setError('');
          }}
        >
          Add record
        </Button>
      </Stack>
      {open && (
        <Stack
          component="form"
          spacing={2}
          sx={{ mb: 3, maxWidth: 700 }}
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setError('');
              save.mutate({
                ...form,
                channel: form.channel as (typeof channels)[number],
                occurredAt: toInstant(form.occurredAt),
              });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {(save.isError || localError) && (
            <Alert severity="error">{localError || save.error?.message}</Alert>
          )}
          <CommunicationFieldsForm value={form} set={setForm} />
          <Button
            type="submit"
            variant="contained"
            disabled={save.isPending}
            sx={{ alignSelf: 'flex-start' }}
          >
            Save communication
          </Button>
        </Stack>
      )}
      <Status query={query} />
      <Stack spacing={2}>
        {query.data?.items.length === 0 && (
          <Typography color="text.secondary">No communication recorded.</Typography>
        )}
        {query.data?.items.map((c) => (
          <div key={c.id}>
            <Typography variant="body2" color="text.secondary">
              {local(c.occurredAt).toFormat('d LLL yyyy HH:mm')} · {label(c.channel)} ·{' '}
              {c.guardianNameSnapshot} · {c.authorName}
              {c.outcome ? ` · ${label(c.outcome)}` : ''}
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{c.content}</Typography>
          </div>
        ))}
      </Stack>
      {(query.data?.total ?? 0) > 10 && (
        <Pagination
          page={page}
          count={Math.ceil(query.data!.total / 10)}
          onChange={(_, p) => setPage(p)}
          sx={{ mt: 2 }}
        />
      )}
    </Paper>
  );
}
