import { useId, type Ref } from 'react';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import s from './ConsentCard.module.css';

/** The consent text exactly as in the Sign in screenshots (SPEC.md, screen 2). */
export function ConsentCard({ checked, onChange, className, inputRef }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
  /** The checkbox, so a code link tapped before consent can move focus to it. */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  return (
    <div className={[s.card, className].filter(Boolean).join(' ')}>
      <span className={s.boxWrap}>
        <input ref={inputRef} id={id} type="checkbox" className={s.box} checked={checked} onChange={(e) => onChange(e.target.checked)} />
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
