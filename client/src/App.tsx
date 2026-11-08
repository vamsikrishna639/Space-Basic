import { createBrowserRouter, Navigate, Outlet, RouterProvider, useParams } from 'react-router';
import { MODULE_KEYS, MODULES, type ModuleKey } from '@spacebasic/shared';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { TabBar } from './components/app/TabBar';
import { Welcome } from './screens/auth/Welcome';
import { SignIn } from './screens/auth/SignIn';
import { OtpEntry } from './screens/auth/OtpEntry';
import { ForgotPassword, ResetPassword } from './screens/auth/ForgotPassword';
import { Home } from './screens/home/Home';
import { Notifications } from './screens/notifications/Notifications';
import { Help } from './screens/support/Help';
import { CommonQuestions, ContactUs } from './screens/support/SupportLists';
import { ComingSoon } from './screens/app/ComingSoon';
import { Profile } from './screens/profile/Profile';
import { EntryPass } from './screens/profile/EntryPass';

/** Signed-out area: Welcome, Sign in, the code screen and Forgot password. A signed-in user goes straight to Home. */
function PublicOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="screen" aria-busy="true" />;
  return status === 'signedIn' ? <Navigate to="/home" replace /> : <Outlet />;
}

/** Signed-in area. While the session is being restored (the API may be waking up), a plain page shows. */
function RequireAuth() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="app-screen" aria-busy="true" />;
  return status === 'signedIn' ? <Outlet /> : <Navigate to="/" replace />;
}

/** Tab screens share the bottom tab bar. */
function Tabs() {
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  );
}

function ModuleScreen() {
  const { module } = useParams();
  if (!MODULE_KEYS.includes(module as ModuleKey)) return <Navigate to="/home" replace />;
  return <ComingSoon title={MODULES[module as ModuleKey].title} />;
}

const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: '/', element: <Welcome /> },
      // '/sign-in/code' is a static segment, so it ranks above ':method'.
      { path: '/sign-in/code', element: <OtpEntry /> },
      { path: '/sign-in/:method', element: <SignIn /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/forgot-password/code', element: <ResetPassword /> },
      { path: '/sign-in', element: <Navigate to="/sign-in/email" replace /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Tabs />,
        children: [
          { path: '/home', element: <Home /> },
          { path: '/notifications', element: <Notifications /> },
          { path: '/support', element: <Help /> },
          // The Entry Pass is a sheet over My Profile, so the profile stays rendered under it.
          { path: '/profile', element: <Profile />, children: [{ path: 'entry-pass', element: <EntryPass /> }] },
        ],
      },
      { path: '/support/contact', element: <ContactUs /> },
      // My Profile rows whose screens come at later checkpoints (docs/not-from-reference.md).
      { path: '/profile/information', element: <ComingSoon title="My Information" /> },
      { path: '/profile/password', element: <ComingSoon title="Change Password" /> },
      { path: '/profile/privacy', element: <ComingSoon title="Privacy & Consent" /> },
      { path: '/settings', element: <ComingSoon title="Settings" /> },
      { path: '/about', element: <ComingSoon title="About" /> },
      { path: '/support/faqs', element: <CommonQuestions /> },
      { path: '/m/:module', element: <ModuleScreen /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
