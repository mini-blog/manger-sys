import { Box, Typography } from '@mui/material';

export function PageHeader({ title }: { title: string }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography component="h1" variant="h4">
        {title}
      </Typography>
    </Box>
  );
}
