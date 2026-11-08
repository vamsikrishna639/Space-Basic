// Settings > "About this app" values (SPEC.md screen 9; decisions.md 2026-11-07: "Unknown" when a value can't be
// read; the device ID is random per install). Everything comes from the build and the real device, never typed in.

export const UNKNOWN = 'Unknown';

export interface BuildStamp { version: string; time: string; sha: string }

/** "11.1.1-20261103-082255-57a23685": version, build date and time (UTC), commit. */
export function bundleId(b: BuildStamp): string {
  const t = new Date(b.time);
  if (Number.isNaN(t.getTime())) return `${b.version}-${b.sha}`;
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}`;
  const time = `${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
  return `${b.version}-${date}-${time}-${b.sha}`;
}

/** "3 Nov 2026, 1:52 PM" in the phone's time zone (the screenshot's format: no leading zero, upper-case PM). */
export function lastUpdatedLabel(iso: string, timeZone?: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return UNKNOWN;
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(t);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(t);
  return `${date.replace('Sept', 'Sep')}, ${time.replace(/ /g, ' ')}`;
}

export interface DeviceInfo { os: string; osVersion: string; maker: string; model: string }

/** "16.0.0" -> "16", "14.4.0" -> "14.4". */
export function shortVersion(v: string): string {
  return v.replace(/(\.0+)+$/, '') || v;
}

/**
 * The maker, from the model code where the code says it unambiguously. Browsers don't expose the manufacturer
 * (the screenshot's app is native), so anything else is "Unknown".
 */
export function makerFromModel(model: string): string | null {
  const rules: [RegExp, string][] = [
    [/^RMX\d/i, 'realme'],
    [/^SM-[A-Z]\d/i, 'Samsung'],
    [/^Pixel\b/i, 'Google'],
    [/^moto\b/i, 'Motorola'],
    [/^Nokia\b/i, 'Nokia'],
    [/^(iPhone|iPad|Macintosh)/, 'Apple'],
  ];
  return rules.find(([re]) => re.test(model))?.[1] ?? null;
}

interface UaData { platform?: string; getHighEntropyValues?: (hints: string[]) => Promise<{ platformVersion?: string; model?: string }> }

/** OS, version, maker and model: User-Agent Client Hints where the browser has them, otherwise the UA string. */
export async function readDevice(nav: { userAgent: string; userAgentData?: UaData } = navigator as never): Promise<DeviceInfo> {
  const out: DeviceInfo = { os: UNKNOWN, osVersion: UNKNOWN, maker: UNKNOWN, model: UNKNOWN };
  const ua = nav.userAgent;
  const ch = nav.userAgentData;
  if (ch?.platform) {
    out.os = ch.platform === 'macOS' ? 'macOS' : ch.platform;
    try {
      const hv = await ch.getHighEntropyValues?.(['platformVersion', 'model']);
      if (hv?.platformVersion) {
        // Windows reports its internal version: 13 and above is Windows 11.
        out.osVersion = ch.platform === 'Windows' ? (parseInt(hv.platformVersion, 10) >= 13 ? '11' : '10') : shortVersion(hv.platformVersion);
      }
      if (hv?.model) out.model = hv.model;
    } catch { /* hints refused: keep what we have */ }
  } else {
    const ios = /(iPhone|iPad|iPod).*? OS (\d+)_(\d+)/.exec(ua);
    const android = /Android (\d+(?:\.\d+)*)/.exec(ua);
    if (ios) { out.os = 'iOS'; out.osVersion = `${ios[2]}.${ios[3]}`; out.model = ios[1]!; }
    else if (android) { out.os = 'Android'; out.osVersion = shortVersion(android[1]!); }
    else if (/Mac OS X/.test(ua)) out.os = 'macOS';
    else if (/Windows/.test(ua)) out.os = 'Windows';
    else if (/Linux/.test(ua)) out.os = 'Linux';
  }
  if (out.model !== UNKNOWN) out.maker = makerFromModel(out.model) ?? UNKNOWN;
  return out;
}

const DEVICE_ID_KEY = 'sb.deviceId';
let sessionId: string | null = null;

/** 16 hex characters, random per install, kept in this browser (a new one after "Clear stored data"). */
export function deviceId(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): string {
  try {
    const v = storage?.getItem(DEVICE_ID_KEY);
    if (v && /^[0-9a-f]{16}$/.test(v)) return v;
  } catch { /* unavailable */ }
  const id = sessionId ?? Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  sessionId = id;
  try { storage?.setItem(DEVICE_ID_KEY, id); } catch { /* private mode: this session only */ }
  return id;
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export const BUILD: BuildStamp = { version: __APP_VERSION__, time: __BUILD_TIME__, sha: __BUILD_SHA__ };
