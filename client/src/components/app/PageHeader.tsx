import { useNavigate } from 'react-router';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import s from './PageHeader.module.css';

export function PageHeader({ title, backTo = '/home' }: { title: string; backTo?: string }) {
  const navigate = useNavigate();
  return (
    <header className={s.header}>
      <button type="button" className={s.back} aria-label="Back" onClick={() => (history.length > 1 ? navigate(-1) : navigate(backTo))}>
        <CaretLeftIcon size={18.01} weight="bold" aria-hidden="true" />
      </button>
      <h1 className={s.title}>{title}</h1>
    </header>
  );
}
