import crypto from 'node:crypto';
import { env } from '../../config/env';
import { encodeQrToken, QR_TOKEN_LENGTH, signQrToken, verifyQrToken } from './tokens';

// The Entry Pass QR token (docs/api.md "Attendance"; decisions.md "Compact QR token"). One test per property the
// user asked to be confirmed. The HTTP-level checks (reuse, wrong institution) are in attendance.test.ts.

const who = { sub: '64b7f0c2a1b2c3d4e5f60718', inst: '64b7f0c2a1b2c3d4e5f60799' };
const NOW = Date.UTC(2026, 10, 9, 10, 0, 0);
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

describe('QR token: HMAC-SHA256 with its own secret', () => {
  it('the signature is HMAC-SHA256(QR_TOKEN_SECRET, context || body), recomputed independently here', () => {
    const { token } = signQrToken(who, NOW);
    const [body, mac] = token.split('.') as [string, string];
    const expected = crypto.createHmac('sha256', env.QR_TOKEN_SECRET)
      .update(Buffer.from('spacebasic-qr/v1\0', 'utf8')).update(Buffer.from(body, 'base64url')).digest('base64url');
    expect(mac).toBe(expected);
  });

  it('its secret is not the access-token secret, and a code signed with any other secret is refused', () => {
    expect(env.QR_TOKEN_SECRET).not.toBe(env.JWT_ACCESS_SECRET);
    const iat = Math.floor(NOW / 1000);
    const jti = crypto.randomBytes(10);
    expect(verifyQrToken(encodeQrToken({ ...who, jti, iat }, env.JWT_ACCESS_SECRET), NOW)).toBe('invalid');
    expect(verifyQrToken(encodeQrToken({ ...who, jti, iat }, 'x'.repeat(40)), NOW)).toBe('invalid');
    expect(verifyQrToken(encodeQrToken({ ...who, jti, iat }), NOW)).toMatchObject({ sub: who.sub, inst: who.inst });
  });
});

describe('QR token: a 256-bit signature compared with crypto.timingSafeEqual', () => {
  it('the signature is the full 32-byte (256-bit) HMAC, not truncated', () => {
    const { token } = signQrToken(who, NOW);
    expect(Buffer.from(token.split('.')[1]!, 'base64url')).toHaveLength(32);
  });

  it('verification compares the signature with crypto.timingSafeEqual (good and bad codes alike)', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    try {
      const { token } = signQrToken(who, NOW);
      expect(verifyQrToken(token, NOW)).not.toBe('invalid');
      const bad = token.slice(0, 60) + (token[60] === 'A' ? 'B' : 'A') + token.slice(61); // a changed MAC character
      expect(verifyQrToken(bad, NOW)).toBe('invalid');
      expect(spy).toHaveBeenCalledTimes(2);
      for (const [a, b] of spy.mock.calls) expect([(a as Buffer).length, (b as Buffer).length]).toEqual([43, 43]); // all 256 bits
    } finally {
      spy.mockRestore();
    }
  });
});

describe('QR token: tampering', () => {
  it('changing any one of the 96 characters, to any other character, is refused', () => {
    const { token } = signQrToken(who, NOW);
    let tried = 0;
    for (let i = 0; i < token.length; i++) {
      for (const c of B64URL + '.') {
        if (c === token[i]) continue;
        const t = token.slice(0, i) + c + token.slice(i + 1);
        expect(verifyQrToken(t, NOW)).toBe('invalid');
        tried++;
      }
    }
    expect(tried).toBe(96 * 64);
  });

  it('a different student, institution or issue time under the old signature is refused', () => {
    const { token } = signQrToken(who, NOW);
    const [b64, mac] = token.split('.') as [string, string];
    for (const offset of [1, 13, 25, 35]) { // sub, inst, jti, iat
      const body = Buffer.from(b64, 'base64url');
      body.writeUInt8(body.readUInt8(offset) ^ 0x01, offset);
      expect(verifyQrToken(`${body.toString('base64url')}.${mac}`, NOW)).toBe('invalid');
    }
  });

  it('wrong length or shape is refused before any signature work', () => {
    const { token } = signQrToken(who, NOW);
    expect(QR_TOKEN_LENGTH).toBe(96);
    for (const t of [token.slice(0, -1), token + 'A', token.replace('.', '_'), '', 'x'.repeat(96)]) expect(verifyQrToken(t, NOW)).toBe('invalid');
  });
});

describe('QR token: a random value in each code', () => {
  it('each code carries 10 random bytes (80 bits) as its jti: 2000 codes, 2000 different jtis', () => {
    const jtis = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const { token, jti } = signQrToken(who, NOW);
      expect(Buffer.from(jti, 'base64url')).toHaveLength(10);
      expect((verifyQrToken(token, NOW) as { jti: string }).jti).toBe(jti);
      jtis.add(jti);
    }
    expect(jtis.size).toBe(2000);
  });
});

describe('QR token: expiry', () => {
  it('lives 15 s from issue, with 5 s of clock skew; later it is "expired"', () => {
    const { token, expiresAt } = signQrToken(who, NOW);
    expect(expiresAt.getTime()).toBe(NOW + 15_000);
    expect(verifyQrToken(token, NOW + 20_999)).not.toBe('expired'); // 15 s + 5 s skew, same second
    expect(verifyQrToken(token, NOW + 21_000)).toBe('expired');
    expect(verifyQrToken(token, NOW + 60 * 60_000)).toBe('expired');
  });

  it('a code dated more than 5 s in the future is refused (not something we issued)', () => {
    const { token } = signQrToken(who, NOW + 6_000);
    expect(verifyQrToken(token, NOW)).toBe('invalid');
    expect(verifyQrToken(signQrToken(who, NOW + 5_000).token, NOW)).not.toBe('invalid');
  });
});
