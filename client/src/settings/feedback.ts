// Settings > Haptic feedback and Sounds (SPEC.md screen 9): both on by default, kept on this device. Screens call
// haptic() / chime() on taps and on success or failure (the warden scanner will use success / failure).
import { useSyncExternalStore } from 'react';

export type Pref = 'haptics' | 'sounds';
const KEYS: Record<Pref, string> = { haptics: 'sb.haptics', sounds: 'sb.sounds' };
const listeners = new Set<() => void>();

export function getPref(p: Pref): boolean {
  try { return localStorage.getItem(KEYS[p]) !== 'off'; } catch { return true; }
}

export function setPref(p: Pref, on: boolean): void {
  try { localStorage.setItem(KEYS[p], on ? 'on' : 'off'); } catch { /* private mode */ }
  for (const l of listeners) l();
}

export function usePref(p: Pref): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => getPref(p), () => true);
}

type Kind = 'tap' | 'success' | 'failure';
const PATTERNS: Record<Kind, number | number[]> = { tap: 10, success: [12, 40, 12], failure: [40, 60, 40] };

/** A short vibration, where the device supports it and the setting is on. */
export function haptic(kind: Kind = 'tap'): void {
  if (!getPref('haptics')) return;
  try { navigator.vibrate?.(PATTERNS[kind]); } catch { /* not supported */ }
}

let audio: AudioContext | null = null;

/** A short chime (two soft tones up for success, down for failure), generated: no sound files. */
export function chime(kind: 'success' | 'failure'): void {
  if (!getPref('sounds') || typeof AudioContext === 'undefined') return;
  try {
    audio ??= new AudioContext();
    const notes = kind === 'success' ? [660, 880] : [440, 330];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      const t = audio!.currentTime + i * 0.12;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(audio!.destination);
      o.start(t);
      o.stop(t + 0.2);
    });
  } catch { /* audio unavailable */ }
}
