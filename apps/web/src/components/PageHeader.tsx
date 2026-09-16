import { Box, Typography } from '@mui/material';
import { DateTime } from 'luxon';
import { ZONE } from '../lib/time';

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="overline" color="text.secondary">
        {DateTime.now().setZone(ZONE).setLocale('en-AU').toFormat('cccc, d LLLL yyyy')}
      </Typography>
      <Typography variant="h4" sx={{ mt: 0.5, mb: 1 }}>
        {title}
      </Typography>
      <Typography color="text.secondary">{description}</Typography>
    </Box>
  );
}
