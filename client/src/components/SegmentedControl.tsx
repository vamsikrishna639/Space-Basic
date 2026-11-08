import s from './SegmentedControl.module.css';

interface Option<T extends string> { value: T; label: string }

export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: {
  options: readonly Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={[s.track, className].filter(Boolean).join(' ')}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={s.option} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
