import { describe, expect, it } from 'vitest';
import { bundleId, deviceId, lastUpdatedLabel, makerFromModel, readDevice, shortVersion, UNKNOWN } from './deviceInfo';

describe('About this app', () => {
  it('builds the screenshot\'s bundle id and "Last updated" from one build time', () => {
    const b = { version: '11.1.1', time: '2026-11-03T08:22:55Z', sha: '57a23685' };
    expect(bundleId(b)).toBe('11.1.1-20261103-082255-57a23685');
    expect(lastUpdatedLabel(b.time, 'Asia/Kolkata')).toBe('3 Nov 2026, 1:52 PM');
    expect(lastUpdatedLabel('not a date')).toBe(UNKNOWN);
  });

  it('reads Android from client hints (as the screenshot: Android 16, realme RMX5003)', async () => {
    const d = await readDevice({
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K)',
      userAgentData: { platform: 'Android', getHighEntropyValues: async () => ({ platformVersion: '16.0.0', model: 'RMX5003' }) },
    });
    expect(d).toEqual({ os: 'Android', osVersion: '16', maker: 'realme', model: 'RMX5003' });
  });

  it('says "Unknown" for what the browser doesn\'t tell (a desktop has no model; reduced Android UA)', async () => {
    expect(await readDevice({ userAgent: 'x', userAgentData: { platform: 'Windows', getHighEntropyValues: async () => ({ platformVersion: '15.0.0', model: '' }) } }))
      .toEqual({ os: 'Windows', osVersion: '11', maker: UNKNOWN, model: UNKNOWN });
    expect(await readDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; K) Firefox' }))
      .toEqual({ os: 'Android', osVersion: '14', maker: UNKNOWN, model: UNKNOWN });
    expect(await readDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)' }))
      .toEqual({ os: 'iOS', osVersion: '17.4', maker: 'Apple', model: 'iPhone' });
  });

  it('only names a maker the model code is sure about', () => {
    expect(makerFromModel('SM-S918B')).toBe('Samsung');
    expect(makerFromModel('Pixel 8')).toBe('Google');
    expect(makerFromModel('CPH2449')).toBeNull(); // OPPO and OnePlus both use CPH
    expect(shortVersion('14.4.0')).toBe('14.4');
  });

  it('keeps one random 16-hex device id per install', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const id = deviceId(s);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(deviceId(s)).toBe(id);
  });
});
