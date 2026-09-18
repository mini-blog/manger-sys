import { RichText } from './RichText';
import { GUARDIAN_GENDERS, COMMUNICATION_CHANNELS } from '@student/common';
import type { components } from '@student/common/api';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import { label } from './FormParts';

type Detail = components['schemas']['StudentDetailDto'];
export function guardianFormFrom(student?: Detail) {
  return {
    backgroundHtml: student?.backgroundHtml ?? '',
    adminNotesHtml: student?.adminNotesHtml ?? '',
    guardianName: student?.guardianName ?? '',
    guardianRelationship: student?.guardianRelationship ?? '',
    guardianOccupation: student?.guardianOccupation ?? '',
    guardianAge: student?.guardianAge == null ? '' : String(student.guardianAge),
    guardianGender: student?.guardianGender ?? '',
    guardianPhone: student?.guardianPhone ?? '',
    guardianEmail: student?.guardianEmail ?? '',
    guardianWechat: student?.guardianWechat ?? '',
    preferredChannel: student?.preferredChannel ?? '',
    preferredLanguage: student?.preferredLanguage ?? 'en-AU',
    learningGoals: student?.learningGoals ?? '',
    preferredTimes: student?.preferredTimes ?? '',
    interestedSubjects: student?.interestedSubjects ?? '',
  };
}
export type GuardianForm = ReturnType<typeof guardianFormFrom>;
export function guardianPayload(form: GuardianForm) {
  return {
    ...form,
    guardianGender:
      form.guardianGender as components['schemas']['CreateStudentDto']['guardianGender'],
    guardianAge: form.guardianAge === '' ? undefined : Number(form.guardianAge),
    preferredChannel:
      form.preferredChannel as components['schemas']['CreateStudentDto']['preferredChannel'],
    preferredLanguage:
      form.preferredLanguage as components['schemas']['CreateStudentDto']['preferredLanguage'],
  };
}
export function GuardianFields({
  value,
  onChange,
  disabled = false,
}: {
  value: GuardianForm;
  onChange: (value: GuardianForm) => void;
  disabled?: boolean;
}) {
  const set = (key: keyof GuardianForm, next: string) => onChange({ ...value, [key]: next });
  const text = (key: keyof GuardianForm, title: string, maxLength = 100, type = 'text') => (
    <TextField
      label={title}
      value={value[key]}
      onChange={(e) => set(key, e.target.value)}
      type={type}
      disabled={disabled}
      slotProps={{ htmlInput: { maxLength } }}
      fullWidth
    />
  );
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
      <Typography variant="h6" sx={{ gridColumn: '1 / -1' }}>
        Guardian information
      </Typography>
      {text('guardianName', 'Guardian name')}
      {text('guardianRelationship', 'Relationship to student')}
      {text('guardianEmail', 'Email', 254, 'email')}
      {text('guardianPhone', 'Phone', 40, 'tel')}
      {text('guardianOccupation', 'Occupation', 120)}
      <TextField
        label="Age (optional)"
        type="number"
        value={value.guardianAge}
        disabled={disabled}
        onChange={(e) => set('guardianAge', e.target.value)}
        slotProps={{ htmlInput: { min: 0, max: 120, step: 1 } }}
      />
      <TextField
        label="Gender"
        select
        value={value.guardianGender}
        onChange={(e) => set('guardianGender', e.target.value)}
        disabled={disabled}
      >
        <MenuItem value="">Not provided</MenuItem>
        {GUARDIAN_GENDERS.map((g) => (
          <MenuItem key={g} value={g}>
            {label(g)}
          </MenuItem>
        ))}
      </TextField>
      {text('guardianWechat', 'WeChat (optional)')}
      <TextField
        label="Preferred contact method"
        select
        value={value.preferredChannel}
        onChange={(e) => set('preferredChannel', e.target.value)}
        disabled={disabled}
      >
        <MenuItem value="">Not set</MenuItem>
        {COMMUNICATION_CHANNELS.filter((c) => c !== 'IN_PERSON').map((c) => (
          <MenuItem key={c} value={c}>
            {label(c)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Language"
        select
        value={value.preferredLanguage}
        onChange={(e) => set('preferredLanguage', e.target.value)}
        disabled={disabled}
      >
        <MenuItem value="en-AU">English</MenuItem>
        <MenuItem value="zh-CN">中文</MenuItem>
      </TextField>
      <Typography variant="h6" sx={{ gridColumn: '1 / -1' }}>
        Learning preferences
      </Typography>
      {text('interestedSubjects', 'Subjects of interest', 1000)}
      {text('preferredTimes', 'Preferred lesson times', 1000)}
      <TextField
        label="Learning goals"
        value={value.learningGoals}
        onChange={(e) => set('learningGoals', e.target.value)}
        disabled={disabled}
        multiline
        minRows={2}
        sx={{ gridColumn: '1 / -1' }}
        slotProps={{ htmlInput: { maxLength: 1000 } }}
      />
      <Box sx={{ gridColumn: '1 / -1' }}>
        <RichText
          label="Basic information · visible to teachers"
          value={value.backgroundHtml}
          onChange={(v) => set('backgroundHtml', v)}
          max={5000}
          disabled={disabled}
        />
      </Box>
      <Box sx={{ gridColumn: '1 / -1' }}>
        <RichText
          label="Admin notes · responsible admin only"
          value={value.adminNotesHtml}
          onChange={(v) => set('adminNotesHtml', v)}
          max={5000}
          disabled={disabled}
        />
      </Box>
    </Box>
  );
}
