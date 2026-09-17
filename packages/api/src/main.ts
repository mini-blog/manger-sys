import { createApp } from './bootstrap';
import { settings } from './config';

async function main() {
  const { app } = await createApp();
  await app.listen(settings.port, settings.host);
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
