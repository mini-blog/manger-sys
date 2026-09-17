import { MANUAL_FOLLOWUP_OUTCOMES, type ManualFollowupOutcome } from '@student/common';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, apiError } from '../api/client';
import type { components } from '@student/common/api';
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
type Task = components['schemas']['TaskDetailDto'];
export function TaskDetail() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['task', id],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/tasks/{id}', { params: { path: { id } } });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const t = query.data;
  return (
    <Stack spacing={2} sx={{ maxWidth: 920 }}>
      <Button component={Link} to="/" sx={{ alignSelf: 'flex-start' }}>
        ← My tasks
      </Button>
      <Status query={query} />
      {t && (
        <>
          <Stack direction="row" gap={1} alignItems="center">
            <Typography variant="h4" component="h1">
              {t.studentName}
            </Typography>
            <Chip label={label(t.status)} size="small" />
            <Chip
              label={label(t.membershipCategory ?? 'TRIAL_STUDENT')}
              size="small"
              variant="outlined"
            />
          </Stack>
          <Typography color="text.secondary">
            {t.className} · {t.courseName} · {local(t.startsAt).toFormat('ccc d LLL yyyy, HH:mm')} ·{' '}
            {t.teacherName}
          </Typography>
          {t.checkedInAt && (
            <Typography variant="body2">
              Checked in {local(t.checkedInAt).toFormat('d LLL, HH:mm')}
            </Typography>
          )}
          {t.type === 'TRIAL_FEEDBACK' ? (
            <Evaluation key={t.id} task={t} reload={async () => (await query.refetch()).data} />
          ) : (
            <FollowUp key={t.id} task={t} reload={async () => (await query.refetch()).data} />
          )}
        </>
      )}
    </Stack>
  );
}
function Evaluation({ task: t, reload }: { task: Task; reload: () => Promise<Task | undefined> }) {
  const p = t.participant!;
  const [feedback, setFeedback] = useState(p.feedback ?? '');
  const [abilityNote, setAbility] = useState(p.abilityNote ?? '');
  const [preferenceNote, setPreference] = useState(p.preferenceNote ?? '');
  // Preserve the version belonging to this draft; a background refresh must not silently overwrite it.
  const [expectedVersion, setExpectedVersion] = useState(p.version);
  const [startedOpen] = useState(t.status === 'OPEN');
  const save = useWrite('post', '/api/participants/{id}/feedback', { id: p.participantId });
  if (t.status !== 'OPEN' || save.isSuccess)
    return (
      <Paper sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="h6">
            {t.status === 'CANCELLED' ? 'Evaluation cancelled' : 'Evaluation submitted'}
          </Typography>
          {startedOpen && !save.isSuccess && !!feedback && (
            <Alert severity="warning">
              This task changed. Your unsaved draft: {feedback} · {abilityNote} · {preferenceNote}
            </Alert>
          )}
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{p.feedback ?? feedback}</Typography>
          {(p.abilityNote || abilityNote) && (
            <Typography>Ability: {p.abilityNote || abilityNote}</Typography>
          )}
          {(p.preferenceNote || preferenceNote) && (
            <Typography>Preferences: {p.preferenceNote || preferenceNote}</Typography>
          )}
          {t.completedAt && (
            <Typography variant="body2">
              {local(t.completedAt).toFormat('d LLL yyyy, HH:mm')}
            </Typography>
          )}
        </Stack>
      </Paper>
    );
  return (
    <Paper
      component="form"
      sx={{ p: 2 }}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ expectedVersion, feedback, abilityNote, preferenceNote });
      }}
    >
      <Stack spacing={2}>
        <Typography variant="h6">Student evaluation</Typography>
        {save.isError && (
          <Alert
            severity="error"
            action={
              <Button
                onClick={async () => {
                  const latest = await reload();
                  if (latest?.status === 'OPEN' && latest.participant) {
                    setExpectedVersion(latest.participant.version);
                    save.reset();
                  }
                }}
              >
                Refresh task
              </Button>
            }
          >
            {save.error.message}
          </Alert>
        )}
        <TextField
          label="Evaluation"
          required
          multiline
          minRows={4}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
        />
        <TextField
          label="Ability (optional)"
          multiline
          value={abilityNote}
          onChange={(e) => setAbility(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
        />
        <TextField
          label="Preferences (optional)"
          multiline
          value={preferenceNote}
          onChange={(e) => setPreference(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={save.isPending || !feedback.trim()}
          sx={{ alignSelf: 'flex-start' }}
        >
          Submit evaluation
        </Button>
      </Stack>
    </Paper>
  );
}
function FollowUp({ task: t, reload }: { task: Task; reload: () => Promise<Task | undefined> }) {
  const s = t.student!;
  const [form, setForm] = useState<CommunicationFields>({
    guardianNameSnapshot: s.guardianName ?? '',
    channel:
      s.preferredChannel || (s.guardianEmail ? 'EMAIL' : s.guardianPhone ? 'PHONE' : 'IN_PERSON'),
    content: '',
    occurredAt: wall(new Date().toISOString()),
  });
  const [outcome, setOutcome] = useState<ManualFollowupOutcome | ''>('');
  const [expectedVersion, setExpectedVersion] = useState(t.version);
  const [startedOpen] = useState(t.status === 'OPEN');
  const [error, setError] = useState('');
  const save = useWrite('post', '/api/tasks/{id}/follow-up', { id: t.id });
  return (
    <>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Stack direction="row" gap={1}>
            <Button component={Link} to={`/students/${s.id}`}>
              Student profile / communication history
            </Button>
            <Button component={Link} to={`/entitlements?studentId=${s.id}`}>
              Lesson credits
            </Button>
          </Stack>
          <Typography>
            {s.guardianName} · {s.guardianRelationship}
          </Typography>
          <Typography color="text.secondary">
            {[s.guardianPhone, s.guardianEmail, s.guardianWechat].filter(Boolean).join(' · ')}
          </Typography>
          <Typography fontWeight={600}>Teacher feedback</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>
            {t.sourceSnapshot.feedback || t.participant?.feedback || 'No evaluation recorded.'}
          </Typography>
          {t.participant?.abilityNote && (
            <Typography>Ability: {t.participant.abilityNote}</Typography>
          )}
          {t.participant?.preferenceNote && (
            <Typography>Preferences: {t.participant.preferenceNote}</Typography>
          )}
        </Stack>
      </Paper>
      {t.status === 'OPEN' && !save.isSuccess ? (
        <Paper
          component="form"
          sx={{ p: 2 }}
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            try {
              save.mutate({
                expectedVersion,
                communication: {
                  ...form,
                  channel: form.channel as (typeof channels)[number],
                  occurredAt: toInstant(form.occurredAt),
                },
                outcome: outcome as ManualFollowupOutcome,
              });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Stack spacing={2}>
            <Typography variant="h6">Record follow-up</Typography>
            {(error || save.isError) && (
              <Alert
                severity="error"
                action={
                  <Button
                    onClick={async () => {
                      const latest = await reload();
                      if (latest?.status === 'OPEN') {
                        setExpectedVersion(latest.version);
                        save.reset();
                        setError('');
                      }
                    }}
                  >
                    Refresh task
                  </Button>
                }
              >
                {error || save.error?.message}
              </Alert>
            )}
            <TextField
              select
              required
              label="Outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as ManualFollowupOutcome)}
            >
              {MANUAL_FOLLOWUP_OUTCOMES.map((o) => (
                <MenuItem key={o} value={o}>
                  {label(o)}
                </MenuItem>
              ))}
            </TextField>
            {outcome === 'UNREACHABLE' && (
              <Typography variant="body2">
                Record when and how you tried to contact the family.
              </Typography>
            )}
            {outcome === 'NOT_INTERESTED' && (
              <Typography variant="body2">
                Include the reason in the communication or concerns.
              </Typography>
            )}
            <CommunicationFieldsForm value={form} set={setForm} />
            <Button
              type="submit"
              variant="contained"
              disabled={save.isPending || !outcome || !form.content.trim()}
              sx={{ alignSelf: 'flex-start' }}
            >
              Complete follow-up
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography variant="h6">
              {t.status === 'CANCELLED' ? 'Follow-up cancelled' : 'Follow-up completed'}
            </Typography>
            {startedOpen && !save.isSuccess && !!form.content && (
              <Alert severity="warning">
                This task changed. Your unsaved draft: {form.content} · {form.concerns} ·{' '}
                {form.coreQuestion} · {label(outcome)}
              </Alert>
            )}
            <Typography>{label(t.followupOutcome ?? outcome)}</Typography>
            {t.completedAt && (
              <Typography>{local(t.completedAt).toFormat('d LLL yyyy, HH:mm')}</Typography>
            )}
            {t.resolvedByEntitlementEntryId && (
              <Typography variant="body2">
                Purchase record: {t.resolvedByEntitlementEntryId}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}
      {!!t.communications?.length && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h6">This follow-up</Typography>
            {t.communications.map((c) => (
              <Stack key={c.id} spacing={0.5}>
                <Typography variant="body2">
                  {local(c.occurredAt).toFormat('d LLL yyyy, HH:mm')} · {label(c.channel)} ·{' '}
                  {c.authorName}
                </Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{c.content}</Typography>
                {c.concerns && <Typography>Concerns: {c.concerns}</Typography>}
                {c.coreQuestion && <Typography>Core question: {c.coreQuestion}</Typography>}
                {!!c.reasonTags.length && (
                  <Typography variant="body2">{c.reasonTags.map(label).join(' · ')}</Typography>
                )}
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
    </>
  );
}
