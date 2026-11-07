import { Schema, model } from 'mongoose';

// Fixed-window counters stored in MongoDB (global collection) so limits survive a Render restart.
interface RateCounter { key: string; count: number; expiresAt: Date }
const schema = new Schema<RateCounter>(
  { key: { type: String, required: true }, count: { type: Number, required: true, default: 0 }, expiresAt: { type: Date, required: true } },
  { versionKey: false },
);
schema.index({ key: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RateCounterModel = model<RateCounter>('RateCounter', schema, 'rate_counters');

export interface Hit { count: number; retryAfterSeconds: number }

/** Increment the counter for `key` in a window of `windowMs`; returns the new count. */
export async function hit(key: string, windowMs: number): Promise<Hit> {
  const now = new Date();
  try {
    const doc = await RateCounterModel.findOneAndUpdate(
      { key, expiresAt: { $gt: now } },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(now.getTime() + windowMs) } },
      { upsert: true, returnDocument: 'after' },
    ).lean();
    return { count: doc!.count, retryAfterSeconds: (doc!.expiresAt.getTime() - now.getTime()) / 1000 };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      // an expired window the TTL monitor has not removed yet
      await RateCounterModel.deleteOne({ key, expiresAt: { $lte: now } });
      return hit(key, windowMs);
    }
    throw err;
  }
}

/** Current count in the active window (0 if none). */
export async function peek(key: string): Promise<Hit> {
  const now = new Date();
  const doc = await RateCounterModel.findOne({ key, expiresAt: { $gt: now } }).lean();
  return doc ? { count: doc.count, retryAfterSeconds: (doc.expiresAt.getTime() - now.getTime()) / 1000 } : { count: 0, retryAfterSeconds: 0 };
}

export async function reset(key: string): Promise<void> {
  await RateCounterModel.deleteOne({ key });
}
