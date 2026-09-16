import { useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Skeleton, Stack, Typography } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLessons } from '../hooks/useLessons';
import { currentWeek, local, type Lesson } from '../lib/time';
import { PageHeader } from '../components/PageHeader';
import { Metrics } from '../components/Metrics';
import { QueryError } from '../components/QueryError';
import { Roster } from '../components/Roster';

export function Overview() {
  const { auth } = useAuth();
  const query = useLessons(currentWeek().toISODate()!);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const upcoming = (query.data ?? [])
    .filter((l) => l.status !== 'CANCELLED' && Date.parse(l.startsAt) > Date.now())
    .slice(0, 5);
  return (
    <>
      <PageHeader
        title={`Hello, ${auth?.user.name.split(' ')[0]}.`}
        description={
          auth?.user.role === 'ADMIN'
            ? 'Your teaching week, with every trial student in view.'
            : 'Your classes and the students joining you this week.'
        }
      />
      <Alert severity="info" sx={{ mb: 3 }}>
        Timetable preview: view lessons and class lists. Booking, feedback and follow-up actions are
        not available yet.
      </Alert>
      {query.isPending ? (
        <Skeleton height={140} />
      ) : query.isError ? (
        <QueryError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <Metrics lessons={query.data ?? []} />
          <Paper sx={{ p: 3 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 2 }}
            >
              <Typography variant="h6">Coming up this week</Typography>
              <Button component={Link} to="/timetable" endIcon={<ArrowForward />}>
                Open timetable
              </Button>
            </Stack>
            {upcoming.length ? (
              upcoming.map((l) => (
                <Box
                  key={l.id}
                  sx={{
                    py: 2,
                    borderTop: '1px solid #edf0eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 2,
                    alignItems: 'center',
                  }}
                >
                  <Box>
                    <Typography fontWeight={600}>
                      {l.courseName} · {l.className}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {local(l.startsAt).toFormat('ccc d LLL, HH:mm')} —{' '}
                      {local(l.endsAt).toFormat('HH:mm')} · {l.teacherName}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {l.trialCount > 0 && (
                      <Chip
                        size="small"
                        label={`${l.trialCount} trial`}
                        sx={{ bgcolor: '#fff1d7', color: '#885918' }}
                      />
                    )}
                    <Button onClick={() => setSelected(l)}>Class list</Button>
                  </Stack>
                </Box>
              ))
            ) : (
              <Typography color="text.secondary" sx={{ py: 3 }}>
                No more lessons scheduled this week. Browse the timetable for other dates.
              </Typography>
            )}
          </Paper>
        </>
      )}
      <Roster lesson={selected} close={() => setSelected(null)} />
    </>
  );
}
