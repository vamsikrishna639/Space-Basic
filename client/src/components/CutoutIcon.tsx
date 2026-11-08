// Vectorised cut-out icons (reference-ui/assets/icons/cutout/*.svg, approved; docs/ui-measurements.md §4).
// Each SVG uses fill="currentColor", so the colour always comes from the theme. The files are our own static
// assets, inlined at build time.
import bedWelcome from '@assets/icons/cutout/bed-welcome.svg?raw';
import utensilsCrossed from '@assets/icons/cutout/utensils-crossed.svg?raw';
import questionCircle from '@assets/icons/cutout/question-circle.svg?raw';
import video from '@assets/icons/cutout/video.svg?raw';
import bedRoom from '@assets/icons/cutout/bed-room.svg?raw';
import phone from '@assets/icons/cutout/phone.svg?raw';
import qrCode from '@assets/icons/cutout/qr-code.svg?raw';
import user from '@assets/icons/cutout/user.svg?raw';
import key from '@assets/icons/cutout/key.svg?raw';
import shieldCheck from '@assets/icons/cutout/shield-check.svg?raw';
import settings from '@assets/icons/cutout/settings.svg?raw';
import infoCircle from '@assets/icons/cutout/info-circle.svg?raw';
import logout from '@assets/icons/cutout/logout.svg?raw';
import camera from '@assets/icons/cutout/camera.svg?raw';
import accessibility from '@assets/icons/cutout/accessibility.svg?raw';
import gauge from '@assets/icons/cutout/gauge.svg?raw';
import trash from '@assets/icons/cutout/trash.svg?raw';

const ICONS = {
  'bed-welcome': bedWelcome, 'utensils-crossed': utensilsCrossed, 'question-circle': questionCircle, video,
  'bed-room': bedRoom, phone, 'qr-code': qrCode, user, key, 'shield-check': shieldCheck, settings,
  'info-circle': infoCircle, logout, camera, accessibility, gauge, trash,
} as const;
export type CutoutName = keyof typeof ICONS;

export function CutoutIcon({ name, size, className }: { name: CutoutName; size: number; className?: string }) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{ display: 'block', width: size, height: size, lineHeight: 0 }}
      // Trusted, build-time asset (no user input).
      dangerouslySetInnerHTML={{ __html: ICONS[name].replace('<svg ', '<svg width="100%" height="100%" ') }}
    />
  );
}
