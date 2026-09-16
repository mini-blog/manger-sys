import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from './bootstrap';

async function exportSchema() {
  const { app, document } = await createApp();
  await writeFile(
    resolve(__dirname, '../../../openapi.json'),
    JSON.stringify(document, null, 2) + '\n',
  );
  await app.close();
}
void exportSchema().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
