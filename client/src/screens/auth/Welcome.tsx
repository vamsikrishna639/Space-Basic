import { useNavigate } from 'react-router';
import { WalletIcon } from '@phosphor-icons/react/dist/csr/Wallet';
import { ChatCircleDotsIcon } from '@phosphor-icons/react/dist/csr/ChatCircleDots';
import logoUrl from '@assets/logo-spacebasic-transparent.png';
import { Button } from '../../components/Button';
import { CutoutIcon } from '../../components/CutoutIcon';
import s from './Welcome.module.css';

/** Screen 1 (reference-ui/01-welcome.png). */
export function Welcome() {
  const navigate = useNavigate();
  return (
    <div className={`screen ${s.screen}`}>
      <header className={s.hero}>
        <span className={s.circle} aria-hidden="true" />
        <div className={s.pill}>
          <img className={s.logo} src={logoUrl} alt="" />
          <span className={s.wordmark}>spacebasic</span>
        </div>
        <div aria-hidden="true">
          <span className={`${s.badge} ${s.b1}`}><CutoutIcon name="bed-welcome" size={25} /></span>
          <span className={`${s.badge} ${s.b2}`}><CutoutIcon name="utensils-crossed" size={27} /></span>
          <span className={`${s.badge} ${s.b3}`}><WalletIcon size={29.57} weight="regular" /></span>
          <span className={`${s.badge} ${s.b4}`}><ChatCircleDotsIcon size={28.14} weight="regular" /></span>
        </div>
      </header>

      <main className={s.copy}>
        <h1 className={s.headline}>Seamless campus living.</h1>
        <p className={s.lead}>Hostel, mess, fees and requests — in one app.</p>
      </main>

      <footer className={s.actions}>
        <Button variant="primary" onClick={() => navigate('/sign-in/email')}>Continue with email</Button>
        <Button variant="outline" className={s.second} onClick={() => navigate('/sign-in/mobile')}>Continue with mobile</Button>
        <p className={s.legal}>
          <a href="/privacy-policy">Privacy Policy</a> <span className={s.dot}>·</span> <a href="/terms">Terms &amp; Conditions</a>
        </p>
      </footer>
    </div>
  );
}
