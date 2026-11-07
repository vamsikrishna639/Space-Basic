// Local development database for `npm run dev` (development only, no account or secret needed).
// mongodb-memory-server running a real mongod with a persistent data folder: server/.data/db (gitignored).
// If MONGODB_URI is set, this process just idles so `npm run dev` keeps running.
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';

async function main() {
  if (env.isProd) throw new Error('dev-db is for development only');
  if (env.MONGODB_URI) {
    console.log('dev-db: MONGODB_URI is set, using that database (local dev DB not started)');
    setInterval(() => {}, 1 << 30);
    return;
  }
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const dbPath = path.resolve(__dirname, '../../.data/db');
  fs.mkdirSync(dbPath, { recursive: true });
  console.log('dev-db: starting local MongoDB (first run downloads the MongoDB binary, this can take a minute)...');
  const mongod = await MongoMemoryServer.create({
    instance: { port: env.DEV_DB_PORT, dbPath, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  });
  console.log(`dev-db: ready at ${mongod.getUri()} (data: server/.data/db)`);
  const stop = async () => { await mongod.stop({ doCleanup: false }); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => { console.error('dev-db failed:', err); process.exit(1); });
