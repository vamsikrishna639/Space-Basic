import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import { cameraProblem, diagnoseCamera, errorOutcome, looksLikePass, okOutcome } from './scanText';

const PASS = `${'A'.repeat(52)}.${'b_-'.repeat(14)}c`; // 52 + 1 + 43 = 96, the shape of a real pass

describe('which QR codes are sent to the API', () => {
  it('a pass-shaped code is', () => {
    expect(PASS).toHaveLength(96);
    expect(looksLikePass(PASS)).toBe(true);
    expect(looksLikePass(` ${PASS}\n`)).toBe(true);
  });
  it('anything else is not', () => {
    for (const t of ['', 'https://example.com', PASS.slice(1), `${PASS}x`, PASS.replace('.', '_'), PASS.replace('A', '+'), `${'A'.repeat(53)}.${'b'.repeat(42)}`]) {
      expect(looksLikePass(t), t).toBe(false);
    }
  });
});

describe('what the warden sees', () => {
  it('a marked student: name and room', () => {
    const o = okOutcome({ student: { fullName: 'Arjun Kumar Rao', room: 'West CS240' }, scannedAt: '', kind: 'attendance' });
    expect(o).toEqual({ tone: 'ok', title: 'Attendance marked', lines: ['Arjun Kumar Rao', 'West CS240'] });
    expect(okOutcome({ student: { fullName: 'A B', room: null }, scannedAt: '', kind: 'attendance' }).lines[1]).toBe('No room assigned');
  });
  it('the 5-minute repeat and a reused code: "already marked", with the server words', () => {
    const o = errorOutcome(new ApiError(409, 'ALREADY_SCANNED', 'Arjun Kumar Rao was marked a moment ago.'));
    expect(o).toEqual({ tone: 'warn', title: 'Already marked', lines: ['Arjun Kumar Rao was marked a moment ago.'] });
    expect(errorOutcome(new ApiError(409, 'ALREADY_SCANNED', 'This QR code was already scanned.')).lines[0]).toBe('This QR code was already scanned.');
  });
  it('expired and forged codes: the token field message', () => {
    const expired = errorOutcome(new ApiError(400, 'VALIDATION_ERROR', 'This QR code has expired.', { token: 'This QR code has expired. Ask the student to show it again.' }));
    expect(expired).toEqual({ tone: 'error', title: 'Code not accepted', lines: ['This QR code has expired. Ask the student to show it again.'] });
    const forged = errorOutcome(new ApiError(400, 'VALIDATION_ERROR', 'This is not a valid SpaceBasic QR code.', { token: 'This is not a valid SpaceBasic QR code.' }));
    expect(forged.lines).toEqual(['This is not a valid SpaceBasic QR code.']);
  });
  it('another institution: not found', () => {
    const o = errorOutcome(new ApiError(404, 'NOT_FOUND', 'No student found for this QR code.'));
    expect(o.title).toBe('Student not found');
    expect(o.lines[0]).toBe('No student found for this QR code.');
  });
  it('rate limit, network and anything else', () => {
    expect(errorOutcome(new ApiError(429, 'RATE_LIMITED', 'x')).title).toBe('Too many scans');
    expect(errorOutcome(new ApiError(0, 'NETWORK', "We couldn't reach SpaceBasic.")).title).toBe('No connection');
    expect(errorOutcome(new Error('boom')).tone).toBe('error');
  });
});

describe('why the camera did not start', () => {
  const dom = (name: string) => Object.assign(new Error(name), { name });
  it('maps the browser errors', () => {
    expect(cameraProblem(dom('NotAllowedError'))).toBe('denied');
    expect(cameraProblem(dom('SecurityError'))).toBe('denied');
    expect(cameraProblem(dom('NotFoundError'))).toBe('none');
    expect(cameraProblem(dom('OverconstrainedError'))).toBe('none');
    expect(cameraProblem(dom('NotReadableError'))).toBe('busy');
    expect(cameraProblem('Camera not found.')).toBe('none');
    expect(cameraProblem(dom('Whatever'))).toBe('failed');
  });
  it('an insecure page wins over everything', () => {
    expect(cameraProblem(dom('NotAllowedError'), false)).toBe('insecure');
  });
});

describe('qr-scanner\'s "Camera not found." is checked against the browser', () => {
  const dom = (name: string) => Object.assign(new Error(name), { name });
  const refuse = (name: string) => () => Promise.reject(dom(name));
  it('a refused permission is "denied", not "no camera"', async () => {
    expect(await diagnoseCamera('Camera not found.', { secure: true, getUserMedia: refuse('NotAllowedError') })).toBe('denied');
  });
  it('really no camera, or busy', async () => {
    expect(await diagnoseCamera('Camera not found.', { secure: true, getUserMedia: refuse('NotFoundError') })).toBe('none');
    expect(await diagnoseCamera('Camera not found.', { secure: true, getUserMedia: refuse('NotReadableError') })).toBe('busy');
    expect(await diagnoseCamera('Camera not found.', { secure: true, getUserMedia: refuse('NotSupportedError') })).toBe('failed');
    expect(await diagnoseCamera('Camera not found.', { secure: true })).toBe('none');
  });
  it('a camera that opens on the second try is stopped at once', async () => {
    let stopped = 0;
    const stream = { getTracks: () => [{ stop: () => { stopped++; } }] } as unknown as MediaStream;
    expect(await diagnoseCamera('Camera not found.', { secure: true, getUserMedia: () => Promise.resolve(stream) })).toBe('failed');
    expect(stopped).toBe(1);
  });
  it('an insecure page, and a real DOMException passed straight through', async () => {
    expect(await diagnoseCamera('Camera not found.', { secure: false })).toBe('insecure');
    expect(await diagnoseCamera(dom('NotAllowedError'), { secure: true })).toBe('denied');
  });
});
