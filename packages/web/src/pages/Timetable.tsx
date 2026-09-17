import { useSearchParams } from 'react-router-dom';
import { SessionEditor } from '../components/SessionEditor';
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { DateTime } from 'luxon';
import { useAuth } from '../auth';
import { useLessons } from '../hooks/useLessons';
import { currentWeek, local, ZONE } from '../lib/time';
import { QueryError } from '../components/QueryError';
import { Roster } from '../components/Roster';

export function Timetable() {
  const { auth } = useAuth();
  const admin = auth?.user.role === 'ADMIN';
  const [params, setParams] = useSearchParams();
  const hasLegacySource = params.has('sourceRebookingTaskId');
  const initialWeek = DateTime.fromISO(params.get('week') ?? '', { zone: ZONE });
  const [week, setWeek] = useState<DateTime>(
    initialWeek.isValid ? initialWeek.startOf('week') : currentWeek(),
  );
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [course, setCourse] = useState(params.get('course') ?? '');
  const [group, setGroup] = useState(params.get('group') ?? '');
  const [teacher, setTeacher] = useState(params.get('teacher') ?? '');
  const [view, setView] = useState<'week' | 'list'>(
    params.get('view') === 'list' ? 'list' : 'week',
  );
  const selectLesson = (id: string | null) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (id) next.set('lesson', id);
        else next.delete('lesson');
        return next;
      },
      { replace: true },
    );
  const changeWeek = (value: DateTime) => {
    setWeek(value);
    setCourse('');
    setGroup('');
    setTeacher('');
    selectLesson(null);
  };
  useEffect(() => {
    setParams(
      (previous) => {
        const p = new URLSearchParams(previous);
        p.delete('sourceRebookingTaskId');
        for (const [k, v] of Object.entries({
          week: week.toISODate()!,
          q: search,
          course,
          group,
          teacher,
          view,
        })) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );
  }, [week, search, course, group, teacher, view, hasLegacySource, setParams]);
  const query = useLessons(week.toISODate()!, search);
  const lessons = query.data ?? [];
  const selected = lessons.find((lesson) => lesson.id === params.get('lesson')) ?? null;
  const classes = [...new Map(lessons.map((l) => [l.classGroupId, l.className])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1], 'en-AU', { numeric: true }),
  );
  const filtered = lessons.filter(
    (l) =>
      (!course || l.courseName === course) &&
      (!group || l.classGroupId === group) &&
      (!teacher || l.teacherId === teacher),
  );
  const days = Array.from({ length: 7 }, (_, i) => week.plus({ days: i }));
  const hasFilters = Boolean(course || group || teacher || search);
  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 3 }}>
        <Typography component="h1" variant="h4">
          {admin ? 'Class timetable' : 'My lessons'}
        </Typography>
        <Stack direction="row" gap={2} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Melbourne time
          </Typography>
          {admin && (
            <Button variant="contained" onClick={() => setCreating(true)}>
              Schedule lesson
            </Button>
          )}
        </Stack>
      </Stack>
      <Stack spacing={2} sx={{ mb: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          gap={2}
          justifyContent="space-between"
          alignItems={{ sm: 'center' }}
        >
          <Stack direction="row" spacing={0.5} alignItems="center">
            <IconButton
              aria-label="Previous week"
              onClick={() => changeWeek(week.minus({ weeks: 1 }))}
            >
              <ChevronLeft />
            </IconButton>
            <Typography fontWeight={600} sx={{ minWidth: 210, textAlign: 'center' }}>
              {week.toFormat('d LLL')} – {week.plus({ days: 6 }).toFormat('d LLL yyyy')}
            </Typography>
            <IconButton aria-label="Next week" onClick={() => changeWeek(week.plus({ weeks: 1 }))}>
              <ChevronRight />
            </IconButton>
            <Button size="small" onClick={() => changeWeek(currentWeek())}>
              This week
            </Button>
          </Stack>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            onChange={(_, value: 'week' | 'list' | null) => {
              if (value) setView(value);
            }}
            aria-label="Timetable view"
          >
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="list">List</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center">
          <TextField
            label="Search classes, subjects, teachers"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            slotProps={{ htmlInput: { maxLength: 80 } }}
            sx={{ minWidth: 250 }}
          />
          <TextField
            select
            label="Class"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
            sx={{ minWidth: 240, flexGrow: { xs: 1, md: 0 } }}
          >
            <MenuItem value="">All classes</MenuItem>
            {classes.map(([id, name]) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Subject"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
            sx={{ minWidth: 170, flexGrow: { xs: 1, md: 0 } }}
          >
            <MenuItem value="">All subjects</MenuItem>
            {[...new Set(lessons.map((l) => l.courseName))].sort().map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </TextField>
          {admin && (
            <TextField
              select
              label="Teacher"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
              sx={{ minWidth: 180, flexGrow: { xs: 1, md: 0 } }}
            >
              <MenuItem value="">All teachers</MenuItem>
              {[...new Map(lessons.map((l) => [l.teacherId, l.teacherName])).entries()]
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, name]) => (
                  <MenuItem key={id} value={id}>
                    {name}
                  </MenuItem>
                ))}
            </TextField>
          )}
          {hasFilters && (
            <Button
              onClick={() => {
                setCourse('');
                setSearch('');
                setGroup('');
                setTeacher('');
              }}
            >
              Reset
            </Button>
          )}
          {query.isSuccess && (
            <Typography variant="body2" color="text.secondary" sx={{ ml: { md: 'auto' } }}>
              {new Set(filtered.map((l) => l.classGroupId)).size} classes · {filtered.length}{' '}
              lessons
            </Typography>
          )}
        </Stack>
      </Stack>
      {query.isPending ? (
        <Skeleton variant="rounded" height={460} />
      ) : query.isError ? (
        <QueryError error={query.error} retry={() => void query.refetch()} />
      ) : filtered.length === 0 ? (
        <Paper sx={{ px: 3, py: 8, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {hasFilters ? 'No lessons match these filters.' : 'No lessons scheduled this week.'}
          </Typography>
          {hasFilters && (
            <Button
              sx={{ mt: 1 }}
              onClick={() => {
                setCourse('');
                setSearch('');
                setGroup('');
                setTeacher('');
              }}
            >
              Show all classes
            </Button>
          )}
        </Paper>
      ) : view === 'list' ? (
        <TableContainer component={Paper}>
          <Table size="small" aria-label="Lesson timetable" sx={{ minWidth: 850 }}>
            <TableHead>
              <TableRow>
                {['Date / time', 'Class', 'Subject', 'Teacher', 'Students', 'Trial', ''].map(
                  (label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ),
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {local(l.startsAt).toFormat('ccc d LLL')}
                    <Typography variant="body2" color="text.secondary">
                      {local(l.startsAt).toFormat('HH:mm')}–{local(l.endsAt).toFormat('HH:mm')}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {l.className}
                    {l.status === 'CANCELLED' && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        Cancelled
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{l.courseName}</TableCell>
                  <TableCell>{l.teacherName}</TableCell>
                  <TableCell>{l.participantCount}</TableCell>
                  <TableCell>{l.trialCount || '—'}</TableCell>
                  <TableCell>
                    <Button size="small" onClick={() => selectLesson(l.id)}>
                      Students
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Paper sx={{ overflowX: 'auto' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(175px, 1fr))',
              minWidth: 1225,
            }}
          >
            {days.map((day) => {
              const dayLessons = filtered.filter(
                (l) => local(l.startsAt).toISODate() === day.toISODate(),
              );
              const today = day.hasSame(DateTime.now().setZone(ZONE), 'day');
              return (
                <Box
                  key={day.toISODate()}
                  sx={{
                    borderRight: '1px solid',
                    borderColor: 'divider',
                    '&:last-child': { borderRight: 0 },
                  }}
                >
                  <Box
                    sx={{
                      p: 1.5,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      bgcolor: today ? '#eef4f1' : '#fafafa',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography fontWeight={600} color={today ? 'primary' : 'text.primary'}>
                        {day.toFormat('ccc d')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {dayLessons.length}
                      </Typography>
                    </Stack>
                  </Box>
                  <Stack spacing={1} sx={{ p: 1, minHeight: 240 }}>
                    {dayLessons.map((l) => (
                      <Paper
                        component="button"
                        key={l.id}
                        onClick={() => selectLesson(l.id)}
                        sx={{
                          p: 1.25,
                          width: '100%',
                          textAlign: 'left',
                          font: 'inherit',
                          cursor: 'pointer',
                          bgcolor: l.status === 'CANCELLED' ? '#f5f5f5' : '#fff',
                          '&:hover': { borderColor: 'primary.main' },
                          '&:focus-visible': {
                            outline: '2px solid',
                            outlineColor: 'primary.main',
                            outlineOffset: 2,
                          },
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {local(l.startsAt).toFormat('HH:mm')}–{local(l.endsAt).toFormat('HH:mm')}
                        </Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.75 }}>
                          {l.className}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {l.courseName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {l.teacherName}
                        </Typography>
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          gap={0.5}
                          sx={{ mt: 1.25 }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {l.participantCount} students
                          </Typography>
                          {l.trialCount > 0 && (
                            <Chip
                              size="small"
                              label={`${l.trialCount} trial`}
                              sx={{
                                height: 20,
                                fontSize: 11,
                                bgcolor: '#fff1d7',
                                color: '#885918',
                              }}
                            />
                          )}
                        </Stack>
                        {l.newCount > 0 && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {l.newCount} new students
                          </Typography>
                        )}
                        {l.status === 'CANCELLED' && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            Cancelled
                          </Typography>
                        )}
                      </Paper>
                    ))}
                    {!dayLessons.length && (
                      <Typography
                        variant="body2"
                        color="text.disabled"
                        sx={{ textAlign: 'center', py: 3 }}
                      >
                        —
                      </Typography>
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}
      {creating && <SessionEditor close={() => setCreating(false)} />}
      <Roster lesson={selected} close={() => selectLesson(null)} />
    </>
  );
}
