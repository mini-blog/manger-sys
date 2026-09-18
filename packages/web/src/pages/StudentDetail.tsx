import { RichView } from '../components/RichText';
import { ScoreField } from '../components/ScoreField';
import { GuardianFields, guardianFormFrom, guardianPayload } from '../components/GuardianFields';
import { StudentDemographicsFields } from '../components/StudentDemographicsFields';
import { YEAR_LEVELS } from '@student/common';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
import type { components } from '@student/common/api';
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
import { bookingReturn } from '../lib/booking';
import { membershipLabels } from '../lib/membership';
import { CreditBalance } from '../components/CreditBalances';
import { useMembershipRefresh } from '../hooks/useMembershipRefresh';
type Student = components['schemas']['StudentDetailDto'];
export function StudentDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const returnTo = bookingReturn(params.get('returnTo'));
  const query = useQuery({
    queryKey: ['student', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students/{id}', { params: { path: { id } } });
      if (!data) throw apiError(error);
      return data;
    },
  });
  useMembershipRefresh(query.data?.nextCategoryChangeAt);
  return (
    <Stack spacing={3}>
      <Button
        component={Link}
        to={returnTo ?? `/students?category=${query.data?.membershipCategory ?? 'TRIAL_STUDENT'}`}
        sx={{ alignSelf: 'flex-start' }}
      >
        {returnTo ? '← Back to lesson' : '← Students'}
      </Button>
      <Status query={query} />
      {query.data && <StudentProfile key={`${id}:${query.data.version}`} student={query.data} />}
    </Stack>
  );
}
function StudentProfile({ student: s }: { student: Student }) {
  const [edit, setEdit] = useState(false);
  const [age, setAge] = useState(s.age == null ? '' : String(s.age));
  const [gender, setGender] = useState(s.gender ?? '');
  const [fields, setFields] = useState({
    name: s.name,
    yearLevel: s.yearLevel,
    ...guardianFormFrom(s),
  });
  const save = useWrite('patch', '/api/students/{id}', { id: s.id }, () => setEdit(false));
  const text = (key: keyof typeof fields, title: string, multiline = false) => (
    <TextField
      key={key}
      disabled={save.isPending}
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
            {` · ${membershipLabels[s.membershipCategory]}`}
            {s.gender ? ` · ${label(s.gender)}` : ''}
            {s.age != null ? ` · Age ${s.age}` : ''}
          </Typography>
        </div>
        {s.canEdit && (
          <Button variant="outlined" disabled={save.isPending} onClick={() => setEdit(!edit)}>
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
              name: fields.name,
              ...guardianPayload(fields),
              age: age === '' ? undefined : Number(age),
              gender: gender as components['schemas']['UpdateStudentDto']['gender'],
              clearAge: age === '',
              clearGuardianAge: fields.guardianAge === '',
              yearLevel: fields.yearLevel as components['schemas']['UpdateStudentDto']['yearLevel'],
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
              disabled={save.isPending}
              onChange={(e) => setFields({ ...fields, yearLevel: e.target.value })}
            >
              {YEAR_LEVELS.map((y) => (
                <MenuItem key={y} value={y}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
            <StudentDemographicsFields
              age={age}
              gender={gender}
              onAge={setAge}
              onGender={setGender}
              disabled={save.isPending}
            />
            <Divider />
            <GuardianFields
              value={fields}
              onChange={(value) => setFields({ ...fields, ...value })}
              disabled={save.isPending}
            />
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
      {s.responsibleAdmin && (
        <Typography variant="body2" color="text.secondary">
          Responsible admin: {s.responsibleAdmin.name} · Recorded by:{' '}
          {s.recordedByAdmin?.name ?? 'Unknown (historical record)'}
        </Typography>
      )}
      {s.canEdit && <StudentCredits student={s} />}
      {s.backgroundHtml !== undefined && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Basic information</Typography>
          <RichView html={s.backgroundHtml} />
        </Paper>
      )}
      {s.canEdit && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Admin notes</Typography>
          <RichView html={s.adminNotesHtml} />
        </Paper>
      )}
      {s.canEdit && !edit && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">Guardian & preferences</Typography>
          <Typography sx={{ mt: 1 }}>
            {s.guardianName || 'Guardian name not provided'}
            {s.guardianRelationship ? ` · ${s.guardianRelationship}` : ''}
          </Typography>
          <Typography color="text.secondary">
            {[s.guardianPhone, s.guardianEmail, s.guardianWechat].filter(Boolean).join(' · ')}
          </Typography>
          <Typography color="text.secondary">
            {[
              s.guardianOccupation ? `Occupation: ${s.guardianOccupation}` : '',
              s.guardianAge != null ? `Age: ${s.guardianAge}` : '',
              s.guardianGender ? `Gender: ${label(s.guardianGender)}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
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
              <ScoreField
                label="Classroom performance"
                value={r.classroomPerformanceRating}
                readOnly
              />
              <ScoreField label="Overall ability" value={r.overallAbilityRating} readOnly />
              <RichView html={r.teacherNoteHtml} />
            </div>
          ))}
        </Stack>
      </Paper>
      {s.canEdit && <Communications student={s} />}
    </>
  );
}
function StudentCredits({ student }: { student: Student }) {
  const query = useQuery({
    queryKey: ['entitlements', 'summary', student.id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students/{id}/entitlements', {
        params: { path: { id: student.id } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const params = new URLSearchParams({
    studentId: student.id,
    action: 'grant',
    returnTo: `/students/${student.id}`,
  });
  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Lesson credits</Typography>
        <Button component={Link} to={`/entitlements?${params}`}>
          Add credits
        </Button>
      </Stack>
      <Status query={query} />
      {query.data && (
        <Stack direction="row" gap={5}>
          <div>
            <Typography variant="body2" color="text.secondary">
              Trial card
            </Typography>
            <CreditBalance balance={query.data.balances.TRIAL} />
          </div>
          <div>
            <Typography variant="body2" color="text.secondary">
              Regular card
            </Typography>
            <CreditBalance balance={query.data.balances.REGULAR} />
          </div>
        </Stack>
      )}
    </Paper>
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
    noteHtml: '',
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
    setForm({ ...form, noteHtml: '' });
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
            </Typography>
            <RichView html={c.noteHtml} />
            {c.purchaseIntentRating != null && (
              <ScoreField label="Purchase intent" value={c.purchaseIntentRating} readOnly />
            )}
            <Typography variant="body2">{c.notPurchasedReasons.map(label).join(' · ')}</Typography>
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
