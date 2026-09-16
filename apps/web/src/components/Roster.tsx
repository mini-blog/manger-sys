import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  CircularProgress,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Close, CheckCircleOutline } from '@mui/icons-material';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import { local, type Lesson } from '../lib/time';
import { QueryError } from './QueryError';

export function Roster({ lesson, close }: { lesson: Lesson | null; close: () => void }) {
  const { auth, refresh } = useAuth();
  const query = useQuery({
    queryKey: ['roster', auth?.user.id, lesson?.id],
    enabled: Boolean(lesson),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/sessions/{id}/participants', {
        params: { path: { id: lesson!.id } },
      });
      if (response.status === 401) refresh(null);
      if (error || !data) throw apiError(error);
      return data;
    },
  });
  return (
    <Drawer
      anchor="right"
      open={Boolean(lesson)}
      onClose={close}
      PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 3 } }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="overline" color="text.secondary">
          LESSON DETAILS
        </Typography>
        <IconButton aria-label="Close class list" onClick={close}>
          <Close />
        </IconButton>
      </Stack>
      {lesson && (
        <>
          <Typography variant="h5" sx={{ mt: 2 }}>
            {lesson.courseName}
          </Typography>
          <Typography sx={{ mt: 0.5 }}>{lesson.className}</Typography>
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            {local(lesson.startsAt).toFormat('cccc, d LLL yyyy')}
            <br />
            {local(lesson.startsAt).toFormat('HH:mm')} – {local(lesson.endsAt).toFormat('HH:mm')} ·
            Melbourne
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ my: 2 }}>
            <Avatar sx={{ width: 30, height: 30, fontSize: 13 }}>{lesson.teacherName[0]}</Avatar>
            <Typography variant="body2">{lesson.teacherName}</Typography>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" justifyContent="space-between">
            <Typography fontWeight={600}>Class list</Typography>
            <Typography variant="body2" color="text.secondary">
              {lesson.participantCount}/{lesson.capacity} places
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Trial students first, then students new to this class.
          </Typography>
          {query.isPending ? (
            <CircularProgress aria-label="Loading class list" sx={{ m: 3 }} />
          ) : query.isError ? (
            <QueryError error={query.error} retry={() => void query.refetch()} />
          ) : (
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {query.data?.participants.map((p) => (
                <Paper
                  key={p.id}
                  sx={{
                    p: 2,
                    bgcolor: p.kind === 'TRIAL' ? '#fff8e9' : '#fff',
                    borderColor: p.kind === 'TRIAL' ? '#ebd6a8' : '#e3e8e1',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography fontWeight={600}>{p.name}</Typography>
                    {p.kind === 'TRIAL' && (
                      <Chip
                        label="Trial student"
                        size="small"
                        sx={{ bgcolor: '#f9e4b8', color: '#885918' }}
                      />
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {p.yearLevel}
                    </Typography>
                    {p.isNewToClass && (
                      <Typography variant="caption" color="primary">
                        <CheckCircleOutline
                          sx={{ fontSize: 13, verticalAlign: 'middle', mr: 0.5 }}
                        />
                        New to class
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              ))}
              {query.data?.participants.length === 0 && (
                <Typography color="text.secondary">No students booked yet.</Typography>
              )}
            </Stack>
          )}
          <Alert severity="info" sx={{ mt: 3 }}>
            This class list is read-only. Attendance and feedback are the next part of the trial
            workflow.
          </Alert>
        </>
      )}
    </Drawer>
  );
}
