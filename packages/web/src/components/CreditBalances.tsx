import { Stack, Typography } from '@mui/material';
import type { PoolBalance } from '@student/common';
export function CreditBalance({ balance }: { balance: PoolBalance }) {
  return (
    <Stack spacing={0.25}>
      <Typography fontWeight={600}>{balance.available} available</Typography>
      <Typography variant="caption" color="text.secondary">
        {balance.remaining} remaining · {balance.reserved} reserved
      </Typography>
    </Stack>
  );
}
