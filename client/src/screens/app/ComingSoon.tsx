import type { ReactNode } from 'react';
import { PageHeader } from '../../components/app/PageHeader';
import s from './ComingSoon.module.css';

/**
 * The shared placeholder for modules without a screenshot yet (SPEC.md, Phase 1 scope): the standard header with
 * a back button and the module's title, and one centred line "Coming soon". Existing tokens only, both themes.
 */
export function ComingSoon({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={`app-screen ${s.screen}`}>
      <PageHeader title={title} />
      <p className={s.line}>Coming soon</p>
      {children}
    </div>
  );
}
