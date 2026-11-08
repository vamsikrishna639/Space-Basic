import { useEffect, useState, type ReactNode } from 'react';
import { PhoneIcon } from '@phosphor-icons/react/dist/csr/Phone';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react/dist/csr/EnvelopeSimple';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import type { FaqItem, SupportContact, SupportContacts } from '@spacebasic/shared';
import { api, ApiError } from '../../api/client';
import { PageHeader } from '../../components/app/PageHeader';
import { contactActions, groupFaqs } from './supportText';
import s from './SupportLists.module.css';

// "Contact us" and "Common questions", opened from Help. No screenshots: built from the standard header (Settings),
// Home's section labels and the card style (docs/not-from-reference.md).

type Load<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'error'; message: string };

function useGet<T>(path: string): Load<T> {
  const [load, setLoad] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    api<T>('GET', path)
      .then((data) => { if (live) setLoad({ state: 'ready', data }); })
      .catch((err: unknown) => {
        if (live) setLoad({ state: 'error', message: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.' });
      });
    return () => { live = false; };
  }, [path]);
  return load;
}

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={`app-screen ${s.screen}`}>
      <PageHeader title={title} backTo="/support" />
      <div className={s.body}>{children}</div>
    </div>
  );
}

function ContactGroup({ label, contacts }: { label: string; contacts: SupportContact[] }) {
  if (contacts.length === 0) return null;
  return (
    <section aria-label={label}>
      <h2 className={s.section}>{label}</h2>
      <ul className={s.card}>
        {contacts.map((c) => (
          <li key={c.id} className={s.contact}>
            <span className={s.label}>{c.label}</span>
            {c.hours && <span className={s.hours}>{c.hours}</span>}
            <span className={s.actions}>
              {contactActions(c).map((a) => (
                <a key={a.kind} className={s.action} href={a.href}>
                  {a.kind === 'phone' ? <PhoneIcon size={15} aria-hidden="true" /> : <EnvelopeSimpleIcon size={15.2} aria-hidden="true" />}
                  {a.text}
                </a>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** /support/contact: hostel office contacts, then SpaceBasic's. */
export function ContactUs() {
  const load = useGet<SupportContacts>('/support/contacts');
  return (
    <Screen title="Contact us">
      {load.state === 'error' && <p className={s.note} role="alert">{load.message}</p>}
      {load.state === 'ready' && (
        load.data.hostelOffice.length + load.data.spacebasic.length === 0
          ? <p className={s.note}>No contacts yet</p>
          : (
            <>
              <ContactGroup label="Hostel office" contacts={load.data.hostelOffice} />
              <ContactGroup label="SpaceBasic" contacts={load.data.spacebasic} />
            </>
          )
      )}
    </Screen>
  );
}

/** /support/faqs: published questions by category; a question opens to show its answer. */
export function CommonQuestions() {
  const load = useGet<FaqItem[]>('/support/faqs');
  return (
    <Screen title="Common questions">
      {load.state === 'error' && <p className={s.note} role="alert">{load.message}</p>}
      {load.state === 'ready' && load.data.length === 0 && <p className={s.note}>No questions yet</p>}
      {load.state === 'ready' && groupFaqs(load.data).map((g) => (
        <section key={g.category} aria-label={g.label}>
          <h2 className={s.section}>{g.label}</h2>
          <ul className={s.card}>
            {g.items.map((f) => (
              <li key={f.id} className={s.faq}>
                <details>
                  <summary className={s.question}>
                    <span>{f.question}</span>
                    <CaretRightIcon className={s.caret} size={14.77} weight="bold" aria-hidden="true" />
                  </summary>
                  <p className={s.answer}>{f.answer}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Screen>
  );
}
