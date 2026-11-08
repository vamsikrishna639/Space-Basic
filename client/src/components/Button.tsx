import type { ButtonHTMLAttributes } from 'react';
import s from './Button.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' };

export function Button({ variant = 'primary', className, type = 'button', ...rest }: Props) {
  return <button type={type} className={[s.button, s[variant], className].filter(Boolean).join(' ')} {...rest} />;
}
