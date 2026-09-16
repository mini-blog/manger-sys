import { Alert, Button } from '@mui/material';

export function QueryError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" onClick={retry}>
          Retry
        </Button>
      }
    >
      {error.message}
    </Alert>
  );
}
