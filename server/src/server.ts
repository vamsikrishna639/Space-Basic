import { env } from './config/env';
import { createApp } from './app';
import { connectDb, disconnectDb, devDbUri } from './core/db/connect';
import { InstitutionModel } from './modules/institutions/institution.model';
import { seedDevData, printDevUsers } from './scripts/seed-data';

async function main() {
  for (const w of env.warnings) console.warn(`\x1b[41m\x1b[37m WARNING \x1b[0m ${w}`);
  const uri = await connectDb();
  console.log(`db: connected (${uri === devDbUri() ? 'local dev database' : 'MONGODB_URI'})`);

  // Development with the local dev DB: seed FAKE demo data on first start. On later starts the seed only tops
  // up what newer modules add (e.g. sample notifications); it never changes existing records.
  if (env.NODE_ENV === 'development' && uri === devDbUri()) {
    const firstStart = (await InstitutionModel.estimatedDocumentCount()) === 0;
    await seedDevData();
    if (firstStart) printDevUsers();
  }

  const server = createApp().listen(env.PORT, () => {
    console.log(`api: ready on http://localhost:${env.PORT}/api/v1  (health: http://localhost:${env.PORT}/api/v1/health)`);
    if (env.RELAX_RATE_LIMITS) console.log('api: sign-in and code rate limits RELAXED (RELAX_RATE_LIMITS=true; development/test only)');
    console.log(`api: OTP provider for email = ${env.OTP_PROVIDER ?? 'none (password sign-in only)'}; SMS/WhatsApp = ${!env.isProd || env.ALLOW_CONSOLE_OTP ? 'console' : 'unavailable'}`);
  });
  const shutdown = () => server.close(() => { disconnectDb().finally(() => process.exit(0)); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('api: failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
