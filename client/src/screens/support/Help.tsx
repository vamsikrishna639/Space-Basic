import { Link } from 'react-router';
import { PhoneIcon } from '@phosphor-icons/react/dist/csr/Phone';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { CutoutIcon } from '../../components/CutoutIcon';
import s from './Help.module.css';

/**
 * Screen 6 (reference-ui/06-contact-support.png): the Support tab. "Contact us" opens the hostel office and
 * SpaceBasic contacts, "Common questions" the FAQ list (neither has a screenshot: docs/not-from-reference.md).
 */
export function Help() {
  return (
    <div className={`app-screen ${s.screen}`}>
      <header className={s.header}>
        <h1 className={s.title}>Help</h1>
      </header>
      <p className={s.sub}>Answers to the questions that come up most, and a person for everything else.</p>

      <Link to="/support/contact" className={s.contact}>
        <span className={s.phoneTile}><PhoneIcon size={24.42} weight="fill" aria-hidden="true" /></span>
        <span className={s.text}>
          <span className={s.contactTitle}>Contact us</span>
          <span className={s.contactSub}>Reach your hostel office or SpaceBasic.</span>
        </span>
        <ArrowRightIcon className={s.arrow} size={16} weight="bold" aria-hidden="true" />
      </Link>

      <Link to="/support/faqs" className={s.faq}>
        <span className={s.questionTile}><CutoutIcon name="question-circle" size={18} /></span>
        <span className={s.text}>
          <span className={s.faqTitle}>Common questions</span>
          <span className={s.faqSub}>Leave, tickets, announcements and signing in</span>
        </span>
        <CaretRightIcon className={s.chevron} size={14.77} weight="bold" aria-hidden="true" />
      </Link>

      <p className={s.video}>
        <CutoutIcon name="video" size={18} />
        Video tutorials are on the way.
      </p>
    </div>
  );
}
