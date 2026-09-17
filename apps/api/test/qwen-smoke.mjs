// Explicit opt-in smoke test; only fictional content is sent. No DB records are read.
import { config } from 'dotenv';
import { createRequire } from 'node:module';
config({ path: '.env', quiet: true });
if (!process.env.QWEN_API_KEY || !process.env.QWEN_BASE_URL || !process.env.QWEN_MODEL) {
  console.error('Configure QWEN_API_KEY, QWEN_BASE_URL and QWEN_MODEL in the backend .env first.');
  process.exit(1);
}
const require = createRequire(import.meta.url);
const { QwenProvider, validateSuggestion } = require('../dist/workflow/ai.service');
const result = await new QwenProvider().generate({
  channel: 'EMAIL',
  language: 'en-AU',
  reason: 'TRIAL_COMPLETED',
  evidence: [
    {
      id: 'fictional-feedback',
      text: 'Fictional demonstration: student enjoyed visual mathematics exercises; no purchase intent recorded.',
    },
  ],
});
validateSuggestion(result, 'EMAIL', ['fictional-feedback']);
console.log(
  'Real Qwen returned a valid structured response. No database or personal records were used.',
);
