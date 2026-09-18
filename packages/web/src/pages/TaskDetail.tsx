import { FOLLOWUP_REASON_TAGS, type FollowupReasonTag } from '@student/common';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, apiError } from '../api/client';
import type { components } from '@student/common/api';
import { useWrite } from '../hooks/useWrite';
import { channels, label, Status, toInstant, wall } from '../components/FormParts';
import { RichText, RichView } from '../components/RichText';
import { ScoreField } from '../components/ScoreField';
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
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4">{t.studentName}</Typography>
            <Chip label={label(t.status)} size="small" />
          </Stack>
          <Typography color="text.secondary">
            {t.className} · {t.courseName} · {local(t.startsAt).toFormat('ccc d LLL yyyy, HH:mm')} ·{' '}
            {t.teacherName}
          </Typography>
          {t.type === 'STUDENT_AI_REPORT' ? (
            <Report key={t.id} task={t} />
          ) : t.type === 'TRIAL_FEEDBACK' ? (
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
  const [performance, setPerformance] = useState<number | null>(p.classroomPerformanceRating);
  const [ability, setAbility] = useState<number | null>(p.overallAbilityRating);
  const [note, setNote] = useState(p.teacherNoteHtml ?? '');
  const [expectedVersion, setVersion] = useState(p.version);
  const save = useWrite('post', '/api/participants/{id}/feedback', { id: p.participantId });
  const closed = t.status !== 'OPEN' || save.isSuccess;
  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Basic information</Typography>
        <RichView html={t.student?.backgroundHtml} />
        <Typography variant="h6">Student evaluation</Typography>
        {save.isError && (
          <Alert
            severity="error"
            action={
              <Button
                onClick={async () => {
                  const fresh = await reload();
                  if (fresh?.status === 'OPEN') {
                    setVersion(fresh.participant!.version);
                    save.reset();
                  }
                }}
              >
                Refresh
              </Button>
            }
          >
            {save.error.message}
          </Alert>
        )}
        <ScoreField
          label="Classroom performance"
          value={closed ? (p.classroomPerformanceRating ?? performance) : performance}
          onChange={setPerformance}
          readOnly={closed}
        />
        <ScoreField
          label="Overall ability"
          value={closed ? (p.overallAbilityRating ?? ability) : ability}
          onChange={setAbility}
          readOnly={closed}
        />
        {closed ? (
          <>
            <RichView html={p.teacherNoteHtml ?? note} />
            <Typography>{label(t.status === 'CANCELLED' ? 'CANCELLED' : 'SUBMITTED')}</Typography>
          </>
        ) : (
          <>
            <RichText
              label="Teacher note (optional)"
              value={note}
              onChange={setNote}
              disabled={save.isPending}
            />
            <Button
              variant="contained"
              sx={{ alignSelf: 'flex-start' }}
              disabled={save.isPending || performance == null || ability == null}
              onClick={() =>
                save.mutate({
                  expectedVersion,
                  classroomPerformanceRating: performance!,
                  overallAbilityRating: ability!,
                  teacherNoteHtml: note,
                })
              }
            >
              Submit evaluation
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
function FollowUp({ task: t, reload }: { task: Task; reload: () => Promise<Task | undefined> }) {
  const s = t.student!,
    p = t.participant!;
  const [outcome, setOutcome] = useState<'' | 'PURCHASED' | 'NOT_PURCHASED'>('');
  const [purchasedNote, setPurchasedNote] = useState('');
  const [notPurchasedNote, setNotPurchasedNote] = useState('');
  const [intent, setIntent] = useState<number | null>(null);
  const [reasons, setReasons] = useState<FollowupReasonTag[]>([]);
  const [channel, setChannel] = useState(
    s.preferredChannel || (s.guardianEmail ? 'EMAIL' : 'IN_PERSON'),
  );
  const [occurredAt, setOccurredAt] = useState(wall(new Date().toISOString()));
  const [expectedVersion, setVersion] = useState(t.version);
  const [error, setError] = useState('');
  const save = useWrite('post', '/api/tasks/{id}/follow-up', { id: t.id });
  const closed = t.status !== 'OPEN' || save.isSuccess;
  const unreachable = reasons.includes('UNREACHABLE');
  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Stack direction="row">
            <Button component={Link} to={`/students/${s.id}`}>
              Student profile
            </Button>
            <Button
              component={Link}
              to={`/entitlements?studentId=${s.id}&action=grant&returnTo=/tasks/${t.id}`}
            >
              Record formal credits
            </Button>
          </Stack>
          <Typography>
            {s.guardianName} · {s.guardianRelationship} ·{' '}
            {[s.guardianPhone, s.guardianEmail].filter(Boolean).join(' · ')}
          </Typography>
          <Typography fontWeight={600}>Basic information</Typography>
          <RichView html={s.backgroundHtml} />
          <Typography fontWeight={600}>Admin notes</Typography>
          <RichView html={s.adminNotesHtml} />
          <Typography fontWeight={600}>Teacher evaluation</Typography>
          <ScoreField label="Classroom performance" value={p.classroomPerformanceRating} readOnly />
          <ScoreField label="Overall ability" value={p.overallAbilityRating} readOnly />
          <RichView html={p.teacherNoteHtml} />
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">
            {closed ? 'Follow-up completed' : 'Record follow-up'}
          </Typography>
          {(error || save.isError) && (
            <Alert
              severity="error"
              action={
                <Button
                  onClick={async () => {
                    const fresh = await reload();
                    if (fresh?.status === 'OPEN') {
                      setVersion(fresh.version);
                      save.reset();
                      setError('');
                    }
                  }}
                >
                  Refresh
                </Button>
              }
            >
              {error || save.error?.message}
            </Alert>
          )}
          {closed ? (
            <>
              <Typography>{label(t.followupOutcome ?? outcome)}</Typography>
              {t.communications?.map((c) => (
                <Stack key={c.id}>
                  <Typography variant="body2">
                    {local(c.occurredAt).toFormat('d LLL HH:mm')} · {label(c.channel)}
                  </Typography>
                  {c.purchaseIntentRating != null && (
                    <ScoreField label="Purchase intent" value={c.purchaseIntentRating} readOnly />
                  )}
                  <Typography>{c.notPurchasedReasons.map(label).join(' · ')}</Typography>
                  <RichView html={c.noteHtml} />
                </Stack>
              ))}
            </>
          ) : (
            <>
              <TextField
                select
                label="Membership purchased?"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as typeof outcome)}
              >
                <MenuItem value="PURCHASED">Purchased</MenuItem>
                <MenuItem value="NOT_PURCHASED">Not purchased</MenuItem>
              </TextField>
              {outcome === 'PURCHASED' && (
                <>
                  <Typography color={s.type === 'MEMBER' ? 'success.main' : 'error'}>
                    {s.type === 'MEMBER'
                      ? 'Formal purchase recorded · verified again on save'
                      : 'Record formal credits first'}
                  </Typography>
                  <RichText
                    label="Note (optional)"
                    value={purchasedNote}
                    onChange={setPurchasedNote}
                  />
                </>
              )}
              {outcome === 'NOT_PURCHASED' && (
                <>
                  <TextField
                    select
                    label="Reasons"
                    value={reasons}
                    slotProps={{ select: { multiple: true } }}
                    onChange={(e) => {
                      const list = (
                        typeof e.target.value === 'string'
                          ? e.target.value.split(',')
                          : e.target.value
                      ) as FollowupReasonTag[];
                      const next: FollowupReasonTag[] =
                        list.includes('UNREACHABLE') && !unreachable
                          ? ['UNREACHABLE']
                          : list.filter((r) => r !== 'UNREACHABLE');
                      setReasons(next);
                      if (next.includes('UNREACHABLE')) setIntent(null);
                    }}
                  >
                    {FOLLOWUP_REASON_TAGS.map((r) => (
                      <MenuItem key={r} value={r}>
                        {label(r)}
                      </MenuItem>
                    ))}
                  </TextField>
                  {!unreachable && (
                    <ScoreField label="Purchase intent" value={intent} onChange={setIntent} />
                  )}
                  <RichText
                    label={
                      unreachable ? 'Contact attempt details' : 'Reason and communication note'
                    }
                    value={notPurchasedNote}
                    onChange={setNotPurchasedNote}
                  />
                </>
              )}
              {outcome && (
                <details>
                  <summary>Contact details · {label(channel)} · Melbourne time</summary>
                  <Stack direction="row" gap={2} sx={{ mt: 1 }}>
                    <TextField
                      select
                      label="Channel"
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                      sx={{ minWidth: 150 }}
                    >
                      {channels.map((c) => (
                        <MenuItem key={c} value={c}>
                          {label(c)}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      type="datetime-local"
                      label="Contact / attempt time"
                      slotProps={{ inputLabel: { shrink: true } }}
                      value={occurredAt}
                      onChange={(e) => setOccurredAt(e.target.value)}
                    />
                  </Stack>
                </details>
              )}
              <Button
                variant="contained"
                sx={{ alignSelf: 'flex-start' }}
                disabled={
                  save.isPending ||
                  !outcome ||
                  (outcome === 'NOT_PURCHASED' &&
                    (!reasons.length || (!unreachable && intent == null)))
                }
                onClick={() => {
                  try {
                    setError('');
                    save.mutate({
                      expectedVersion,
                      outcome: outcome as 'PURCHASED' | 'NOT_PURCHASED',
                      communication: {
                        guardianNameSnapshot: s.guardianName ?? '',
                        relationshipSnapshot: s.guardianRelationship,
                        channel: channel as (typeof channels)[number],
                        occurredAt: toInstant(occurredAt),
                        noteHtml: outcome === 'PURCHASED' ? purchasedNote : notPurchasedNote,
                        ...(outcome === 'NOT_PURCHASED'
                          ? {
                              purchaseIntentRating: unreachable ? null : intent,
                              notPurchasedReasons: reasons,
                            }
                          : {}),
                      },
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Complete follow-up
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
function Report({ task: t }: { task: Task }) {
  const query = useQuery({
    queryKey: ['report', t.id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/tasks/{id}/report', {
        params: { path: { id: t.id } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const refreshReport = async () => {
    await query.refetch();
  };
  const generate = useWrite(
    'post',
    '/api/tasks/{id}/report/generate',
    { id: t.id },
    undefined,
    refreshReport,
  );
  const complete = useWrite(
    'post',
    '/api/tasks/{id}/report/complete',
    { id: t.id },
    undefined,
    refreshReport,
  );
  const r = query.data;
  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Student report</Typography>
        <Status query={query} />
        {(generate.isError || complete.isError) && (
          <Alert severity="error">{generate.error?.message || complete.error?.message}</Alert>
        )}
        {r && (
          <>
            <Button
              component={Link}
              to={`/tasks/${r.sourceFollowupTaskId}`}
              sx={{ alignSelf: 'flex-start' }}
            >
              Source follow-up
            </Button>
            <Typography>
              {label(r.generationStatus)}
              {r.generatedAt
                ? ` · ${local(r.generatedAt).toFormat('d LLL yyyy HH:mm')} · ${r.model ?? ''}`
                : ''}
            </Typography>
            {r.source === 'fixture' && (
              <Alert severity="info">Test fixture — not a real AI result</Alert>
            )}
            {r.stale && (
              <Alert severity="warning">
                Source information changed. Generate a new report before marking it read.
              </Alert>
            )}
            {r.generationStatus === 'FAILED' && (
              <Alert severity="warning">
                {r.lastErrorCode === 'AI_NOT_CONFIGURED'
                  ? 'Qwen is not configured. The follow-up remains saved.'
                  : 'Report generation failed. You can retry.'}
              </Alert>
            )}
            {r.content && <ReportContent content={r.content} />}
            {r.evidenceSnapshot && (
              <details>
                <summary>Evidence used</summary>
                <StructuredValue value={r.evidenceSnapshot} />
              </details>
            )}
            {t.status === 'OPEN' && (
              <Stack direction="row" gap={1}>
                <Button
                  variant="outlined"
                  disabled={generate.isPending || complete.isPending}
                  onClick={() => generate.mutate({ expectedVersion: r.version })}
                >
                  {generate.isPending
                    ? 'Generating…'
                    : r.generationStatus === 'NOT_STARTED'
                      ? 'Generate report'
                      : 'Regenerate report'}
                </Button>
                <Button
                  variant="contained"
                  disabled={
                    generate.isPending ||
                    complete.isPending ||
                    r.generationStatus !== 'READY' ||
                    r.stale
                  }
                  onClick={() => complete.mutate({ expectedVersion: r.version })}
                >
                  Mark as read
                </Button>
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
function ReportContent({ content }: { content: Record<string, unknown> }) {
  const names: Record<string, string> = {
    overview: 'Overview',
    learningProfile: 'Learning profile',
    teacherEvaluation: 'Teacher evaluation',
    followup: 'Follow-up',
    observations: 'Evidence-based observations',
    questionsToConfirm: 'Questions to confirm',
    suggestedNextActions: 'Suggested next actions',
  };
  return (
    <Stack spacing={2}>
      {Object.entries(content).map(([key, value]) => (
        <div key={key}>
          <Typography fontWeight={600}>{names[key] ?? key}</Typography>
          <StructuredValue value={value} />
        </div>
      ))}
    </Stack>
  );
}
function StructuredValue({ value }: { value: unknown }) {
  if (value == null) return <Typography color="text.secondary">Not recorded</Typography>;
  if (Array.isArray(value))
    return (
      <ul>
        {value.map((v, i) => (
          <li key={i}>
            <StructuredValue value={v} />
          </li>
        ))}
      </ul>
    );
  if (typeof value === 'object')
    return (
      <Stack spacing={0.5}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <Typography variant="caption" color="text.secondary">
              {k.replace(/([A-Z])/g, ' $1')}
            </Typography>
            <StructuredValue value={v} />
          </div>
        ))}
      </Stack>
    );
  return (
    <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {String(value)}
    </Typography>
  );
}
