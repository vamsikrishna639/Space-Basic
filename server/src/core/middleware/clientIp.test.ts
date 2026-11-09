import express from 'express';
import request from 'supertest';
import { clientIp, headerIp } from './clientIp';
import { parseEnv } from '../../config/env';
import type { ClientIpHeader } from '../../config/env';

function appWith(header: ClientIpHeader | undefined, trustProxy = 0) {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.use(clientIp(header));
  app.get('/ip', (req, res) => { res.json({ ip: req.ip }); });
  return app;
}

describe('caller address (CLIENT_IP_HEADER)', () => {
  it('uses the named header, ignoring X-Forwarded-For', async () => {
    const res = await request(appWith('x-real-ip', 4)).get('/ip')
      .set('X-Forwarded-For', '203.0.113.7, 198.51.100.1, 198.51.100.2, 198.51.100.3').set('X-Real-IP', '198.51.100.20');
    expect(res.body.ip).toBe('198.51.100.20');
  });

  it('takes the first address of a list and accepts IPv6', async () => {
    expect((await request(appWith('x-vercel-forwarded-for')).get('/ip').set('X-Vercel-Forwarded-For', '2001:db8::5, 198.51.100.1')).body.ip).toBe('2001:db8::5');
  });

  it('falls back to the TRUST_PROXY address when the header is missing or not an address', async () => {
    const app = appWith('x-real-ip', 1);
    expect((await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.30')).body.ip).toBe('198.51.100.30');
    expect((await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.30').set('X-Real-IP', 'not-an-ip')).body.ip).toBe('198.51.100.30');
  });

  it('ignores the headers when no CLIENT_IP_HEADER is set', async () => {
    const res = await request(appWith(undefined)).get('/ip').set('X-Real-IP', '198.51.100.20');
    expect(res.body.ip).not.toBe('198.51.100.20');
  });

  it('headerIp rejects anything that is not one address', () => {
    expect(headerIp(undefined)).toBeUndefined();
    expect(headerIp('')).toBeUndefined();
    expect(headerIp('example.com')).toBeUndefined();
    expect(headerIp(' 203.0.113.9 ')).toBe('203.0.113.9');
  });

  it('CLIENT_IP_HEADER accepts only headers a proxy sets itself', () => {
    expect(parseEnv({ CLIENT_IP_HEADER: 'X-Real-IP' }).CLIENT_IP_HEADER).toBe('x-real-ip');
    expect(parseEnv({ CLIENT_IP_HEADER: '' }).CLIENT_IP_HEADER).toBeUndefined();
    expect(() => parseEnv({ CLIENT_IP_HEADER: 'x-forwarded-for' })).toThrow(/CLIENT_IP_HEADER/);
  });
});
