import lamps from '@assets/seasonal/diwali-lamps.png';
import lampSmall from '@assets/seasonal/diwali-lamp-small.png';
import d from './DiwaliHome.module.css';

/*
 * Seasonal Home, Diwali (reference-ui/home-diwali-dark.png; switch in config/seasonal.ts). Only the differences from
 * the normal Home live here: the header's class, the lamp row and the greeting card. Measurements:
 * docs/ui-measurements.md §10a. The lamp images are raster cut-outs of the screenshot (approved), written by
 * tools/ui-analysis/src/diwali-assets.ts, drawn 1:1 at DPR 3.
 */

/** Added to the normal header's class: the purple gradient and the taller header. */
export const diwaliHeaderClass = d.header;

/** Added to the first section label after the card (it sits closer to the card than to the header). */
export const diwaliAfterCardClass = d.afterCard;

/** The six lamps along the bottom edge of the header (one strip: the flames differ lamp to lamp). */
export function DiwaliLamps() {
  return <img className={d.lamps} src={lamps} alt="" aria-hidden="true" draggable={false} />;
}

/** "Happy Diwali, {first name as the greeting shows it}". */
export function DiwaliGreeting({ name }: { name: string }) {
  return (
    <section className={d.card} aria-labelledby="diwali-greeting">
      <span className={d.tile} aria-hidden="true">
        <img className={d.tileLamp} src={lampSmall} alt="" draggable={false} />
      </span>
      <div className={d.text}>
        <h2 id="diwali-greeting" className={d.title}>Happy Diwali, {name}</h2>
        <p className={d.line}>Wishing you light, joy and a safe celebration.</p>
      </div>
    </section>
  );
}
