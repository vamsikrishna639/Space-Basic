import { useState, type Ref } from 'react';
import { CODE_LENGTH, sanitizeCode } from './codeValue';
import s from './CodeInput.module.css';

interface Props {
  value: string;
  onChange: (code: string) => void;
  /** Called once the fourth digit is in. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Four-digit code entry (no screenshot: docs/not-from-reference.md). One real input, so paste, SMS autofill
 * (autocomplete="one-time-code") and screen readers all see a single field; the four boxes only display it.
 * Box style is the text-field box (fill, 2 device px ring, 14 px radius, primary ring on focus).
 */
export function CodeInput({ value, onChange, onComplete, disabled, className, inputRef }: Props) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, CODE_LENGTH - 1);
  return (
    <div className={[s.wrap, className].filter(Boolean).join(' ')}>
      <input
        ref={inputRef}
        className={s.input}
        aria-label="Four-digit code"
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        value={value}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const code = sanitizeCode(e.target.value);
          onChange(code);
          if (code.length === CODE_LENGTH && code !== value) onComplete?.(code);
        }}
      />
      {Array.from({ length: CODE_LENGTH }, (_, i) => (
        <div key={i} aria-hidden="true" className={[s.box, focused && i === active ? s.focus : ''].filter(Boolean).join(' ')}>
          {value[i] ?? ''}
        </div>
      ))}
    </div>
  );
}
