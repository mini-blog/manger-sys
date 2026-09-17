import { useQuery } from '@tanstack/react-query';
import { Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import type { ParticipantKind } from '@student/common';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import { contactIssue } from '../lib/booking';
import { Status } from './FormParts';

export function useBookingCredits(studentId: string | undefined) {
  const { auth } = useAuth();
  const profile = useQuery({
    queryKey: ['student', 'booking', auth?.user.id, studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students/{id}', {
        params: { path: { id: studentId! } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const credits = useQuery({
    queryKey: ['entitlements', 'booking', auth?.user.id, studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/students/{id}/entitlements', {
        params: { path: { id: studentId! } },
      });
      if (!data) throw apiError(error);
      return data;
    },
  });
  const issue = profile.data ? contactIssue(profile.data) : null;
  return {
    profile,
    credits,
    issue,
    ready: (kind: ParticipantKind, moving = false) =>
      profile.isSuccess &&
      credits.isSuccess &&
      !credits.isFetching &&
      !profile.isFetching &&
      !issue &&
      (kind !== 'REGULAR' || profile.data.type === 'MEMBER') &&
      credits.data.balances[kind].available + (moving ? 1 : 0) >= 1,
  };
}
export function BookingCredits({
  studentId,
  kind,
  context,
  returnTo,
  moving = false,
}: {
  studentId: string;
  kind: ParticipantKind;
  context: ReturnType<typeof useBookingCredits>;
  returnTo: string;
  moving?: boolean;
}) {
  const { profile, credits, issue } = context;
  const short = kind === 'TRIAL' ? 'trial' : 'regular';
  const insufficient = credits.data && credits.data.balances[kind].available + (moving ? 1 : 0) < 1;
  const purchaseRequired = kind === 'REGULAR' && profile.data?.type === 'TRIAL';
  return (
    <Stack spacing={0.5}>
      <Status query={profile} />
      <Status query={credits} />
      {credits.data && (
        <Stack direction="row" gap={2} flexWrap="wrap">
          {(['TRIAL', 'REGULAR'] as const).map((bucket) => (
            <Typography
              key={bucket}
              variant="body2"
              color={bucket === kind ? 'text.primary' : 'text.secondary'}
            >
              {bucket === 'TRIAL' ? 'Trial' : 'Regular'}: {credits.data.balances[bucket].available}{' '}
              available · {credits.data.balances[bucket].reserved} reserved
            </Typography>
          ))}
        </Stack>
      )}
      {moving && (
        <Typography variant="caption" color="text.secondary">
          The current reservation transfers with this booking.
        </Typography>
      )}
      {issue && (
        <Typography variant="body2" color="error">
          {issue}
        </Typography>
      )}
      {(insufficient || purchaseRequired) && (
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="body2" color="text.secondary">
            {purchaseRequired
              ? 'Record a regular card purchase first.'
              : `No ${short} credits available.`}
          </Typography>
          <Button
            component={Link}
            to={`/entitlements?${new URLSearchParams({ studentId, bucket: kind, action: 'grant', returnTo })}`}
          >
            Add {short} credits
          </Button>
        </Stack>
      )}
      <Button
        component={Link}
        to={`/students/${studentId}?${new URLSearchParams({ returnTo })}`}
        sx={{ alignSelf: 'flex-start' }}
      >
        {issue ? 'Complete contact details' : 'Student details'}
      </Button>
    </Stack>
  );
}
