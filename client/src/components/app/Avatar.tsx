import { useEffect, useState } from 'react';
import defaultAvatar from '@assets/avatar-default.png';
import { apiBlob } from '../../api/client';

/**
 * The user's photo, or the approved default avatar (reference-ui/assets/avatar-default.png, already a circle:
 * no border-radius, drawn on whole CSS pixels). The photo needs the Bearer token, so it's fetched and shown
 * through a blob URL (docs/api.md, Users).
 */
export function Avatar({ src, size, className }: { src: string | null; size: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!src) { setUrl(null); return; }
    let objectUrl: string | null = null;
    let cancelled = false;
    apiBlob(src)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { /* keep the default avatar */ });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  const photo = url !== null;
  return (
    <img
      className={className}
      src={url ?? defaultAvatar}
      alt=""
      width={size}
      height={size}
      style={{ display: 'block', width: size, height: size, borderRadius: photo ? '50%' : undefined, objectFit: 'cover' }}
    />
  );
}
