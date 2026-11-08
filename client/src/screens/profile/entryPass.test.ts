import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { isFinalError, isStale, remainingMs, ringFraction, secondsLeft } from './entryPassClock';
import { QR_CANVAS_OPTIONS, qrSegments } from './entryPassQr';

describe('Entry Pass countdown', () => {
  it('drains the ring continuously and rounds the label up, as in the screenshot (8.68 s left reads "9s")', () => {
    const left = remainingMs(0, 10_000, 1_320);
    expect(left).toBe(8_680);
    expect(ringFraction(left, 10_000)).toBeCloseTo(0.868);
    expect(secondsLeft(left)).toBe(9);
    expect(secondsLeft(10_000)).toBe(10);
    expect(secondsLeft(1)).toBe(1);
    expect(remainingMs(0, 10_000, 12_000)).toBe(0);
    expect(ringFraction(-5, 10_000)).toBe(0);
  });

  it('hides a code 1 s before the server stops accepting it', () => {
    expect(isStale(0, 13_999, 15)).toBe(false);
    expect(isStale(0, 14_000, 15)).toBe(true);
  });

  it('retries network trouble and server errors, not refusals', () => {
    expect(isFinalError(0)).toBe(false); // network
    expect(isFinalError(503)).toBe(false);
    expect(isFinalError(429)).toBe(false);
    expect(isFinalError(403)).toBe(true);
    expect(isFinalError(404)).toBe(true);
  });
});

describe('Entry Pass QR', () => {
  // The server's token: 52 + "." + 43 base64url characters (docs/api.md "Attendance").
  const token = `${'A'.repeat(20)}0123456789012345678901234567890b.${'z'.repeat(43)}`;

  it('a pass token is always version 6-M, 41 x 41 modules, like the screenshot', () => {
    expect(token).toHaveLength(96);
    const qr = QRCode.create(qrSegments(token), { errorCorrectionLevel: QR_CANVAS_OPTIONS.errorCorrectionLevel });
    expect(qr.version).toBe(6);
    expect(qr.modules.size).toBe(41);
  });
});
