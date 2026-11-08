import { useSyncExternalStore } from 'react';
import type { UnreadCount } from '@spacebasic/shared';
import { api } from '../api/client';

// The unread count shared by the tab-bar badge and the Notifications screen (opening a notification lowers it).

let count = 0;
const listeners = new Set<() => void>();

export function setUnread(n: number): void {
  const next = Math.max(0, n);
  if (next === count) return;
  count = next;
  for (const l of listeners) l();
}

export function changeUnread(delta: number): void {
  setUnread(count + delta);
}

export async function refreshUnread(): Promise<void> {
  try {
    setUnread((await api<UnreadCount>('GET', '/notifications/unread-count')).count);
  } catch {
    // Keep the last value: the badge is a hint, and the list itself still loads.
  }
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useUnreadCount(): number {
  return useSyncExternalStore(subscribe, () => count);
}
