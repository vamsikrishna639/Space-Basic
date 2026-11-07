import os from 'node:os';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/** One in-memory MongoDB per test file; every collection is emptied after each test. */
export function useTestDb(): void {
  let mongod: MongoMemoryServer;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    // The MongoDB driver (7.8) loads `os` with a dynamic import(), which Jest's CommonJS sandbox rejects.
    // The driver swallows that error and sends an empty handshake, so mongod refuses every connection.
    // Passing the adapter in skips the dynamic import. Only tests need this; plain Node is unaffected.
    await mongoose.connect(mongod.getUri('spacebasic-test'), { runtimeAdapters: { os } });
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  });
  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongod?.stop();
  });
}
