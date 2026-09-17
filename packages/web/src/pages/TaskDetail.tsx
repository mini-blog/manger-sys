import type { SupportedLanguage } from '@student/common';
import { FOLLOW_UP_OUTCOMES } from '@student/common';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { api, apiError } from '../api/client';
import type { components } from '@student/common/api';
import { useAuth } from '../auth';
import { useWrite } from '../hooks/useWrite';
import {
  channels,
  CommunicationFieldsForm,
  label,
  Status,
  toInstant,
  wall,
  type CommunicationFields,
} from '../components/FormParts';
import { local } from '../lib/time';
import { Communications } from './StudentDetail';
type Task = components['schemas']['TaskDetailDto'];
type Roster = components['schemas']['RosterDto'];
export function TaskDetail() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['task', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/tasks/{id}', { params: { path: { id } } });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const t = query.data;
  return (
    <Stack spacing={3} sx={{ maxWidth: 1050 }}>
      <Button component={Link} to="/" sx={{ alignSelf: 'flex-start' }}>
        ← My tasks
      </Button>
      <Status query={query} />
      {t && (
        <>
          <Stack direction="row" gap={2} alignItems="center">
            <Typography variant="h4" component="h1">
              {t.type === 'LESSON_FEEDBACK' ? 'Lesson feedback' : t.studentName}
            </Typography>
            <Chip label={label(t.status)} size="small" />
          </Stack>
          <Typography color="text.secondary">
            {t.className} · {t.courseName} · {local(t.startsAt).toFormat('ccc d LLL yyyy, HH:mm')} ·{' '}
            {t.teacherName}
          </Typography>
          {t.type === 'LESSON_FEEDBACK' ? (
            <TeacherTask task={t} />
          ) : (
            <FollowUp key={`${id}:${t.version}`} task={t} />
          )}
        </>
      )}
    </Stack>
  );
}
function TeacherTask({ task: t }: { task: Task }) {
  const query = useQuery({
    queryKey: ['roster', t.sessionId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/sessions/{id}/participants', {
        params: { path: { id: t.sessionId } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  return (
    <>
      <Status query={query} />
      {query.data && (
        <FeedbackForm key={`${t.sessionId}:${query.data.lesson.version}`} roster={query.data} />
      )}
    </>
  );
}
export function FeedbackForm({ roster: r }: { roster: Roster }) {
  const [summary, setSummary] = useState(r.lesson.summary ?? '');
  const [rows, setRows] = useState(
    r.participants.map((p) => ({
      participantId: p.participantId,
      attendance: p.attendance === 'PENDING' ? '' : p.attendance,
      feedback: p.feedback ?? '',
      abilityNote: p.abilityNote ?? '',
      preferenceNote: p.preferenceNote ?? '',
    })),
  );
  const save = useWrite('post', '/api/sessions/{id}/feedback', { id: r.lesson.id });
  const done = Boolean(r.lesson.feedbackSubmittedAt);
  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          expectedVersion: r.lesson.version,
          summary,
          students: rows.map((p) => ({ ...p, attendance: p.attendance as 'ATTENDED' | 'NO_SHOW' })),
        });
      }}
    >
      {save.isError && <Alert severity="error">{save.error.message}</Alert>}
      {r.participants.map((p, i) => (
        <Paper
          key={p.participantId}
          sx={{ p: 3, borderColor: p.kind === 'TRIAL' ? '#dfbd76' : undefined }}
        >
          <Stack spacing={2}>
            <Stack direction="row" gap={2} alignItems="center">
              <Typography fontWeight={600}>{p.name}</Typography>
              <Chip
                size="small"
                label={label(p.category)}
                color={p.kind === 'TRIAL' ? 'warning' : 'default'}
              />
              <Typography variant="body2" color="text.secondary">
                {p.yearLevel}
              </Typography>
            </Stack>
            <TextField
              select
              label="Attendance"
              required
              disabled={done}
              value={rows[i].attendance}
              onChange={(e) =>
                setRows(
                  rows.map((row, n) => (n === i ? { ...row, attendance: e.target.value } : row)),
                )
              }
              sx={{ maxWidth: 230 }}
            >
              <MenuItem value="ATTENDED">Attended</MenuItem>
              <MenuItem value="NO_SHOW">Did not attend</MenuItem>
            </TextField>
            {(['feedback', 'abilityNote', 'preferenceNote'] as const).map((key) => (
              <TextField
                key={key}
                label={
                  {
                    feedback: 'Individual feedback',
                    abilityNote: 'Ability & learning level',
                    preferenceNote: 'Learning preferences',
                  }[key]
                }
                multiline
                minRows={key === 'feedback' ? 2 : 1}
                disabled={done}
                required={
                  key === 'feedback' && p.kind === 'TRIAL' && rows[i].attendance === 'ATTENDED'
                }
                value={rows[i][key]}
                onChange={(e) =>
                  setRows(rows.map((row, n) => (n === i ? { ...row, [key]: e.target.value } : row)))
                }
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
            ))}
          </Stack>
        </Paper>
      ))}
      <TextField
        label="Class summary (optional)"
        multiline
        minRows={2}
        disabled={done}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
      />
      {done ? (
        <Typography color="text.secondary">
          Submitted {local(r.lesson.feedbackSubmittedAt!).toFormat('d LLL yyyy, HH:mm')}
        </Typography>
      ) : (
        <Button
          type="submit"
          variant="contained"
          disabled={save.isPending || rows.some((p) => !p.attendance)}
          sx={{ alignSelf: 'flex-start' }}
        >
          Submit feedback · {rows.length} students
        </Button>
      )}
    </Stack>
  );
}
function FollowUp({ task: t }: { task: Task }) {
  const s = t.student!;
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
  const [outcome, setOutcome] = useState(''),
    [next, setNext] = useState(''),
    [reason, setReason] = useState(''),
    [enrolled, setEnrolled] = useState(s.firstEnrolledOn ?? ''),
    [error, setError] = useState('');
  const save = useWrite('post', '/api/tasks/{id}/follow-up', { id: t.id });
  const reopen = useWrite('post', '/api/tasks/{id}/reopen', { id: t.id });
  const done = ['NOT_INTERESTED', 'ENROLLED'].includes(outcome);
  return (
    <>
      <Paper sx={{ p: 3 }}>
        <Stack spacing={1}>
          <Stack direction="row" gap={2}>
            <Typography variant="h6">{label(t.reason ?? 'Follow up')}</Typography>
            <Button component={Link} to={`/students/${s.id}`}>
              Student profile
            </Button>
          </Stack>
          <Typography>
            {s.guardianName} · {s.guardianRelationship}
          </Typography>
          <Typography color="text.secondary">
            {[s.guardianPhone, s.guardianEmail, s.guardianWechat].filter(Boolean).join(' · ')}
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Typography fontWeight={600}>Teacher feedback</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>
            {t.participant?.feedback || 'No individual feedback recorded.'}
          </Typography>
          {t.participant?.abilityNote && (
            <Typography>Ability: {t.participant.abilityNote}</Typography>
          )}
          {t.participant?.preferenceNote && (
            <Typography>Preferences: {t.participant.preferenceNote}</Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            Due {local(t.dueAt).toFormat('d LLL yyyy, HH:mm')} · Melbourne
          </Typography>
        </Stack>
      </Paper>
      <AiSuggestions key={t.id} task={t} />
      {t.status === 'OPEN' ? (
        <Paper
          component="form"
          sx={{ p: 3 }}
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setError('');
              save.mutate({
                expectedVersion: t.version,
                communication: {
                  ...form,
                  channel: form.channel as (typeof channels)[number],
                  occurredAt: toInstant(form.occurredAt),
                },
                outcome: outcome as components['schemas']['FollowUpDto']['outcome'],
                nextDueAt: !done ? toInstant(next) : undefined,
                closeReason: done ? reason : undefined,
                firstEnrolledOn: outcome === 'ENROLLED' ? enrolled : undefined,
              });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Stack spacing={2}>
            <Typography variant="h6">Record follow-up</Typography>
            {(error || save.isError) && (
              <Alert severity="error">{error || save.error?.message}</Alert>
            )}
            <CommunicationFieldsForm value={form} set={setForm} />
            <TextField
              select
              required
              label="Outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              {FOLLOW_UP_OUTCOMES.map((o) => (
                <MenuItem key={o} value={o}>
                  {o === 'ENROLLED' ? 'Enrolled (manually confirmed)' : label(o)}
                </MenuItem>
              ))}
            </TextField>
            {done ? (
              <TextField
                label="Reason for closing"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            ) : (
              <TextField
                label="Next follow-up · Melbourne"
                type="datetime-local"
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
            {outcome === 'ENROLLED' && (
              <TextField
                label="First enrolment date"
                type="date"
                required
                disabled={Boolean(s.firstEnrolledOn)}
                value={enrolled}
                onChange={(e) => setEnrolled(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
            <Button
              type="submit"
              variant="contained"
              disabled={save.isPending || !outcome}
              sx={{ alignSelf: 'flex-start' }}
            >
              Save communication
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Paper
          component="form"
          sx={{ p: 3 }}
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setError('');
              reopen.mutate({ expectedVersion: t.version, reason, nextDueAt: toInstant(next) });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Stack spacing={2}>
            <Typography variant="h6">Reopen follow-up</Typography>
            {(error || reopen.isError) && (
              <Alert severity="error">{error || reopen.error?.message}</Alert>
            )}
            <TextField
              label="Reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            <TextField
              label="Next follow-up · Melbourne"
              type="datetime-local"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button type="submit" disabled={reopen.isPending} sx={{ alignSelf: 'flex-start' }}>
              Reopen task
            </Button>
          </Stack>
        </Paper>
      )}
      <Communications student={s} />
    </>
  );
}
function AiSuggestions({ task: t }: { task: Task }) {
  const { auth } = useAuth();
  const [channel, setChannel] = useState(
      t.student?.preferredChannel ||
        (t.student?.guardianEmail ? 'EMAIL' : t.student?.guardianPhone ? 'PHONE' : 'IN_PERSON'),
    ),
    [language, setLanguage] = useState(t.student?.preferredLanguage || 'en-AU');
  const [result, setResult] = useState<components['schemas']['SuggestionDto'] | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  const generation = useRef(0);
  const clear = () => {
    generation.current++;
    setResult(null);
    setPending(false);
    setError('');
    setCopied(false);
  };
  async function generate() {
    const current = ++generation.current;
    setPending(true);
    setError('');
    try {
      const { data, error } = await api.POST('/api/tasks/{id}/suggestions', {
        params: { path: { id: t.id } },
        headers: { 'x-csrf-token': auth?.csrfToken ?? '' },
        body: {
          channel: channel as (typeof channels)[number],
          language: language as SupportedLanguage,
        },
      });
      if (!data) throw apiError(error);
      if (generation.current === current) setResult(data);
    } catch (e) {
      if (generation.current === current) setError((e as Error).message);
    } finally {
      if (generation.current === current) setPending(false);
    }
  }
  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Follow-up assistance</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
          <TextField
            select
            label="Channel"
            value={channel}
            onChange={(e) => {
              clear();
              setChannel(e.target.value);
            }}
            sx={{ minWidth: 150 }}
          >
            {channels.map((c) => (
              <MenuItem key={c} value={c}>
                {label(c)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Language"
            value={language}
            onChange={(e) => {
              clear();
              setLanguage(e.target.value);
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="en-AU">English</MenuItem>
            <MenuItem value="zh-CN">中文</MenuItem>
          </TextField>
          <Button variant="outlined" onClick={() => void generate()} disabled={pending}>
            {pending ? 'Generating…' : 'Generate suggestions'}
          </Button>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {result && (
          <>
            <Typography variant="caption" color="text.secondary">
              {result.source === 'llm'
                ? 'Qwen suggestion · review before use'
                : 'Template · Qwen unavailable'}{' '}
              · {local(result.generatedAt).toFormat('HH:mm')}
            </Typography>
            <Typography>{result.summary}</Typography>
            {result.observations.map((o, i) => (
              <div key={i}>
                <Typography>{o.text}</Typography>
                {o.sourceIds.map((id) => (
                  <Typography key={id} variant="caption" color="text.secondary" display="block">
                    Source: {result.evidence.find((e) => e.id === id)?.text}
                  </Typography>
                ))}
              </div>
            ))}
            <Typography fontWeight={600}>{result.suggestedNextStep}</Typography>
            {result.questions.map((q) => (
              <Typography key={q}>• {q}</Typography>
            ))}
            <TextField
              label="Talking points"
              multiline
              value={result.talkingPoints.join('\n')}
              onChange={(e) => setResult({ ...result, talkingPoints: e.target.value.split('\n') })}
            />
            {result.subject !== null && (
              <TextField
                label="Email subject"
                value={result.subject}
                onChange={(e) => setResult({ ...result, subject: e.target.value })}
              />
            )}
            {result.messageDraft !== null && (
              <TextField
                label="Draft"
                multiline
                minRows={3}
                value={result.messageDraft}
                onChange={(e) => setResult({ ...result, messageDraft: e.target.value })}
              />
            )}
            <Button
              sx={{ alignSelf: 'flex-start' }}
              onClick={() =>
                void navigator.clipboard
                  .writeText(
                    [result.subject, result.messageDraft ?? result.talkingPoints.join('\n')]
                      .filter(Boolean)
                      .join('\n\n'),
                  )
                  .then(() => setCopied(true))
                  .catch(() => setError('Copy failed. Select and copy the text manually.'))
              }
            >
              {copied ? 'Copied' : 'Copy draft'}
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
