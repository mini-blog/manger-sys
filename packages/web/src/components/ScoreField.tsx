import { Rating, Stack, Typography } from '@mui/material';
export function ScoreField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: number | null;
  onChange?: (value: number | null) => void;
  readOnly?: boolean;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography sx={{ minWidth: 170 }}>{label}</Typography>
      <Rating
        name={label}
        aria-label={label}
        value={value}
        max={5}
        precision={0.5}
        readOnly={readOnly}
        getLabelText={(n) => `${label}: ${n} / 5`}
        onChange={(_, n) => onChange?.(n != null && n >= 1 ? n : null)}
      />
      <Typography variant="body2">{value == null ? 'Not rated' : `${value} / 5`}</Typography>
    </Stack>
  );
}
