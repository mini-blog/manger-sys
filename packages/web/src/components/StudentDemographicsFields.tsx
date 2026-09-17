import { STUDENT_GENDERS } from '@student/common';
import { Box, MenuItem, TextField } from '@mui/material';
import { label } from './FormParts';

export function StudentDemographicsFields({
  age,
  gender,
  onAge,
  onGender,
  disabled = false,
}: {
  age: string;
  gender: string;
  onAge: (value: string) => void;
  onGender: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
      <TextField
        label="Student gender"
        select
        value={gender}
        disabled={disabled}
        onChange={(e) => onGender(e.target.value)}
      >
        <MenuItem value="">Not provided</MenuItem>
        {STUDENT_GENDERS.map((value) => (
          <MenuItem key={value} value={value}>
            {label(value)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Student age"
        type="number"
        value={age}
        disabled={disabled}
        onChange={(e) => onAge(e.target.value)}
        slotProps={{ htmlInput: { min: 0, max: 120, step: 1 } }}
      />
    </Box>
  );
}
