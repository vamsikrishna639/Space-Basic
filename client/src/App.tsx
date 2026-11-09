import { createBrowserRouter, Navigate, Outlet, RouterProvider, useParams } from 'react-router';
import { MODULE_KEYS, MODULES, type ModuleKey } from '@spacebasic/shared';
import { AuthProvider, useAuth, useMe } from './auth/AuthContext';
import { areasFor, landingFor, type Area } from './auth/areas';
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
import { ChangePassword, PrivacyConsent } from './screens/profile/AccountScreens';
import { Settings } from './screens/settings/Settings';
import { ChooseArea, NoAccess } from './screens/app/ChooseArea';
import { AdminHome, ADMIN_NAV, WardenHome } from './screens/staff/StaffHomes';
import { StaffSoon } from './screens/staff/StaffLayout';
import { UsersList } from './screens/admin/users/UsersList';
import { AddUser, EditUser } from './screens/admin/users/UserEditor';
import { ImportUsers } from './screens/admin/users/ImportUsers';
import { HostelPage } from './screens/admin/hostel/HostelPage';

/**
 * Signed-out area: Welcome, Sign in, the code screen and Forgot password. A signed-in user goes to their own app:
 * students to Home, wardens and admins to theirs, two roles to "Continue as" (auth/areas.ts).
 */
function PublicOnly() {
  const { status, me } = useAuth();
  if (status === 'loading') return <div className="screen" aria-busy="true" />;
  return status === 'signedIn' && me ? <Navigate to={landingFor(me)} replace /> : <Outlet />;
}

/** Signed-in area. While the session is being restored (the API may be waking up), a plain page shows. */
function RequireAuth() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="app-screen" aria-busy="true" />;
  return status === 'signedIn' ? <Outlet /> : <Navigate to="/" replace />;
}

/**
 * One app per role: a route outside the user's areas sends them to their own landing page. This only decides what
 * is SHOWN; the server refuses the data anyway (server/src/test/role-separation.test.ts).
 */
function RequireArea({ area }: { area: Area }) {
  const me = useMe();
  return areasFor(me.roles).includes(area) ? <Outlet /> : <Navigate to={landingFor(me)} replace />;
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
      // ---- student app (strict pixel-perfect screens) ----
      {
        element: <RequireArea area="student" />,
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
          { path: '/profile/password', element: <ChangePassword /> },
          { path: '/profile/privacy', element: <PrivacyConsent /> },
          { path: '/settings', element: <Settings /> },
          { path: '/settings/accessibility', element: <ComingSoon title="Accessibility" /> },
          { path: '/settings/connection', element: <ComingSoon title="Check connection" /> },
          { path: '/about', element: <ComingSoon title="About" /> },
          { path: '/support/faqs', element: <CommonQuestions /> },
          { path: '/m/:module', element: <ModuleScreen /> },
        ],
      },
      // ---- warden app (free design, phone-first) ----
      {
        element: <RequireArea area="warden" />,
        children: [
          { path: '/warden', element: <WardenHome /> },
          { path: '/warden/scan', element: <StaffSoon area="warden" title="Scan entry passes" back="/warden" /> },
          { path: '/warden/attendance', element: <StaffSoon area="warden" title="Today's attendance" back="/warden" /> },
          { path: '/warden/lookup', element: <StaffSoon area="warden" title="Find a student or room" back="/warden" /> },
          { path: '/warden/*', element: <Navigate to="/warden" replace /> },
        ],
      },
      // ---- admin app (free design, desktop-friendly) ----
      {
        element: <RequireArea area="admin" />,
        children: [
          { path: '/admin', element: <AdminHome /> },
          { path: '/admin/users', element: <UsersList /> },
          { path: '/admin/users/new', element: <AddUser /> },
          { path: '/admin/users/import', element: <ImportUsers /> },
          { path: '/admin/users/:id', element: <EditUser /> },
          { path: '/admin/hostel', element: <HostelPage /> },
          { path: '/admin/support', element: <StaffSoon area="admin" title="Support" nav={ADMIN_NAV} /> },
          { path: '/admin/audit', element: <StaffSoon area="admin" title="Audit log" nav={ADMIN_NAV} /> },
          { path: '/admin/*', element: <Navigate to="/admin" replace /> },
        ],
      },
      // ---- every signed-in user ----
      { path: '/choose', element: <ChooseArea /> },
      { path: '/no-access', element: <NoAccess /> },
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
