import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { components, paths } from '@student/common/api';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import { createRequestKey } from '../lib/request-key';

type GrantBody =
  paths['/api/entitlements/grants']['post']['requestBody']['content']['application/json'];
type StudentChoice = { id: string; name: string };
type Props = {
  student?: StudentChoice;
  initialBucket?: 'TRIAL' | 'REGULAR';
  initialMode?: 'CUSTOM' | 'PACKAGE';
  onClose: () => void;
  onSaved: (result: components['schemas']['GrantResultDto']) => void;
};
export function GrantCreditsDialog({
  student,
  initialBucket = 'TRIAL',
  initialMode = 'CUSTOM',
  onClose,
  onSaved,
}: Props) {
  const { auth, refresh } = useAuth();
  const client = useQueryClient();
  const [selected, setSelected] = useState<StudentChoice | null>(student ?? null);
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState(initialBucket);
  const [mode, setMode] = useState(initialMode);
  const [quantity, setQuantity] = useState('1');
  const [pack, setPack] = useState<components['schemas']['LessonPackageDto'] | undefined>();
  const packageId = pack?.id ?? '';
  const [note, setNote] = useState('');
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const students = useQuery({
    queryKey: ['students', 'credit-picker', auth?.user.id, search],
    enabled: !student,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/students', {
        params: { query: { mine: 'true', q: search, pageSize: 20 } },
      });
      if (response.status === 401) refresh(null);
      if (!data) throw apiError(error);
      return data;
    },
  });
  const packages = useQuery({
    queryKey: ['lesson-packages'],
    enabled: bucket === 'REGULAR' && mode === 'PACKAGE',
    queryFn: async () => {
      // The catalogue is paginated; never silently drop options after the first page.
      const items: components['schemas']['LessonPackageDto'][] = [];
      for (let page = 1; ; page++) {
        const { data, error } = await api.GET('/api/lesson-packages', {
          params: { query: { page, pageSize: 100 } },
        });
        if (!data) throw apiError(error);
        items.push(...data.items);
        if (items.length >= data.total || !data.items.length) return items;
      }
    },
  });
  // Keep the explicit selection stable across catalogue refetches and ambiguous network failures.
  const setPackageId = (id: string) => setPack(packages.data?.find((p) => p.id === id));
  const packageOptions = [
    ...(packages.data ?? []),
    ...(pack && !packages.data?.some((p) => p.id === pack.id) ? [pack] : []),
  ];
  const units = Number(quantity);
  const valid =
    selected &&
    (bucket === 'REGULAR' && mode === 'PACKAGE'
      ? Boolean(pack)
      : Number.isInteger(units) && units >= 1 && units <= 10000);
  const save = useMutation({
    mutationFn: async (body: GrantBody) => {
      const payload = JSON.stringify(body);
      if (attempt.current?.body !== payload)
        attempt.current = { body: payload, key: createRequestKey() };
      const { data, error, response } = await api.POST('/api/entitlements/grants', {
        body,
        params: { header: { 'idempotency-key': attempt.current.key } },
        headers: { 'x-csrf-token': auth?.csrfToken ?? '' },
      });
      if (response.status === 401) refresh(null);
      if (!data) {
        if (response.status === 409 && bucket === 'REGULAR' && mode === 'PACKAGE') {
          const failure: unknown = error;
          const code =
            typeof failure === 'object' && failure && 'code' in failure ? failure.code : undefined;
          if (code === 'PACKAGE_INACTIVE' || code === 'PACKAGE_VERSION_CONFLICT') {
            setPackageId('');
            await packages.refetch();
          }
        }
        throw apiError(error);
      }
      return data;
    },
    onSuccess: async (result) => {
      attempt.current = null;
      // Refetch current values: an idempotent replay may contain an older balance.
      await client.invalidateQueries({
        predicate: (q) =>
          [
            'entitlements',
            'entitlement-entries',
            'students',
            'student',
            'trial-eligibility',
            'roster',
            'lessons',
            'tasks',
            'task',
          ].includes(String(q.queryKey[0])),
      });
      onSaved(result);
    },
  });
  function submit() {
    if (!valid || !selected || save.isPending) return;
    const base = { studentId: selected.id, ...(note.trim() ? { note: note.trim() } : {}) };
    const body: GrantBody =
      bucket === 'TRIAL'
        ? { ...base, bucket, quantity: units }
        : mode === 'CUSTOM'
          ? { ...base, bucket, mode, quantity: units }
          : { ...base, bucket, mode, packageId: pack!.id, expectedPackageVersion: pack!.version };
    save.mutate(body);
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!save.isPending) onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <Stack
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle>Add lesson credits</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {save.isError && <Alert severity="error">{save.error.message}</Alert>}
            {student ? (
              <TextField
                label="Student"
                value={student.name}
                slotProps={{ input: { readOnly: true } }}
              />
            ) : (
              <>
                <Autocomplete
                  options={students.data?.items ?? []}
                  value={selected}
                  onChange={(_, value) => setSelected(value)}
                  getOptionLabel={(s) => s.name}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  filterOptions={(options) => options}
                  loading={students.isFetching}
                  onInputChange={(_, value, reason) => {
                    if (reason === 'input' || reason === 'clear') setSearch(value.slice(0, 80));
                  }}
                  renderInput={(params) => <TextField {...params} label="Student" required />}
                  disabled={save.isPending}
                />
                {students.isError && (
                  <Alert
                    severity="error"
                    action={<Button onClick={() => void students.refetch()}>Retry</Button>}
                  >
                    {students.error.message}
                  </Alert>
                )}
              </>
            )}
            <ToggleButtonGroup
              value={bucket}
              exclusive
              fullWidth
              disabled={save.isPending}
              aria-label="Credit type"
              onChange={(_, value: 'TRIAL' | 'REGULAR' | null) => {
                if (value) {
                  setBucket(value);
                  setMode('CUSTOM');
                  setPackageId('');
                  setQuantity('1');
                  save.reset();
                }
              }}
            >
              <ToggleButton value="TRIAL">Trial card</ToggleButton>
              <ToggleButton value="REGULAR">Regular card</ToggleButton>
            </ToggleButtonGroup>
            {bucket === 'REGULAR' && (
              <TextField
                select
                label="Purchase option"
                value={mode}
                disabled={save.isPending}
                onChange={(e) => {
                  setMode(e.target.value as 'CUSTOM' | 'PACKAGE');
                  setPackageId('');
                  setQuantity('1');
                  save.reset();
                }}
              >
                <MenuItem value="CUSTOM">Custom lesson count</MenuItem>
                <MenuItem value="PACKAGE">Membership package</MenuItem>
              </TextField>
            )}
            {bucket === 'REGULAR' && mode === 'PACKAGE' ? (
              <>
                {packages.isError && (
                  <Alert
                    severity="error"
                    action={<Button onClick={() => void packages.refetch()}>Retry</Button>}
                  >
                    {packages.error.message}
                  </Alert>
                )}
                <TextField
                  select
                  label="Package"
                  value={packageId}
                  disabled={packages.isPending || save.isPending}
                  onChange={(e) => setPackageId(e.target.value)}
                >
                  <MenuItem value="" disabled>
                    {packages.isPending ? 'Loading packages…' : 'Select a package'}
                  </MenuItem>
                  {packageOptions.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} · {p.quantity} lessons
                    </MenuItem>
                  ))}
                </TextField>
                {packages.data?.length === 0 && (
                  <Typography color="text.secondary">
                    No packages available. Choose a custom lesson count.
                  </Typography>
                )}
                {pack && (
                  <Typography>
                    {pack.quantity} regular lessons ·{' '}
                    {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
                      pack.priceAudCents / 100,
                    )}{' '}
                    reference price
                  </Typography>
                )}
              </>
            ) : (
              <TextField
                label="Number of lessons"
                type="number"
                value={quantity}
                required
                disabled={save.isPending}
                onChange={(e) => setQuantity(e.target.value)}
                slotProps={{ htmlInput: { min: 1, max: 10000, step: 1 } }}
              />
            )}
            <TextField
              label="Note (optional)"
              multiline
              minRows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={save.isPending}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
            {valid && (
              <Typography variant="body2">
                Add {bucket === 'REGULAR' && mode === 'PACKAGE' ? pack!.quantity : units}{' '}
                {bucket === 'TRIAL' ? 'trial' : 'regular'} lesson credits to {selected!.name}.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={!valid || save.isPending}>
            {save.isPending ? 'Saving…' : 'Add credits'}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
