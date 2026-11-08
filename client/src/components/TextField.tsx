import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import s from './TextField.module.css';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Right side of the label row (e.g. "Forgot password?"). */
  aside?: ReactNode;
  /** Inside the box, after the input (e.g. the show/hide password button). */
  trailing?: ReactNode;
  className?: string;
};

export function TextField({ label, aside, trailing, className, id, ...input }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={[s.field, className].filter(Boolean).join(' ')}>
      <div className={s.labelRow}>
        <label htmlFor={inputId}>{label}</label>
        {aside}
      </div>
      <div className={s.box}>
        <input id={inputId} className={s.input} {...input} />
        {trailing}
      </div>
    </div>
  );
}

export const trailingClass = s.trailing;
