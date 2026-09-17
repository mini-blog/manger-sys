import {
  COMMUNICATION_CHANNELS,
  FOLLOWUP_REASON_TAGS,
  type FollowupReasonTag,
} from '@student/common';
import { Alert, Button, CircularProgress, MenuItem, Stack, TextField } from '@mui/material';
import { DateTime } from 'luxon';
import { ZONE } from '../lib/time';
export const channels = COMMUNICATION_CHANNELS;
export const label = (v: string) =>
  v
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
export const wall = (iso: string) =>
  DateTime.fromISO(iso).setZone(ZONE).toFormat("yyyy-MM-dd'T'HH:mm");
export function toInstant(value: string) {
  const date = DateTime.fromISO(value, { zone: ZONE });
  if (
    !date.isValid ||
    date.toFormat("yyyy-MM-dd'T'HH:mm") !== value ||
    date.getPossibleOffsets().length > 1
  )
    throw new Error('Choose a valid, unambiguous Melbourne time.');
  return date.toISO()!;
}
export function Status({
  query,
}: {
  query: { isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown };
}) {
  return query.isPending ? (
    <CircularProgress aria-label="Loading" />
  ) : query.isError ? (
    <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Retry</Button>}>
      {query.error?.message}
    </Alert>
  ) : null;
}
export type CommunicationFields = {
  guardianNameSnapshot: string;
  channel: string;
  content: string;
  occurredAt: string;
  concerns?: string;
  coreQuestion?: string;
  reasonTags?: FollowupReasonTag[];
};
export function CommunicationFieldsForm({
  value,
  set,
}: {
  value: CommunicationFields;
  set: (v: CommunicationFields) => void;
}) {
  return (
    <Stack spacing={2}>
      <TextField
        label="Contact name"
        required
        value={value.guardianNameSnapshot}
        onChange={(e) => set({ ...value, guardianNameSnapshot: e.target.value })}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
        <TextField
          select
          label="Channel"
          value={value.channel}
          onChange={(e) => set({ ...value, channel: e.target.value })}
          sx={{ minWidth: 160 }}
        >
          {channels.map((c) => (
            <MenuItem key={c} value={c}>
              {label(c)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Contact time · Melbourne"
          type="datetime-local"
          required
          value={value.occurredAt}
          onChange={(e) => set({ ...value, occurredAt: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
      </Stack>
      <TextField
        label="Actual communication"
        required
        multiline
        minRows={3}
        value={value.content}
        onChange={(e) => set({ ...value, content: e.target.value })}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
      />
      <TextField
        label="Concerns (optional)"
        multiline
        value={value.concerns ?? ''}
        onChange={(e) => set({ ...value, concerns: e.target.value })}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
      />
      <TextField
        label="Core question (optional)"
        multiline
        value={value.coreQuestion ?? ''}
        onChange={(e) => set({ ...value, coreQuestion: e.target.value })}
        slotProps={{ htmlInput: { maxLength: 1000 } }}
      />
      <TextField
        select
        label="Reasons (optional)"
        value={value.reasonTags ?? []}
        slotProps={{ select: { multiple: true } }}
        onChange={(e) =>
          set({
            ...value,
            reasonTags: (typeof e.target.value === 'string'
              ? e.target.value.split(',')
              : e.target.value) as FollowupReasonTag[],
          })
        }
      >
        {FOLLOWUP_REASON_TAGS.map((tag) => (
          <MenuItem value={tag} key={tag}>
            {label(tag)}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
