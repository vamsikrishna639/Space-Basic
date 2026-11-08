import { useId } from 'react';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import s from './ConsentCard.module.css';

/** The consent text exactly as in the Sign in screenshots (SPEC.md, screen 2). */
export function ConsentCard({ checked, onChange, className }: { checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  const id = useId();
  return (
    <div className={[s.card, className].filter(Boolean).join(' ')}>
      <span className={s.boxWrap}>
        <input id={id} type="checkbox" className={s.box} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {checked && (
          <span className={s.tick} aria-hidden="true">
            <CheckIcon size={12} weight="bold" />
          </span>
        )}
      </span>
      <label htmlFor={id} className={s.text}>
        I allow <span className={s.brand}>SpaceBasic</span> to collect and use my personal data for hostel management under DPDPA
        2023, as described in our Privacy Policy. SpaceBasic acts as a data processor. Withdraw anytime via Settings.
      </label>
    </div>
  );
}
