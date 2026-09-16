import { Box, Paper, Stack, Typography } from '@mui/material';
import { CalendarMonthOutlined, SchoolOutlined, GroupsOutlined } from '@mui/icons-material';
import type { Lesson } from '../lib/time';

export function Metrics({ lessons }: { lessons: Lesson[] }) {
  const scheduled = lessons.filter((l) => l.status !== 'CANCELLED');
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
        gap: 2,
        mb: 3,
      }}
    >
      {[
        ['Lessons this week', scheduled.length, <CalendarMonthOutlined key="lessons" />],
        [
          'Trial bookings',
          scheduled.reduce((n, l) => n + l.trialCount, 0),
          <SchoolOutlined key="trials" />,
        ],
        [
          'Available places',
          scheduled.reduce((n, l) => n + l.capacity - l.participantCount, 0),
          <GroupsOutlined key="places" />,
        ],
      ].map(([label, value, icon]) => (
        <Paper key={String(label)} sx={{ p: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography color="text.secondary" variant="body2">
              {label}
            </Typography>
            <Box sx={{ color: 'primary.main' }}>{icon}</Box>
          </Stack>
          <Typography variant="h4" sx={{ mt: 1 }}>
            {value}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}
