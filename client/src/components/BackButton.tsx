import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import s from './BackButton.module.css';

export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className={s.back} onClick={onClick} aria-label={label}>
      <CaretLeftIcon size={17.09} weight="bold" aria-hidden="true" style={{ transform: 'translateX(1px)' }} />
    </button>
  );
}
