// Vectorised cut-out icons (reference-ui/assets/icons/cutout/*.svg, approved; docs/ui-measurements.md §4).
// Each SVG uses fill="currentColor", so the colour always comes from the theme. The files are our own static
// assets, inlined at build time.
import bedWelcome from '@assets/icons/cutout/bed-welcome.svg?raw';
import utensilsCrossed from '@assets/icons/cutout/utensils-crossed.svg?raw';
import questionCircle from '@assets/icons/cutout/question-circle.svg?raw';
import video from '@assets/icons/cutout/video.svg?raw';

const ICONS = { 'bed-welcome': bedWelcome, 'utensils-crossed': utensilsCrossed, 'question-circle': questionCircle, video } as const;
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
