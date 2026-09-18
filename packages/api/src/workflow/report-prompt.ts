import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'ejs';
import { reportJsonSchema } from './report-schema';

// Templates are trusted, versioned application assets, never user supplied.
export const REPORT_PROMPT_VERSION = 'student-report-v1';
function template(name: string) {
  const built = resolve(__dirname, 'prompts', name);
  const source = resolve(__dirname, '../../src/workflow/prompts', name);
  return compile(readFileSync(existsSync(built) ? built : source, 'utf8'), {
    strict: true,
    _with: false,
  });
}
const system = template('student-report.system.ejs');
const user = template('student-report.user.ejs');
export function reportMessages(input: unknown) {
  return [
    {
      role: 'system',
      content: system({ version: REPORT_PROMPT_VERSION, schema: JSON.stringify(reportJsonSchema) }),
    },
    // Serialize values once. EJS expressions in records remain inert text.
    { role: 'user', content: user({ records: JSON.stringify(input) }) },
  ];
}
