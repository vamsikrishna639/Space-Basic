import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import type { NotificationItem, Page } from '@spacebasic/shared';
import { api, ApiError } from '../../api/client';
import { useMe } from '../../auth/AuthContext';
import { changeUnread, refreshUnread } from '../../notifications/unread';
import { groupByDay, linkPath, timeLabel } from './notificationsText';
import s from './Notifications.module.css';

const PAGE_SIZE = 20;

type Load = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string };

/**
 * Screen 5 (reference-ui/05-notifications.png). Newest first, grouped by day; an unread row has a blue dot and a
 * brighter title. Opening a row marks it read and follows its deep link (ComingSoon until that module exists).
 * More rows load when the end of the list scrolls into view.
 */
export function Notifications() {
  const me = useMe();
  const navigate = useNavigate();
  const enabled = me.institution.enabledModules.includes('notifications');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>(enabled ? { state: 'loading' } : { state: 'ready' });
  const busy = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (after: string | null) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const q = new URLSearchParams({ limit: String(PAGE_SIZE), ...(after ? { cursor: after } : {}) });
      const page = await api<Page<NotificationItem>>('GET', `/notifications?${q}`);
      setItems((prev) => (after ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setLoad({ state: 'ready' });
    } catch (err) {
      setLoad({ state: 'error', message: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void fetchPage(null);
    void refreshUnread();
  }, [enabled, fetchPage]);

  // Infinite scroll: the next page loads as the end of the list comes near.
  useEffect(() => {
    const el = end.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void fetchPage(cursor);
    }, { rootMargin: '0px 0px 400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, fetchPage]);

  function open(item: NotificationItem) {
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt } : n)));
      changeUnread(-1);
      api<void>('POST', `/notifications/${item.id}/read`).catch(() => void refreshUnread());
    }
    const to = linkPath(item);
    if (to) navigate(to);
  }

  const groups = groupByDay(items);
  return (
    <div className={`app-screen ${s.screen}`}>
      <header className={s.header}>
        <h1 className={s.title}>Notifications</h1>
      </header>

      {groups.map((g) => (
        <section key={g.key} aria-label={g.heading}>
          <h2 className={s.day}>{g.heading}</h2>
          <ul className={s.list}>
            {g.items.map((n) => (
              <li key={n.id} className={s.item}>
                <button type="button" className={n.readAt ? s.row : `${s.row} ${s.unread}`} onClick={() => open(n)}>
                  {!n.readAt && <span className={s.dot} aria-label="Unread" />}
                  <span className={s.rowTitle}>{n.title}</span>
                  <span className={s.time}>{timeLabel(new Date(n.createdAt))}</span>
                  <CaretRightIcon className={s.chevron} size={14.77} weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {load.state === 'ready' && items.length === 0 && <p className={s.note}>No notifications yet</p>}
      {load.state === 'error' && items.length === 0 && <p className={s.note} role="alert">{load.message}</p>}
      <div ref={end} aria-hidden="true" />
    </div>
  );
}
