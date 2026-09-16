import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowBack, ArrowForward } from '@mui/icons-material';
import { DateTime } from 'luxon';
import { useAuth } from '../auth';
import { useLessons } from '../hooks/useLessons';
import { currentWeek, local, ZONE, type Lesson } from '../lib/time';
import { PageHeader } from '../components/PageHeader';
import { QueryError } from '../components/QueryError';
import { Roster } from '../components/Roster';

export function Timetable() {
  const { auth } = useAuth();
  const [week, setWeek] = useState<DateTime>(currentWeek);
  const [course, setCourse] = useState('');
  const [group, setGroup] = useState('');
  const [teacher, setTeacher] = useState('');
  const [selected, setSelected] = useState<Lesson | null>(null);
  const changeWeek = (value: DateTime) => {
    setWeek(value);
    setCourse('');
    setGroup('');
    setTeacher('');
  };
  const query = useLessons(week.toISODate()!);
  const lessons = query.data ?? [];
  const filtered = lessons.filter(
    (l) =>
      (!course || l.courseName === course) &&
      (!group || l.classGroupId === group) &&
      (!teacher || l.teacherId === teacher),
  );
  const days = Array.from({ length: 7 }, (_, i) => week.plus({ days: i }));
  return (
    <>
      <PageHeader
        title={auth?.user.role === 'TEACHER' ? 'My timetable' : 'Weekly timetable'}
        description="Find the right class. See who is teaching, who is joining and where there is room."
      />
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ sm: 'center' }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton
              aria-label="Previous week"
              onClick={() => changeWeek(week.minus({ weeks: 1 }))}
            >
              <ArrowBack fontSize="small" />
            </IconButton>
            <Typography fontWeight={600}>
              {week.toFormat('d LLL')} – {week.plus({ days: 6 }).toFormat('d LLL yyyy')}
            </Typography>
            <IconButton aria-label="Next week" onClick={() => changeWeek(week.plus({ weeks: 1 }))}>
              <ArrowForward fontSize="small" />
            </IconButton>
            <Button onClick={() => changeWeek(currentWeek())}>This week</Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {filtered.length} lessons · Australia/Melbourne
          </Typography>
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            label="Subject"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            sx={{ minWidth: 175 }}
          >
            <MenuItem value="">All subjects</MenuItem>
            {[...new Set(lessons.map((l) => l.courseName))].map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Class"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            sx={{ minWidth: 210 }}
          >
            <MenuItem value="">All classes</MenuItem>
            {[...new Map(lessons.map((l) => [l.classGroupId, l.className])).entries()].map(
              ([id, name]) => (
                <MenuItem key={id} value={id}>
                  {name}
                </MenuItem>
              ),
            )}
          </TextField>
          {auth?.user.role === 'ADMIN' && (
            <TextField
              select
              label="Teacher"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">All teachers</MenuItem>
              {[...new Map(lessons.map((l) => [l.teacherId, l.teacherName])).entries()].map(
                ([id, name]) => (
                  <MenuItem key={id} value={id}>
                    {name}
                  </MenuItem>
                ),
              )}
            </TextField>
          )}
          <Button
            onClick={() => {
              setCourse('');
              setGroup('');
              setTeacher('');
            }}
          >
            Clear filters
          </Button>
        </Stack>
      </Paper>
      {query.isPending ? (
        <Skeleton variant="rounded" height={460} />
      ) : query.isError ? (
        <QueryError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Chip
              size="small"
              label="Trial student"
              sx={{ bgcolor: '#fff1d7', color: '#885918' }}
            />
            <Chip size="small" label="New to class" sx={{ bgcolor: '#eaf1e9', color: '#225e4e' }} />
            <Typography variant="body2" color="text.secondary">
              Select a lesson to view its class list.
            </Typography>
          </Stack>
          {filtered.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              No lessons match this week and these filters.
            </Alert>
          )}
          <Box sx={{ overflowX: 'auto', pb: 2 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(155px, 1fr))',
                gap: 1.5,
                minWidth: 1160,
              }}
            >
              {days.map((day) => {
                const dayLessons = filtered.filter(
                  (l) => local(l.startsAt).toISODate() === day.toISODate(),
                );
                const today = day.hasSame(DateTime.now().setZone(ZONE), 'day');
                return (
                  <Box key={day.toISODate()}>
                    <Box
                      sx={{
                        px: 1.5,
                        py: 1.5,
                        mb: 1.5,
                        borderRadius: 2,
                        bgcolor: today ? '#225e4e' : '#e9ede6',
                        color: today ? '#fff' : 'text.primary',
                      }}
                    >
                      <Typography variant="caption">{day.toFormat('cccc')}</Typography>
                      <Typography fontWeight={600}>{day.toFormat('d LLL')}</Typography>
                    </Box>
                    <Stack spacing={1.5}>
                      {dayLessons.map((l) => (
                        <Paper
                          component="button"
                          key={l.id}
                          onClick={() => setSelected(l)}
                          sx={{
                            p: 1.5,
                            textAlign: 'left',
                            font: 'inherit',
                            cursor: 'pointer',
                            width: '100%',
                            borderLeft: `3px solid ${l.courseName === 'English' ? '#b182ab' : l.courseName === 'Science' ? '#b2a64d' : '#4d8b76'}`,
                            '&:hover': { bgcolor: '#f0f5ee', borderColor: '#6a8c7b' },
                            '&:focus-visible': { outline: '3px solid #225e4e', outlineOffset: 2 },
                          }}
                        >
                          <Typography variant="caption" fontWeight={600} color="text.secondary">
                            {local(l.startsAt).toFormat('HH:mm')} –{' '}
                            {local(l.endsAt).toFormat('HH:mm')}
                          </Typography>
                          <Typography fontWeight={650} sx={{ mt: 1 }}>
                            {l.courseName}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                            {l.className}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {l.teacherName}
                          </Typography>
                          <Divider sx={{ my: 1 }} />
                          <Typography
                            variant="caption"
                            color={
                              l.participantCount >= l.capacity ? 'secondary.main' : 'text.secondary'
                            }
                          >
                            {l.participantCount}/{l.capacity} booked
                            {l.participantCount >= l.capacity ? ' · Full' : ''}
                          </Typography>
                          <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1 }}>
                            {l.trialCount > 0 && (
                              <Chip
                                size="small"
                                label={`${l.trialCount} trial`}
                                sx={{
                                  fontSize: 11,
                                  height: 22,
                                  bgcolor: '#fff1d7',
                                  color: '#885918',
                                }}
                              />
                            )}
                            {l.newCount > 0 && (
                              <Chip
                                size="small"
                                label={`${l.newCount} new`}
                                sx={{
                                  fontSize: 11,
                                  height: 22,
                                  bgcolor: '#eaf1e9',
                                  color: '#225e4e',
                                }}
                              />
                            )}
                            {l.status === 'CANCELLED' && <Chip size="small" label="Cancelled" />}
                          </Stack>
                        </Paper>
                      ))}
                      {!dayLessons.length && (
                        <Typography variant="caption" color="text.secondary" sx={{ p: 2 }}>
                          No lessons
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </>
      )}
      <Roster lesson={selected} close={() => setSelected(null)} />
    </>
  );
}
