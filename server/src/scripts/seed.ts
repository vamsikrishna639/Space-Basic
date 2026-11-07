// `npm run seed` (dev only): seed FAKE demo data. `npm run seed -- --reset` drops the dev database first.
import { connectDb, disconnectDb } from '../core/db/connect';
import { printDevUsers, seedDevData } from './seed-data';

(async () => {
  try {
    const uri = await connectDb();
    console.log(`seed: connected to ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
    await seedDevData({ reset: process.argv.includes('--reset') });
    printDevUsers();
  } catch (err) {
    console.error('seed failed:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
})();
