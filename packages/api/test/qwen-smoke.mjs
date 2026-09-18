// Explicit opt-in: fictional input only; never reads customer records.
import { config } from 'dotenv';
import { createRequire } from 'node:module';
config({ path: 'env.local', quiet: true });
config({ path: '.env', quiet: true });
if (!process.env.QIWEN_API_KEY || !process.env.QWEN_BASE_URL || !process.env.QWEN_MODEL) {
  console.error('Configure QIWEN_API_KEY, QWEN_BASE_URL and QWEN_MODEL in backend environment.');
  process.exit(1);
}
const require = createRequire(import.meta.url);
const { QwenProvider, validateReport } = require('../dist/workflow/ai.service');
const { reportJsonSchema } = require('../dist/workflow/report-schema');
const facts = {
  classroomPerformanceRating: 4,
  overallAbilityRating: 3.5,
  purchaseIntentRating: 3,
  reasons: ['TIME'],
};
const evidence = [
  {
    id: 'fictional-evaluation',
    text: 'Fictional learner enjoys visual exercises. Parent requests alternative times.',
  },
];
const result = await new QwenProvider().generate({
  facts,
  evidence,
  language: 'en-AU',
  outputSchema: reportJsonSchema,
});
validateReport(
  result,
  facts,
  evidence.map((e) => e.id),
);
console.log('Real Qwen returned valid report JSON for fictional data. No personal records sent.');
