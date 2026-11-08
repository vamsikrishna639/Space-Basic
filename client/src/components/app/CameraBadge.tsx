import { useRef, useState } from 'react';
import type { Me } from '@spacebasic/shared';
import { apiUpload, ApiError } from '../../api/client';
import { CutoutIcon } from '../CutoutIcon';
import s from './CameraBadge.module.css';

const TYPES = 'image/png,image/jpeg,image/webp';

/**
 * The approved camera badge (docs/ui-measurements.md §6): a 22 px #4A5CE6 disc with a 2 px ring in the card colour,
 * centred (+24, +24) from the avatar's centre, white camera cut-out in a 14 px box. Tapping it picks a photo and
 * uploads it (PUT /users/me/avatar, raw bytes, PNG/JPEG/WebP up to 1 MB).
 */
export function CameraBadge({ onUploaded, onError }: { onUploaded: (avatarUrl: Me['avatarUrl']) => void; onError: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const { avatarUrl } = await apiUpload<{ avatarUrl: string }>('/users/me/avatar', file);
      onUploaded(avatarUrl);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <button type="button" className={s.badge} aria-label="Change photo" aria-busy={busy} disabled={busy} onClick={() => input.current?.click()}>
        <CutoutIcon name="camera" size={14} />
      </button>
      <input
        ref={input}
        className={s.file}
        type="file"
        accept={TYPES}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
      />
    </>
  );
}
