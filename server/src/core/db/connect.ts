import mongoose from 'mongoose';
import { env } from '../../config/env';

mongoose.set('strictQuery', true);

/** URI of the local development database started by `npm run dev` (scripts/dev-db.ts). */
export function devDbUri(): string {
  return `mongodb://127.0.0.1:${env.DEV_DB_PORT}/spacebasic`;
}

/** Connect to MONGODB_URI, or (development only) to the local dev DB, retrying while it starts. */
export async function connectDb(uri = env.MONGODB_URI ?? (env.isProd ? undefined : devDbUri())): Promise<string> {
  if (!uri) throw new Error('MONGODB_URI is required');
  const deadline = Date.now() + 90_000; // the first run may still be downloading the MongoDB binary
  for (;;) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000, autoIndex: true });
      return uri;
    } catch (err) {
      if (Date.now() > deadline || uri !== devDbUri()) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
