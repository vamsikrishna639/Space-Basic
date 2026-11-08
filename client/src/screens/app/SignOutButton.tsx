import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';

/**
 * TEMPORARY (docs/not-from-reference.md): a way to sign out until the real My Profile screen with its
 * "Sign Out" button is built at a later checkpoint.
 */
export function SignOutButton() {
  const { logout } = useAuth();
  return (
    <div style={{ padding: '0 var(--in-gutter) calc(110px + var(--safe-bottom))' }}>
      <Button variant="outline" onClick={() => void logout()}>Sign Out</Button>
    </div>
  );
}
